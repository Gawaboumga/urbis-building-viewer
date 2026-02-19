from app.core.constants import SCHEMA_URBIS_PARCEL_AND_BUILDING, SCHEMA_URBIS_3D_CONSTRUCTION, LAMBERT_72_SRID
from app.enums.building_face_type import BuildingFaceType
from app.enums.cadastral_parcel_type import CadastralParcelType
from datetime import date
from sqlalchemy import SmallInteger
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from geoalchemy2 import Geometry


class Base(DeclarativeBase):
    pass

## Urbis Parcels and buildings

class _StreetMixin:
    street_id: Mapped[int] = mapped_column(primary_key=True)
    street_name_dutch: Mapped[str] = mapped_column()
    street_name_french: Mapped[str] = mapped_column()

    cleaned_street_name_dutch: Mapped[str] = mapped_column()
    cleaned_street_name_french: Mapped[str] = mapped_column()
class Street(Base, _StreetMixin):
    __tablename__ = 'street'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )
class StreetTMP(Base, _StreetMixin):
    __tablename__ = 'street_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )

class _MunicipalityMixin:
    municipality_id: Mapped[int] = mapped_column(primary_key=True)
    municipality_name_dutch: Mapped[str] = mapped_column()
    municipality_name_french: Mapped[str] = mapped_column()
class Municipality(Base, _MunicipalityMixin):
    __tablename__ = 'municipality'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )
class MunicipalityTMP(Base, _MunicipalityMixin):
    __tablename__ = 'municipality_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )

class _AddressMixin:
    id: Mapped[int] = mapped_column(primary_key=True)
    address_id: Mapped[int] = mapped_column()
    street_id: Mapped[int] = mapped_column()
    municipality_id: Mapped[int] = mapped_column()
    parent_id: Mapped[int | None] = mapped_column()
    cadastral_parcel_id: Mapped[int | None] = mapped_column()
    building_id: Mapped[int | None] = mapped_column()
    carto_angle: Mapped[float] = mapped_column()
    postal_code: Mapped[int] = mapped_column(SmallInteger)
    police_number: Mapped[str] = mapped_column()
    box_number: Mapped[str | None] = mapped_column()
    stat_nis_code: Mapped[str] = mapped_column()
    l72: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='POINT', srid=LAMBERT_72_SRID, spatial_index=False),
    )
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='MULTIPOINT', srid=LAMBERT_72_SRID, spatial_index=False),
    )

class Address(Base, _AddressMixin):
    __tablename__ = 'address'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )
class AddressTMP(Base, _AddressMixin):
    __tablename__ = 'address_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )

class _BuildingMixin:
    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column()
    block_id: Mapped[int | None] = mapped_column()
    area: Mapped[float] = mapped_column()
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='MULTIPOLYGON', srid=LAMBERT_72_SRID, spatial_index=False),
    )
class Building(Base, _BuildingMixin):
    __tablename__ = 'building'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )
class BuildingTMP(Base, _BuildingMixin):
    __tablename__ = 'building_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )

class _CadastralParcelMixin:
    id: Mapped[int] = mapped_column(primary_key=True)
    cadastral_parcel_id: Mapped[int] = mapped_column()
    cadastral_division: Mapped[int] = mapped_column()
    municipality_id: Mapped[int | None] = mapped_column()
    area: Mapped[float] = mapped_column()
    type: Mapped[CadastralParcelType] = mapped_column(SmallInteger)
    cadastral_parcel_key: Mapped[str] = mapped_column()
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='MULTIPOLYGON', srid=LAMBERT_72_SRID, spatial_index=False),
    )
class CadastralParcel(Base, _CadastralParcelMixin):
    __tablename__ = 'cadastral_parcel'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )
class CadastralParcelTMP(Base, _CadastralParcelMixin):
    __tablename__ = 'cadastral_parcel_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_PARCEL_AND_BUILDING }
    )

## Urbis 3D construction

class _BuildingFaceMixin:
    id: Mapped[int] = mapped_column(primary_key=True)
    building_face_id: Mapped[int] = mapped_column()
    building_solid_id: Mapped[int] = mapped_column()
    begin_validity: Mapped[date] = mapped_column()
    end_validity: Mapped[date | None] = mapped_column()
    type: Mapped[BuildingFaceType] = mapped_column(SmallInteger)
    details_level: Mapped[int] = mapped_column(SmallInteger)
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='MULTIPOLYGONZ', srid=LAMBERT_72_SRID, spatial_index=False),
    )

class BuildingFace(Base, _BuildingFaceMixin):
    __tablename__ = 'building_face'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )
class BuildingFaceTMP(Base, _BuildingFaceMixin):
    __tablename__ = 'building_face_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )

class _BuildingSolidMixin:
    building_solid_id: Mapped[int] = mapped_column(primary_key=True)
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='POINT', srid=LAMBERT_72_SRID, spatial_index=False)
    )

class BuildingSolid(Base, _BuildingSolidMixin):
    __tablename__ = 'building_solid'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )
class BuildingSolidTMP(Base, _BuildingSolidMixin):
    __tablename__ = 'building_solid_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )

class _ForbiddenAreaMixin:
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    geometry: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type='POLYGON', srid=LAMBERT_72_SRID, spatial_index=False)
    )

class ForbiddenArea(Base, _ForbiddenAreaMixin):
    __tablename__ = 'forbidden_area'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )
class ForbiddenAreaTMP(Base, _ForbiddenAreaMixin):
    __tablename__ = 'forbidden_area_tmp'
    __table_args__ = (
        { 'schema': SCHEMA_URBIS_3D_CONSTRUCTION }
    )
