from typing import Any, Literal
from pydantic import BaseModel, Field

COORDINATES_TYPE = tuple[float, float] | tuple[float, float, float]

# ----- Geometry Types -----
class Point(BaseModel):
    type: Literal["Point"]
    coordinates: COORDINATES_TYPE

class MultiPoint(BaseModel):
    type: Literal["MultiPoint"]
    coordinates: list[COORDINATES_TYPE]

class LineString(BaseModel):
    type: Literal["LineString"]
    coordinates: list[COORDINATES_TYPE]

class MultiLineString(BaseModel):
    type: Literal["MultiLineString"]
    coordinates: list[list[COORDINATES_TYPE]]

class Polygon(BaseModel):
    type: Literal["Polygon"]
    # Each linear ring: at least 4 positions, first == last per RFC 7946 (not enforced here)
    coordinates: list[list[COORDINATES_TYPE]]

class MultiPolygon(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[COORDINATES_TYPE]]]

Geometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon

class GeometryCollection(BaseModel):
    type: Literal["GeometryCollection"]
    geometries: list[Geometry]

# ----- Core GeoJSON Objects -----
class Feature(BaseModel):
    type: Literal["Feature"]
    geometry: Geometry | GeometryCollection | None = None
    properties: dict[str, Any] | None = Field(default=None)
    id: str | int | None = None
    bbox: list[float] | None = None

class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"]
    features: list[Feature]
    bbox: list[float] | None = None
