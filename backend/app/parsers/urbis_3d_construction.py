from app.core.models import BuildingFace, BuildingSolid
from app.core.settings import Settings
from app.enums.building_face_type import BuildingFaceType
from app.enums.inspire_base_uri import InspireBaseURI
from sqlalchemy import create_engine, select, Date, Integer, String
from sqlalchemy.event import listen
from sqlalchemy.orm import Session, DeclarativeBase, Mapped, mapped_column
from geoalchemy2 import Geometry, load_spatialite_gpkg
from shapely import wkb


engine = create_engine(f"gpkg:///{Settings.URBIS_3D_CONSTRUCTION_GEO_PACKAGE_PATH}", echo=False)
listen(engine, "connect", load_spatialite_gpkg)


class Base(DeclarativeBase):
    pass
class GPKGBuildingFace(Base):
    __tablename__ = "BuildingFaces"

    id: Mapped[int] = mapped_column("id", Integer, primary_key=True, autoincrement=True, nullable=False)

    geometry: Mapped[str] = mapped_column("geom", Geometry("MULTIPOLYGON"))

    inspire_id: Mapped[str | None] = mapped_column("INSPIRE_ID", String(88))
    building_solid_id: Mapped[str | None] = mapped_column("BUSOLID_ID", String(88))
    type: Mapped[str | None] = mapped_column("TYPE", String(50))
    details_level: Mapped[int | None] = mapped_column("DETAILSLEVEL", Integer)
    begin_life: Mapped[str | None] = mapped_column("BEGINLIFE", Date)
    end_life: Mapped[str | None] = mapped_column("ENDLIFE", Date)


def read_building_faces(building_solid_map: dict[int, BuildingSolid]):
    i = 0
    with Session(engine) as session:
        stmt = select(GPKGBuildingFace)
        results = session.execute(stmt).yield_per(1000).scalars()

        for gpkg_building_face in results:
            building_solid = read_building_solid(building_solid_map, gpkg_building_face.building_solid_id)

            #if i > 10_000:
            #    break

            building_face = BuildingFace(
                id=gpkg_building_face.id,
                building_face_id=read_inspire_id(gpkg_building_face.inspire_id, InspireBaseURI.BUILDING_FACE),
                geometry=gpkg_building_face.geometry,
                building_solid_id=building_solid.building_solid_id,
                type=BuildingFaceType[gpkg_building_face.type],
                details_level=gpkg_building_face.details_level,
                begin_validity=gpkg_building_face.begin_life,
                end_validity=gpkg_building_face.end_life,
            )

            # If GroundSurface, set centroid on BuildingSolid
            if building_face.type == BuildingFaceType.GROUNDSURFACE:
                shape = wkb.loads(building_face.geometry.data)
                building_solid_map[building_solid.building_solid_id].geometry = shape.centroid

            yield building_face
            i += 1

def read_building_solid(building_solid_map: dict[int, BuildingSolid], building_solid_id) -> BuildingSolid:
    building_id = read_inspire_id(building_solid_id, InspireBaseURI.BUILDING_SOLID)
    building_solid = building_solid_map.get(building_id)
    if building_solid is not None:
        return building_solid

    building_solid = BuildingSolid(
        building_solid_id=building_id,
        geometry=None
    )
    building_solid_map[building_id] = building_solid
    return building_solid

def read_inspire_id(uri: str, uri_base: InspireBaseURI) -> int:
    id_part = uri.removeprefix(uri_base.value)
    return int(id_part)
