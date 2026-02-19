from app.core.constants import WGS_84_SRID
from app.core.settings import Settings
from app.utils import transform_geometry
from shapely import wkt, Polygon
import os


def read_forbidden_areas_polygons(destination_srid: int) -> list[Polygon]:
    folder_path = Settings.FORBIDDEN_AREAS_FOLDER

    polygons = []
    for filename in os.listdir(folder_path):
        print(f'Forbidden area: {filename}')
        if filename.lower().endswith(".wkt"):
            file_path = os.path.join(folder_path, filename)

            with open(file_path, "r") as f:
                wkt_text = f.read().strip()

            geom = wkt.loads(wkt_text)

            if geom.geom_type == "Polygon":
                polygons.append(transform_geometry(geom, source_srid=WGS_84_SRID, dest_srid=destination_srid))
            else:
                print(f"Skipping {filename}: geometry is {geom.geom_type}")
        else:
            print(f"Skipping {filename}")

    print(f'Found: {len(polygons)} forbidden areas')
    return polygons
