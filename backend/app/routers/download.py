
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path


api_router = APIRouter(prefix='')


SNAPSHOT_FOLDER = Path('/snapshot')

@api_router.get("/shadow-data")
def download_shadow_data():
    file_path = SNAPSHOT_FOLDER / "street_shadow.gpkg"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        media_type="application/geopackage+sqlite3",
        filename="street_shadow.gpkg"
    )

@api_router.get("/shadow-map/{name}")
def get_snapshot(name: str):
    file_path = SNAPSHOT_FOLDER / f"{name}.png"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return FileResponse(
        path=file_path,
        media_type="image/png",
        filename=f"{name}.png"
    )
