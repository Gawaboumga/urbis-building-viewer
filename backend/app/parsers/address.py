
import re
import unicodedata
from typing import Any

from sqlalchemy import func, or_, and_, select
from sqlalchemy.orm import Session

from app.core.models import Address, Municipality, Street
from app.enums.language import Language
from app.schemas import requests, responses

ACCEPT_THRESHOLD = 0.55       # minimum score to accept a single best match
DEFAULT_CANDIDATE_LIMIT = 400 # cap DB candidate pool before Python-side scoring
DEFAULT_TOPK = 15

# ---------------------------
# Normalization utilities
# ---------------------------

_ABBR = {
    # French / bilingual
    re.compile(r'\bav\.?'): 'avenue',
    re.compile(r'\bbd\.?'): 'boulevard',
    re.compile(r'\bblvd\.?'): 'boulevard',
    re.compile(r'\bch\.?'): 'chaussee',
    re.compile(r'\bchauss[ée]e\b'): 'chaussee',
    re.compile(r'\brte\b'): 'route',
    re.compile(r'\bpl\.?'): 'place',
    re.compile(r'\bst\b'): 'saint',
    re.compile(r'\bste\b'): 'sainte',
    # Dutch
    re.compile(r'\b(\w+)str\.?'): r'\1straat',
    re.compile(r'\b(\w+)ln\.?'): r'\1laan',
    re.compile(r'\b(\w+)stwg'): r'\1steenweg',
    re.compile(r'\b(\w+)steenw?g'): r'\1steenweg',
    re.compile(r'\b(\w+)pl\.?'): r'\1plein',
}

_BOX_PATTERNS = [
    r'\bbox[\.]?\s*([A-Z0-9\-]+)\b',
    r'\bbo[îi]te\s*([A-Z0-9\-]+)\b',
    r'\bbus\s*([A-Z0-9\-]+)\b',
    r'\bbte\s*([A-Z0-9\-]+)\b',
]

_WHITESPACE_PATTERN = re.compile(r'\s+')

def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def _norm(s: str) -> str:
    s0 = _strip_accents(s.lower())
    for pat, repl in _ABBR.items():
        s0 = pat.sub(repl, s0)
    s0 = _WHITESPACE_PATTERN.sub(' ', s0).strip()
    return s0

def _canonical_municipality(s: str | None) -> str | None:
    if not s:
        return None
    return _norm(s)

# ---------------------------
# Parse free-text address
# ---------------------------

_ADDR_RE = re.compile(r"""
    ^\s*
    (?P<street>.+?)                          # street part
    [,\s]+
    (?P<number>\d+[A-Za-z]?)                 # house number
    (?:\s*(?:-|/)\s*(?P<number2>\d+))?       # optional range (ignored)
    (?:\s*(?P<box>(?:box|bo[iî]te|bus|bte)\s*[A-Z0-9\-]+))?  # optional box/bus/bte
    [,\s]*
    (?:(?P<postal_code>\d{4})\s*)?               # optional ZIP
    (?P<municipality>[A-Za-z\-\s\'\.]+)?          # optional municipality
    \s*$
""", re.IGNORECASE | re.VERBOSE)

def parse_address(text: str) -> dict[str, str | None]:
    t = _WHITESPACE_PATTERN.sub(' ', text).strip()
    m = _ADDR_RE.match(t)

    street = number = postal_code = municipality = box = None

    if m:
        street  = _norm(m.group('street') or '')
        number  = (m.group('number') or '').replace(' ', '')
        postal_code = (m.group('postal_code') or '') or None
        municipality = _canonical_municipality((m.group('municipality') or '').strip() or None)
        # Extract box (from the named group or anywhere)
        box_text = m.group('box') or ''
        if box_text:
            for pat in _BOX_PATTERNS:
                bx = re.search(pat, box_text, flags=re.IGNORECASE)
                if bx: box = bx.group(1).upper(); break

    if not postal_code:
        z = re.search(r'\b(\d{4})\b', t)
        if z: postal_code = z.group(1)

    return {'street': street or None, 'number': number or None,
            'postal_code': postal_code or None, 'municipality': municipality or None,
            'box': box or None, 'query': text}

