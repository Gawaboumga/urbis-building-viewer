from app.enums.language import Language
from pydantic import BaseModel


class SearchAddress(BaseModel):
    language: Language = Language.UNKNOWN
    free_text: str
    top_k: int = 15
