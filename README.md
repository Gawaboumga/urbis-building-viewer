# Urbis building view

## 🏙️ 3D Building Visualizer (Urbis)
A small tool to visualize buildings in 3D and extract their surfaces, using Urbis data from the Brussels‑Capital Region. Supports address search and point‑based lookup.

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
docker compose -f compose.prod.yml --env-file=.prod.env --profile backend --profile frontend up --build -d
```

## Data Source
Uses Urbis open geographic datasets.
More info:
- https://be.brussels/fr/propos-de-la-region/les-donnees-urbis
- https://be.brussels/nl/over-het-gewest/urbisdata

## License
MIT
