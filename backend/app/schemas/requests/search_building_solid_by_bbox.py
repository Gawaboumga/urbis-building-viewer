# app/schemas/requests.py (or wherever your requests.* live)
from pydantic import BaseModel, Field
from typing import Literal


class SearchBuildingSolidByBbox(BaseModel):
    # bbox in the SOURCE coordinate system
    west: float = Field(..., description="Minimum X (west/left)")
    south: float = Field(..., description="Minimum Y (south/bottom)")
    east: float = Field(..., description="Maximum X (east/right)")
    north: float = Field(..., description="Maximum Y (north/top)")

    source_srid: int | None = Field(None, description="SRID of the bbox coordinates")
    destination_srid: int | None = Field(None, description="SRID for output geometries")

    # If you want control of spatial predicate:
    predicate: Literal["intersects", "within"] = Field(
        "intersects",
        description="Use ST_Intersects (default) or ST_Within"
    )

    # Optional: limit results
    limit: int | None = Field(None, ge=1, le=50, description="Max number of results")
