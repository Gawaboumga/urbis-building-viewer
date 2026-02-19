from app.core.constants import LAMBERT_72_SRID
from app.core.deps import get_db
from app.core.models import BuildingFace, BuildingSolid
from app.enums.building_face_type import BuildingFaceType
from app.schemas import requests, responses
from app.utils import compute_polygon_area, transform_geometry
from fastapi import APIRouter, Depends
from geoalchemy2.shape import from_shape, to_shape
from geoalchemy2.functions import ST_DWithin, ST_Distance
from shapely.geometry import mapping, Point
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any


api_router = APIRouter(prefix='')


def _get_building_face_properties(face: BuildingFace) -> dict[str, Any]:
    return {
        'building_face_id': face.building_face_id,
        'building_solid_id': face.building_solid_id,
        'type':  BuildingFaceType(face.type).name,
        'details_level': face.details_level,
        'begin_validity': face.begin_validity,
        'end_validity': face.end_validity,
    }


@api_router.post('/building_solid')
async def get_building_solid(building_solid: requests.BuildingSolid, db: AsyncSession = Depends(get_db)) -> responses.FeatureCollection:
    stmt = select(BuildingFace).where(BuildingFace.building_solid_id == building_solid.building_solid_id)
    result = await db.execute(stmt)
    faces: list[BuildingFace] = result.scalars()

    features = []
    for face in faces:
        geom = to_shape(face.geometry)

        properties = _get_building_face_properties(face)
        if building_solid.compute_area:
            assert face.geometry.srid == LAMBERT_72_SRID
            # Beware that we benefit from the fact that LAMBERT 72 is geodesic, hence "pythagore" works
            try:
                properties['area'] = compute_polygon_area(geom)
            except:
                properties['area'] = 0

        if building_solid.destination_srid is not None:
            geom = transform_geometry(geom, LAMBERT_72_SRID, building_solid.destination_srid)

        features.append(responses.Feature(
            type='Feature',
            geometry=mapping(geom),
            properties=properties
        ))

    return responses.FeatureCollection(
        type='FeatureCollection',
        features=features
    )


@api_router.post('/nearby')
async def search_building_solid_by_distance(search: requests.SearchBuildingSolidByDistance, db: AsyncSession = Depends(get_db)) -> responses.FeatureCollection:
    point = Point(search.x72, search.y72)
    if search.source_srid is not None:
        point = transform_geometry(point, search.source_srid, LAMBERT_72_SRID)
    point_geom = from_shape(point, srid=LAMBERT_72_SRID)

    distance_stmt = ST_Distance(BuildingSolid.geometry, point_geom)
    stmt = (
        select(
            BuildingSolid,
            distance_stmt.label('distance')
        )
        .where(ST_DWithin(BuildingSolid.geometry, point_geom, search.distance))
    )
    if search.ordered_by_distance is not None:
        order_expr = distance_stmt
        stmt = stmt.order_by(order_expr.desc() if search.ordered_by_distance is False else order_expr)

    rows = await db.execute(stmt)

    features = []
    building: BuildingSolid
    for building, distance in rows:
        geom = to_shape(building.geometry)
        if search.destination_srid is not None:
            geom = transform_geometry(geom, LAMBERT_72_SRID, search.destination_srid)
        features.append(responses.Feature(
            type='Feature',
            geometry=mapping(geom),
            properties={
                'building_solid_id': building.building_solid_id,
                'distance': distance
            }
        ))

    return responses.FeatureCollection(
        type='FeatureCollection',
        features=features
    )
