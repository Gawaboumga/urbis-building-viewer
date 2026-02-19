from app.core.constants import LAMBERT_72_SRID
from app.core.models import Address, Building, CadastralParcel, Municipality, Street
from app.core.settings import Settings
from app.enums.cadastral_parcel_type import CadastralParcelType
from app.enums.inspire_base_uri import InspireBaseURI
from app.parsers.address import _norm
from shapely.geometry import Point
from sqlalchemy import create_engine, select, Float, Integer, REAL, String
from sqlalchemy.event import listen
from sqlalchemy.orm import Session, DeclarativeBase, Mapped, mapped_column
from geoalchemy2 import Geometry, load_spatialite_gpkg
from geoalchemy2.shape import from_shape
from typing import Iterator


engine = create_engine(f"gpkg:///{Settings.URBIS_PARCEL_BUILDING_GEO_PACKAGE_PATH}", echo=False)
listen(engine, "connect", load_spatialite_gpkg)


class Base(DeclarativeBase):
    pass
class GPKGAddress(Base):
    __tablename__ = "Addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, nullable=False)
    geom: Mapped[str | None] = mapped_column(Geometry("MULTIPOINT", srid=LAMBERT_72_SRID))
    inspire_id: Mapped[str | None] = mapped_column(String(88), name="INSPIRE_ID")
    street_id: Mapped[str | None] = mapped_column(String(88), name="STREET_ID")
    strname_fre: Mapped[str | None] = mapped_column(String(60), name="STRNAMEFRE")
    strname_dut: Mapped[str | None] = mapped_column(String(60), name="STRNAMEDUT")
    policenum: Mapped[str | None] = mapped_column(String(8), name="POLICENUM")
    box_number: Mapped[str | None] = mapped_column(String(10), name="BOXNUMBER")
    zipcode: Mapped[str | None] = mapped_column(String(4), name="ZIPCODE")
    munnis_code: Mapped[str | None] = mapped_column(String(63), name="MUNNISCODE")
    munname_fre: Mapped[str | None] = mapped_column(String(60), name="MUNNAMEFRE")
    munname_dut: Mapped[str | None] = mapped_column(String(60), name="MUNNAMEDUT")
    parent_id: Mapped[str | None] = mapped_column(String(88), name="PARENTID")
    carto_angle: Mapped[float | None] = mapped_column(Float, name="CARTOANGLE")
    xl72: Mapped[float | None] = mapped_column(REAL, name="XL72")
    yl72: Mapped[float | None] = mapped_column(REAL, name="YL72")
    capakey: Mapped[str | None] = mapped_column(String(18), name="CAPAKEY")
    statnis_code: Mapped[str | None] = mapped_column(String(19), name="STATNISCODE")
    bu_id: Mapped[str | None] = mapped_column(String(88), name="BU_ID")


class GPKGBuilding(Base):
    __tablename__ = "Buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, nullable=False)
    geom: Mapped[str | None] = mapped_column(Geometry("MULTIPOLYGON", srid=LAMBERT_72_SRID))
    inspire_id: Mapped[str | None] = mapped_column(String(88), name="INSPIRE_ID")
    capa_id: Mapped[str | None] = mapped_column(String(88), name="CAPA_ID")
    capakey: Mapped[str | None] = mapped_column(String(18), name="CAPAKEY")
    block_id: Mapped[str | None] = mapped_column(String(88), name="BLOCK_ID")
    area: Mapped[float | None] = mapped_column(REAL, name="AREA")


class GPKGCadastralParcel(Base):
    __tablename__ = "CadastralParcels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, nullable=False)
    geom: Mapped[str | None] = mapped_column(Geometry("MULTIPOLYGON", srid=LAMBERT_72_SRID))
    capakey: Mapped[str | None] = mapped_column(String(18), name="CAPAKEY")
    type: Mapped[str | None] = mapped_column(String(2), name="TYPE")
    cadastr_div: Mapped[str | None] = mapped_column(String(5), name="CADAST_DIV")
    munnis_code: Mapped[str | None] = mapped_column(String(5), name="MUNNISCODE")
    inspire_id: Mapped[str | None] = mapped_column(String(88), name="INSPIRE_ID")
    area: Mapped[float | None] = mapped_column(Float, name="AREA")

MAX = None#10_000

def is_null_or_whitespace(value: str | None) -> bool:
    return value is None or value.strip() == ''

def is_valid_inspire_id(value: str | None) -> bool:
    if is_null_or_whitespace(value):
        return False
    return not value.endswith('/')

