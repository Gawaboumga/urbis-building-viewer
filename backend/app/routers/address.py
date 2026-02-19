from app.core.constants import LAMBERT_72_SRID
from app.core.deps import get_db
from app.core.models import Address
from app.schemas import requests, responses
from app.utils import transform_geometry
from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.parsers.address import resolve


api_router = APIRouter(prefix='')

@api_router.post('/by_address_id')
async def get_addresses(address_list: requests.AddressList, db: AsyncSession = Depends(get_db)) -> list[responses.Address]:
    stmt = select(Address).where(Address.address_id.in_(address_list.address_ids))
    result = await db.execute(stmt)
    results = []
    for row in result.scalars():
        l72 = to_shape(row.l72)
        if address_list.destination_srid is not None:
            l72 = transform_geometry(l72, LAMBERT_72_SRID, address_list.destination_srid)
        geometry = to_shape(row.geometry)
        if address_list.destination_srid is not None:
            geometry = transform_geometry(geometry, LAMBERT_72_SRID, address_list.destination_srid)
        results.append(responses.Address(
            id=row.id,
            address_id=row.address_id,
            street_id=row.street_id,
            municipality_id=row.municipality_id,
            parent_id=row.parent_id,
            cadastral_parcel_id=row.cadastral_parcel_id,
            building_id=row.building_id,
            carto_angle=row.carto_angle,
            postal_code=row.postal_code,
            police_number=row.police_number,
            box_number=row.box_number,
            stat_nis_code=row.stat_nis_code,
            l72=mapping(l72),
            geometry=mapping(geometry),
        ))
    return results


@api_router.post('/search')
async def search_address(search_address: requests.SearchAddress, db: AsyncSession = Depends(get_db)) -> responses.ResolveResult:
    return await resolve(db, search_address)
