from pydantic import BaseModel


class SearchBuildingSolidByDistance(BaseModel):
    x72: float
    y72: float
    distance: float
    source_srid: int | None = None
    destination_srid: int | None = None
    ordered_by_distance: bool | None = None # True = ASC, False = DESC