# ---------------------------
# DTOs
# ---------------------------


# ---------------------------
# Candidate retrieval (no FTS)
# ---------------------------

def _street_token_filters(street_norm: str, language: Language) -> list[Any]:
    """Build AND filters across distinctive tokens with ILIKE contains."""
    if not street_norm:
        return []
    tokens = [tok for tok in re.split(r'[\s\-]+', street_norm) if len(tok) >= 3]
    if not tokens:
        return []

    # Often the last token is the distinctive one in BE street names (e.g., 'Loi', 'Louise', 'Ninove').
    # We still AND all tokens to keep precision without FTS.
    def ilike(token):
        if language == Language.FR:
            return Street.cleaned_street_name_french.like(f'%{token}%')
        elif language == Language.NL:
            return Street.cleaned_street_name_dutch.like(f'%{token}%')
        else:
            return or_(Street.cleaned_street_name_french.like(f"%{token}%"),
                Street.cleaned_street_name_dutch.like(f"%{token}%"))

    filters = [
        and_(ilike(tok))
        for tok in tokens
    ]
    return filters

async def fetch_candidates(session: Session,
                     parsed: dict[str, str | None],
                     language: Language,
                     limit_each: int = DEFAULT_CANDIDATE_LIMIT) -> list[responses.AddressResult]:
    """
    Gather candidate rows using only LIKE/ILIKE-compatible expressions:
    - street tokens (FR or NL)
    - optional postal_code
    - optional police_number (exact or prefix)
    - optional box_number
    """
    street = parsed['street'] or ""
    postal_code = parsed['postal_code']
    municipality = parsed['municipality']
    number  = parsed['number']
    box     = parsed['box']

    if all(map(lambda x: x is None, [postal_code, municipality, number, box])) and (street is None or street == ''):
        street = parsed['query']

    street_join = select(Address, Street, Municipality) \
        .join(Street, Street.street_id == Address.street_id) \
        .join(Municipality, Municipality.municipality_id == Address.municipality_id)
    if number:
        # Prefer exact or prefix match; avoids leading % (better for indexes)
        street_join = street_join.where(Address.police_number.like(f"{number}%"))

    if postal_code:
        street_join = street_join.where(Address.postal_code == int(postal_code))

    if box:
        street_join = street_join.where(func.lower(Address.box_number) == box.lower())

    # Build street filter via join
    street_filters = _street_token_filters(street, language)

    if street_filters:
        for f in street_filters:
            street_join = street_join.where(f)

    if municipality:
        c = _norm(municipality)
        if language == Language.FR:
            street_join = street_join.where(func.lower(Municipality.municipality_name_french) == c)
        elif language == Language.NL:
            street_join = street_join.where(func.lower(Municipality.municipality_name_dutch) == c)
        else:
            street_join = street_join.where(or_(
                func.lower(Municipality.municipality_name_french) == c,
                func.lower(Municipality.municipality_name_dutch)  == c
            ))

    # Combine clauses: we’ll execute two passes—tight and relaxed
    results: list[responses.AddressResult] = []

    async def run(q):
        q = q.limit(limit_each)
        result = await session.execute(q)
        for row in result:
            # Row tuple: (Address, Street, Municipality)
            a: Address = row[0]
            s: Street  = row[1]
            m: Municipality = row[2]
            results.append(responses.AddressResult(
                id=a.id,
                address_id=a.address_id,
                street_name_dutch=s.street_name_dutch,
                street_name_french=s.street_name_french,
                police_number=a.police_number,
                box_number=a.box_number,
                postal_code=a.postal_code,
                municipality_name_dutch=m.municipality_name_dutch,
                municipality_name_french=m.municipality_name_french,
                building_id=a.building_id
            ))

    # Pass 1: street_join with current constraints
    await run(street_join)

    return results

# ---------------------------
# Fuzzy scoring (Python only)
# ---------------------------

def _sequence_ratio(a: str, b: str) -> float:
    # difflib is light-weight and sufficient for short street names
    import difflib
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()

