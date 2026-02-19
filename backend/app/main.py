from app.core.constants import SCHEMA_URBIS_PARCEL_AND_BUILDING, SCHEMA_URBIS_3D_CONSTRUCTION
from app.core.database import async_engine
from app.core.models import Base
from app.core.settings import Settings
from app.routers import (
    address as address_router,
    building as building_router,
    urbis_3d as urbis_3d_router,
    maintenance as maintenance_router,
)
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text


async def lifespan(app: FastAPI):
    async with async_engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS {SCHEMA_URBIS_PARCEL_AND_BUILDING}'))
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS {SCHEMA_URBIS_3D_CONSTRUCTION}'))
        await conn.run_sync(Base.metadata.create_all)
    yield
    await async_engine.dispose()


app = FastAPI(lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://localhost:3000",
    "https://localhost:3000",
    "http://localhost:63500",
    "https://localhost:63500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"], # Allows all methods
    allow_headers=["*"], # Allows all headers
)

app.include_router(address_router.api_router, prefix='/addresses', tags=['address'])
app.include_router(building_router.api_router, prefix='/buildings', tags=['building'])
app.include_router(urbis_3d_router.api_router, prefix='/urbis_3d', tags=['urbis_3d'])


def internal_only(request: Request):
    client_ip = request.client.host

    if client_ip.startswith("172.18."):
        return

    if client_ip in ("127.0.0.1", "localhost"):
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

app.include_router(maintenance_router.api_router, prefix='/maintenance', tags=['maintenance'], dependencies=[Depends(internal_only)])
