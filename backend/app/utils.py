from dataclasses import dataclass
from enum import Enum, auto
import numpy as np
from pyproj import Transformer
from shapely import Geometry, Polygon
from shapely.ops import transform
import time


def transform_geometry(geometry: Geometry, source_srid: int, dest_srid: int) -> Geometry:
    if source_srid == dest_srid:
        return geometry
    transformer = Transformer.from_crs(source_srid, dest_srid, always_xy=True)
    return transform(transformer.transform, geometry)

def polygon_centroid_3d(poly: Geometry) -> np.array:
    coords = np.array(poly.exterior.coords)
    return coords.mean(axis=0)  # simple average of vertices

def multipolygon_centroid_3d(multipoly: Geometry) -> np.array:
    centroids = []
    for poly in multipoly.geoms:
        centroids.append(polygon_centroid_3d(poly))
    return np.mean(centroids, axis=0)

def compute_normal(geometry: Geometry) -> np.array:
    if geometry.geom_type == 'MultiPolygon':
        for geom in geometry.geoms:
            return compute_normal(geom)
    x = y = z = 0.0
    coords = geometry.exterior.coords
    for i in range(len(coords)):
        current = coords[i]
        nxt = coords[(i + 1) % len(coords)]
        x += (current[1] - nxt[1]) * (current[2] + nxt[2])
        y += (current[2] - nxt[2]) * (current[0] + nxt[0])
        z += (current[0] - nxt[0]) * (current[1] + nxt[1])
    norm = np.array([x, y, z])
    return norm / np.linalg.norm(norm)

def project_to_plane(geometry: Geometry) -> np.array:
    centroid = multipolygon_centroid_3d(geometry)
    normal = compute_normal(geometry)
    u = np.cross(normal, [0, 0, 1])
    if np.linalg.norm(u) < 1e-4:
        u = np.cross(normal, [0, 1, 0])
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    projected = []
    for geom in geometry.geoms:
        for c in geom.exterior.coords:
            vec = np.array(c) - centroid
            x = np.dot(vec, u)
            y = np.dot(vec, v)
            projected.append((x, y))
    return projected

def project_to_ground(geometry: Geometry) -> Geometry:
    return transform(lambda x, y, z=None: (x, y), geometry)

def compute_polygon_area(geometry: Geometry) -> float:
    projected = project_to_plane(geometry)
    polygon = Polygon(projected)
    return polygon.area

def fully_qualified_table_name(o) -> str:
    table = o.__table__
    return f'"{table.schema}"."{table.name}"'


class IndexType(Enum):
    BTREE = auto()
    GIST = auto()

@dataclass
class IndexDescription:
    columns: list
    index_type: IndexType

def get_index_columns(columns: list) -> str:
    return ', '.join(map(lambda x: x.property.columns[0].name, columns))

def get_index_name(table, columns: list) -> str:
    table_name = table.__table__.name
    columns_part = '_'.join(map(lambda x: x.property.columns[0].name, columns))
    return f'{table_name}_{columns_part}'

def get_index_type(index_type: IndexType) -> str:
    if index_type == IndexType.GIST:
        index_type = 'USING GIST'
    elif index_type == IndexType.BTREE:
        index_type = ''
    else:
        raise NotImplementedError()
    return index_type

async def bulk_insert(table, raw_conn, iterable) -> int:
    underlying_table = table.__table__
    table_columns = [column.name for column in underlying_table.columns]

    gen = AsyncLineIterator(iterable, table_columns)

    await raw_conn.driver_connection.copy_to_table(
        table_name=underlying_table.name,
        source=gen,
        format='csv',
        delimiter='\t',
        columns=table_columns,
        schema_name=underlying_table.schema,
    )

    return gen.count

class AsyncLineIterator:
    def __init__(self, records, columns, report_every=10_000):
        self.records = iter(records)
        self.columns = columns
        self.report_every = report_every
        self.count = 0
        self.start = time.perf_counter()

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            obj = next(self.records)
        except StopIteration:
            raise StopAsyncIteration

        line = '\t'.join(
            '' if getattr(obj, column) is None else str(getattr(obj, column))
            for column in self.columns
        ) + '\n'

        self.count += 1
        if self.report_every and self.count % self.report_every == 0:
            elapsed = time.perf_counter() - self.start
            speed = self.count / elapsed
            print(f"{self.count} records processed at {speed:,.0f} records/s")

        return line.encode('utf-8')