def read_addresses(capa_key_to_capa_inspire_id: dict[str, int], municipalities: dict[int, Municipality], streets: dict[int, Street]) -> Iterator[Address]:
    i = 0
    with Session(engine) as session:
        stmt = select(GPKGAddress)
        results = session.execute(stmt).yield_per(1000).scalars()

        for gpkg_address in results:
            if MAX is not None and i > MAX:
                break

            municipality_id = read_inspire_id(gpkg_address.munnis_code, InspireBaseURI.MUNICIPALITY)
            if municipality_id not in municipalities:
                municipality = Municipality(
                    municipality_id=municipality_id,
                    municipality_name_dutch=gpkg_address.munname_dut,
                    municipality_name_french=gpkg_address.munname_fre,
                )
                municipalities[municipality_id] = municipality

            street_id = read_inspire_id(gpkg_address.street_id, InspireBaseURI.STREET_NAME)
            if street_id not in streets:
                street = Street(
                    street_id=street_id,
                    street_name_dutch=gpkg_address.strname_dut,
                    street_name_french=gpkg_address.strname_fre,
                    cleaned_street_name_dutch=_norm(gpkg_address.strname_dut),
                    cleaned_street_name_french=_norm(gpkg_address.strname_fre),
                )
                streets[street_id] = street

            cadastral_parcel_id = capa_key_to_capa_inspire_id.get(gpkg_address.capakey)
            address = Address(
                id=gpkg_address.id,
                address_id=read_inspire_id(gpkg_address.inspire_id, InspireBaseURI.ADDRESS),
                street_id=street_id,
                municipality_id=municipality_id,
                parent_id=read_inspire_id(gpkg_address.parent_id, InspireBaseURI.ADDRESS) if is_valid_inspire_id(gpkg_address.parent_id) else None,
                cadastral_parcel_id=cadastral_parcel_id,
                building_id=read_inspire_id(gpkg_address.bu_id, InspireBaseURI.BUILDING) if is_valid_inspire_id(gpkg_address.bu_id) else None,
                carto_angle=gpkg_address.carto_angle,
                postal_code=int(gpkg_address.zipcode),
                police_number=gpkg_address.policenum,
                box_number=gpkg_address.box_number,
                stat_nis_code=gpkg_address.statnis_code,
                l72=from_shape(Point(gpkg_address.xl72, gpkg_address.yl72), srid=LAMBERT_72_SRID),
                geometry=gpkg_address.geom,
            )

            yield address
            i += 1

def read_buildings() -> Iterator[Building]:
    i = 0
    with Session(engine) as session:
        stmt = select(GPKGBuilding)
        results = session.execute(stmt).yield_per(1000).scalars()

        for gpkg_building in results:
            if MAX is not None and i > MAX:
                break

            building = Building(
                id=gpkg_building.id,
                building_id=read_inspire_id(gpkg_building.inspire_id, InspireBaseURI.BUILDING),
                block_id=read_inspire_id(gpkg_building.block_id, InspireBaseURI.BLOCK) if is_valid_inspire_id(gpkg_building.block_id) else None,
                area=gpkg_building.area,
                geometry=gpkg_building.geom,
            )

            yield building
            i += 1

def read_cadastral_parcels(capa_key_to_capa_inspire_id: dict[str, int]) -> Iterator[CadastralParcel]:
    i = 0
    with Session(engine) as session:
        stmt = select(GPKGCadastralParcel)
        results = session.execute(stmt).yield_per(1000).scalars()

        for gpkg_cadastral_parcel in results:
            if MAX is not None and i > MAX:
                break

            cadastral_parcel_id = read_inspire_id(gpkg_cadastral_parcel.inspire_id, InspireBaseURI.CADASTRAL_PARCEL)
            cadastral_parcel = CadastralParcel(
                id=gpkg_cadastral_parcel.id,
                cadastral_parcel_id=cadastral_parcel_id,
                cadastral_division=int(gpkg_cadastral_parcel.cadastr_div),
                municipality_id=int(gpkg_cadastral_parcel.munnis_code) if is_valid_inspire_id(gpkg_cadastral_parcel.munnis_code) else None,
                area=gpkg_cadastral_parcel.area,
                type=CadastralParcelType[gpkg_cadastral_parcel.type],
                cadastral_parcel_key=gpkg_cadastral_parcel.capakey,
                geometry=gpkg_cadastral_parcel.geom,
            )

            capa_key_to_capa_inspire_id[gpkg_cadastral_parcel.capakey] = cadastral_parcel_id

            yield cadastral_parcel
            i += 1

def read_inspire_id(uri: str, uri_base: InspireBaseURI) -> int:
    id_part = uri.removeprefix(uri_base.value)
    return int(id_part)
