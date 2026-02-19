from app.core.constants import LAMBERT_72_SRID
from app.core.database import async_engine
from app.core.deps import get_db
from app.core.models import (
    Address, AddressTMP, Building, BuildingTMP, CadastralParcel, CadastralParcelTMP, \
    Municipality, MunicipalityTMP, Street, StreetTMP, \
    BuildingFace, BuildingFaceTMP, BuildingSolid, BuildingSolidTMP,
    ForbiddenArea, ForbiddenAreaTMP
)
from app.parsers import forbidden_areas, urbis_parcel_and_building, urbis_3d_construction
from app.utils import fully_qualified_table_name, bulk_insert, IndexDescription, IndexType, get_index_columns, get_index_name, get_index_type, project_to_ground
from fastapi import APIRouter, Depends
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession


api_router = APIRouter(prefix='')


@api_router.post('/load/parcel_and_building')
async def load_parcel_and_building(db: AsyncSession = Depends(get_db)):
    conn = await db.connection()
    raw_conn = await conn.get_raw_connection()

    tmp_table_associations = {
        AddressTMP: Address,
        BuildingTMP: Building,
        CadastralParcelTMP: CadastralParcel,
        MunicipalityTMP: Municipality,
        StreetTMP: Street
    }

    await _create_tables(async_engine, tmp_table_associations)

    counters = {}
    municipalities: dict[int, MunicipalityTMP] = {}
    streets: dict[int, StreetTMP] = {}
    capa_key_to_capa_inspire_id: dict[str, int] = {}
    counters['cadastral_parcel'] = await bulk_insert(CadastralParcelTMP, raw_conn, urbis_parcel_and_building.read_cadastral_parcels(capa_key_to_capa_inspire_id))
    counters['address'] = await bulk_insert(AddressTMP, raw_conn, urbis_parcel_and_building.read_addresses(capa_key_to_capa_inspire_id, municipalities, streets))
    counters['building'] = await bulk_insert(BuildingTMP, raw_conn, urbis_parcel_and_building.read_buildings())
    counters['municipality'] = await bulk_insert(MunicipalityTMP, raw_conn, municipalities.values())
    counters['street'] = await bulk_insert(StreetTMP, raw_conn, streets.values())

    associated_indexes = {
        AddressTMP: [
            IndexDescription(
                columns=[AddressTMP.address_id],
                index_type=IndexType.BTREE
            ),
            IndexDescription(
                columns=[AddressTMP.street_id],
                index_type=IndexType.BTREE
            ),
            IndexDescription(
                columns=[AddressTMP.l72],
                index_type=IndexType.GIST
            ),
        ],
        BuildingTMP: [
            IndexDescription(
                columns=[BuildingTMP.building_id],
                index_type=IndexType.BTREE
            ),
            IndexDescription(
                columns=[BuildingTMP.geometry],
                index_type=IndexType.GIST
            ),
        ],
        CadastralParcelTMP: [
            IndexDescription(
                columns=[CadastralParcelTMP.cadastral_parcel_id],
                index_type=IndexType.BTREE
            ),
            IndexDescription(
                columns=[CadastralParcelTMP.geometry],
                index_type=IndexType.GIST
            ),
        ],
    }

    await _create_indexes(async_engine, associated_indexes)
    await _replace_tables(async_engine, tmp_table_associations, associated_indexes)

    return counters


@api_router.post('/load/3d_construction')
async def load_3d_construction(db: AsyncSession = Depends(get_db)):
    conn = await db.connection()
    raw_conn = await conn.get_raw_connection()

    tmp_table_associations = {
        BuildingFaceTMP: BuildingFace,
        BuildingSolidTMP: BuildingSolid,
        ForbiddenAreaTMP: ForbiddenArea,
    }

    await _create_tables(async_engine, tmp_table_associations)

    forbidden_areas_polygons = forbidden_areas.read_forbidden_areas_polygons(destination_srid=LAMBERT_72_SRID)

    building_solids: dict[int, BuildingSolid] = {}
    building_face_count = await bulk_insert(BuildingFaceTMP, raw_conn, urbis_3d_construction.read_building_faces(building_solids))
    building_solid_count = await bulk_insert(BuildingSolidTMP, raw_conn, building_solids.values())
    forbidden_area_count = await bulk_insert(ForbiddenAreaTMP, raw_conn, [ForbiddenAreaTMP(
        id=i,
        geometry=geometry
    ) for i, geometry in enumerate(forbidden_areas_polygons)])

    to_remove: set[int] = set()
    for building_solid_id, building_solid in building_solids.items():
        try:
            ground_projected = project_to_ground(building_solid.geometry)
            matches = [p for p in forbidden_areas_polygons if ground_projected.intersects(p)]
            if len(matches) > 0:
                to_remove.add(building_solid_id)
        except:
            continue

    async with async_engine.begin() as conn:
        await conn.execute(
            delete(BuildingSolidTMP).where(
                BuildingSolidTMP.building_solid_id.in_(to_remove)
            )
        )
        await conn.execute(
            delete(BuildingFaceTMP).where(
                BuildingFaceTMP.building_solid_id.in_(to_remove)
            )
        )

    associated_indexes = {
        BuildingFaceTMP: [
            IndexDescription(
                columns=[BuildingFaceTMP.building_solid_id],
                index_type=IndexType.BTREE
            ),
        ],
        BuildingSolidTMP: [
            IndexDescription(
                columns=[BuildingSolidTMP.geometry],
                index_type=IndexType.GIST
            ),
        ]
    }

    await _create_indexes(async_engine, associated_indexes)
    await _replace_tables(async_engine, tmp_table_associations, associated_indexes)

    return {
        'building_face': building_face_count,
        'building_solid': building_solid_count
    }

async def _create_tables(async_engine, tmp_table_associations: dict):
    async with async_engine.begin() as conn:
        for tmp_table in tmp_table_associations.keys():
            table = tmp_table.__table__
            await conn.run_sync(lambda sync_conn: table.drop(sync_conn, checkfirst=True))
            await conn.run_sync(lambda sync_conn: table.create(sync_conn, checkfirst=True))

async def _create_indexes(async_engine, associated_indexes: dict):
    async with async_engine.begin() as conn:
        for table_tmp, indexes in associated_indexes.items():
            for index_description in indexes:
                index_name = get_index_name(table_tmp, index_description.columns)
                selected_columns = get_index_columns(index_description.columns)
                await conn.execute(text(f'CREATE INDEX "{index_name}" ON {fully_qualified_table_name(table_tmp)} {get_index_type(index_description.index_type)} ({selected_columns});'))

async def _replace_tables(async_engine, tmp_table_associations: dict, associated_indexes: dict):
    async with async_engine.begin() as conn:
        for tmp_table, table in tmp_table_associations.items():
            await conn.execute(text(f'DROP TABLE {fully_qualified_table_name(table)}'))
            await conn.execute(text(f'ALTER TABLE {fully_qualified_table_name(tmp_table)} RENAME TO "{table.__tablename__}"'))
            for index_description in associated_indexes.get(tmp_table, []):
                tmp_index_name = get_index_name(tmp_table, index_description.columns)
                index_name = get_index_name(table, index_description.columns)
                await conn.execute(text(f'ALTER INDEX "{table.__table__.schema}"."{tmp_index_name}" RENAME TO "{index_name}"'))
