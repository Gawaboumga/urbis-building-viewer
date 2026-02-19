from app.schemas.responses.geojson import Point, MultiPoint
from pydantic import BaseModel


class Address(BaseModel):
    id: int
    address_id: int
    street_id: int
    municipality_id: int
    parent_id: int | None
    cadastral_parcel_id: int | None
    building_id: int | None
    carto_angle: float
    postal_code: int
    police_number: str
    box_number: str | None
    stat_nis_code: str
    l72: Point
    geometry: MultiPoint
