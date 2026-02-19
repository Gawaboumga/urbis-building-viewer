from app.core.constants import LAMBERT_72_SRID
from app.core.deps import get_db
from app.core.models import Building
from app.schemas import requests, responses
from app.utils import transform_geometry
from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.shape import from_shape, to_shape
from geoalchemy2.functions import ST_DWithin, ST_Distance
from shapely.geometry import mapping, Point
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any


api_router = APIRouter(prefix='')


def _get_building_properties(building: Building) -> dict[str, Any]:
    return {
        'area': building.area,
        'block_id': building.block_id,
        'building_id': building.building_id,
    }


@api_router.get('/{building_id}')
async def get_building(building_id: int, destination_srid: int | None = None, db: AsyncSession = Depends(get_db)) -> responses.FeatureCollection:
    stmt = select(Building).where(Building.building_id == building_id)
    result = await db.execute(stmt)

    building = result.scalar_one_or_none()
    if building is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f'Building not found: {building_id}')

    geom = to_shape(building.geometry)
    if destination_srid is not None:
        geom = transform_geometry(geom, LAMBERT_72_SRID, destination_srid)
    feature = responses.Feature(
        type='Feature',
        geometry=mapping(geom),
        properties=_get_building_properties(building)
    )

    return responses.FeatureCollection(
        type='FeatureCollection',
        features=[feature]
    )


@api_router.post('/nearby')
async def search_building_by_distance(search: requests.SearchBuildingByDistance, db: AsyncSession = Depends(get_db)) -> responses.FeatureCollection:
    point = Point(search.x72, search.y72)
    if search.source_srid is not None:
        point = transform_geometry(point, search.source_srid, LAMBERT_72_SRID)
    point_geom = from_shape(point, srid=LAMBERT_72_SRID)

    stmt = (
        select(
            Building,
            ST_Distance(Building.geometry, point_geom).label('distance')
        )
        .where(ST_DWithin(Building.geometry, point_geom, search.distance))
    )
    if search.ordered_by_distance is not None:
        order_expr = ST_Distance(Building.geometry, point_geom)
        stmt = stmt.order_by(order_expr.desc() if search.ordered_by_distance is False else order_expr)

    rows = await db.execute(stmt)

    features = []
    building: Building
    for building, distance in rows:
        geom = to_shape(building.geometry)
        if search.destination_srid is not None:
            geom = transform_geometry(geom, LAMBERT_72_SRID, search.destination_srid)
        properties = _get_building_properties(building)
        properties['distance'] = distance
        features.append(responses.Feature(
            type='Feature',
            geometry=mapping(geom),
            properties=properties
        ))

    return responses.FeatureCollection(
        type='FeatureCollection',
        features=features
    )