def _leading_int(s: str) -> int | None:
    m = re.match(r'^\d+', s or '')
    return int(m.group(0)) if m else None

def score_candidate(c: responses.AddressResult, parsed: dict[str, str | None]) -> float:
    street  = parsed['street']
    municipality = parsed['municipality']
    postal_code = parsed['postal_code']
    number  = parsed['number']
    box     = parsed['box']

    score = 0.0

    # Street similarity (FR/NL)
    if street:
        sim = max(
            _sequence_ratio(street, c.street_name_french or ''),
            _sequence_ratio(street, c.street_name_dutch  or '')
        )
        score += 0.55 * sim

    # Municipality exact match bonus
    if municipality:
        if _canonical_municipality(c.municipality_name_french) == municipality or \
           _canonical_municipality(c.municipality_name_dutch)  == municipality:
            score += 0.15

    # ZIP exact match bonus
    if postal_code and str(c.postal_code) == postal_code:
        score += 0.10

    # Police number exact / proximity
    if number and c.police_number:
        if number.strip().lower() == c.police_number.strip().lower():
            score += 0.15
        else:
            a = _leading_int(number)
            b = _leading_int(c.police_number)
            if a is not None and b is not None:
                d = abs(a - b)
                if d == 1: score += 0.05
                elif d <= 3: score += 0.03

    # Box exact bonus
    if box and c.box_number and box.strip().lower() == c.box_number.strip().lower():
        score += 0.05

    return score

def best_match(cands: list[responses.AddressResult], parsed: dict[str, str | None], threshold: float = ACCEPT_THRESHOLD) -> responses.AddressResult | None:
    if not cands:
        return None
    scored = sorted(((c, score_candidate(c, parsed)) for c in cands), key=lambda x: x[1], reverse=True)
    cand, sc = scored[0]
    return cand if sc >= threshold else None

def rank_similar(cands: list[responses.AddressResult], parsed: dict[str, str | None], topk: int = DEFAULT_TOPK) -> list[responses.AddressResult]:
    scored = sorted(((c, score_candidate(c, parsed)) for c in cands), key=lambda x: x[1], reverse=True)
    return [c for c, s in scored[:topk]]

# ---------------------------
# Building fetch (group by BU_ID / building_id)
# ---------------------------

async def fetch_building(session: Session, building_id: int) -> list[responses.AddressResult]:
    q = select(Address, Street, Municipality) \
        .join(Street, Street.street_id == Address.street_id) \
        .join(Municipality, Municipality.municipality_id == Address.municipality_id) \
        .where(Address.building_id == building_id)

    out: list[responses.AddressResult] = []
    result = await session.execute(q)
    for row in result:
        a: Address = row[0]; s: Street = row[1]; m: Municipality = row[2]
        out.append(responses.AddressResult(
            id=a.id,
            address_id=a.address_id,
            street_name_dutch=s.street_name_dutch,
            street_name_french=s.street_name_french,
            police_number=a.police_number,
            box_number=a.box_number,
            postal_code=a.postal_code,
            municipality_name_dutch=m.municipality_name_dutch,
            municipality_name_french=m.municipality_name_french,
            building_id=a.building_id
        ))
    return out

# ---------------------------
# Public API
# ---------------------------

async def resolve(session: Session, search_address: requests.SearchAddress) -> responses.ResolveResult:
    """
    Parse a free-text Brussels address, find best match, return the whole building (same building_id).
    If no strong match, return 'similar' candidates ranked purely in Python.

    Returns:
        ResolveResult(query=..., match=..., building=[...], similar=[...])
    """
    parsed = parse_address(search_address.free_text)

    candidates = await fetch_candidates(session, parsed, language=search_address.language, limit_each=DEFAULT_CANDIDATE_LIMIT)

    match = best_match(candidates, parsed, threshold=ACCEPT_THRESHOLD)
    building = []
    similar = []

    if match and match.building_id is not None:
        building = await fetch_building(session, match.building_id)
    else:
        similar = rank_similar(candidates, parsed, topk=search_address.top_k)

    return responses.ResolveResult(query=parsed, match=match, building=building, similar=similar)
