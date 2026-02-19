# Urbis building view

## 🏙️ 3D Building Visualizer (Urbis)
A small tool to visualize buildings in 3D and extract their surfaces, using Urbis data from the Brussels‑Capital Region. Supports address search and point‑based lookup.

http://my-building.brussels/

### Features
- 3D building rendering
- Surface extraction (walls, roof, footprint)
- Address search
- Click‑on‑map building identification
- Lightweight UI for quick exploration

## Installation

### How to launch in local

```
docker compose -f .\compose.local.yml --env-file=.env --profile backend up
cd frontend && npm run dev
```

or

```
docker compose -f .\compose.local.yml --env-file=.env --profile backend --profile frontend up
```

### How to launch in prod

```
docker compose -f compose.prod.yml --env-file=.prod.env build
docker compose -f compose.prod.yml --env-file=.prod.env up -d nginx backend frontend db

# Beware that you must first disable 443 in nginx conf prior running cert, then reenable it

docker compose -f compose.prod.yml --env-file=.prod.env run --rm certbot
docker compose -f compose.prod.yml --env-file=.prod.env restart nginx
```

### How to update data

```
cd data

release_date=20260207        
curl -O https://urbisdownload.datastore.brussels/UrbIS/Vector/M8/UrbIS-Buildings3D/GPKG/UrbISBuildings3D_31370_GPKG_04000_$release_date.zip
unzip UrbISBuildings3D_31370_GPKG_04000_$release_date.zip
mv gpkg/UrbISBuildings3D_04000.gpkg UrbISBuildings3D_04000.gpkg

curl -O https://urbisdownload.datastore.brussels/UrbIS/Vector/M8/UrbIS-Buildings/GPKG/UrbISBuildings_31370_GPKG_04000_$release_date.zip
unzip UrbISBuildings_31370_GPKG_04000_$release_date.zip
mv gpkg/UrbISBuildings_04000.gpkg UrbISBuildings_04000.gpkg
```

From within the image:
```
docker exec -it "my_docker_id" /bin/bash
pip install requests
python
import requests
url = "http://localhost:8000/maintenance/load/parcel_and_building"
requests.post(url, json={})
url = "http://localhost:8000/maintenance/load/3d_construction"
requests.post(url, json={})
```

## Data Source
Uses Urbis open geographic datasets.
More info:
- https://be.brussels/fr/propos-de-la-region/les-donnees-urbis
- https://be.brussels/nl/over-het-gewest/urbisdata

## License
MIT
