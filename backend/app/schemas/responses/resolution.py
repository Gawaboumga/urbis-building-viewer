from dataclasses import dataclass


@dataclass
class AddressResult:
    id: int
    address_id: int
    street_name_dutch: str | None
    street_name_french: str | None
    police_number: str
    box_number: str | None
    postal_code: int
    municipality_name_dutch: str | None
    municipality_name_french: str | None
    building_id: int | None

@dataclass
class ResolveResult:
    query: dict[str, str | None]
    match: AddressResult | None
    building: list[AddressResult]
    similar: list[AddressResult]
