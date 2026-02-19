from pydantic import BaseModel


class BuildingSolid(BaseModel):
    building_solid_id: int
    destination_srid: int | None = None
    compute_area: bool = False
