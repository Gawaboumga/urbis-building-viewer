import React from "react";

import "./ShadowPage.css";
const BASE_URL = import.meta.env.VITE_API_BASE;


const ShadowPage: React.FC = () => {
  return (
    <>
      <h1>Brussels Shadow Map Rendering</h1>

      <p>
          This page provides access to high-resolution shadow maps of the Brussels region,
          generated using detailed urban datasets and solar simulation at different times of the year.
      </p>

      <h2>Datasets Used</h2>

      <div class="dataset">
          <ul>
              <li><strong>UrbISBuildings3D</strong> - 3D building geometries used to compute shadow casting</li>
              <li><strong>UrbISLandCover</strong> - streets and footpaths used as projection surfaces</li>
              <li><strong>UrbISContourLines</strong> - terrain elevation data used to improve realism</li>
          </ul>
      </div>

      <h2>Available Shadow Snapshots</h2>

      <div class="note">
          ⚠️ Each rendered image is very large (~130MB). Download/view may be slow depending on your connection and hardware.
      </div>

      <ul>
          <li><a href={`${BASE_URL}/download/shadow-map/20260621T080000`} download>2026-06-21 08:00 UTC (Summer - Morning)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20260621T114036`} download>2026-06-21 11:40 UTC (Summer - Midday)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20260621T160000`} download>2026-06-21 16:00 UTC (Summer - Afternoon)</a></li>

          <li><a href={`${BASE_URL}/download/shadow-map/20260923T080000`} download>2026-09-23 08:00 UTC (Autumn Equinox - Morning)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20260923T113506`} download>2026-09-23 11:35 UTC (Autumn Equinox - Midday)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20260923T160000`} download>2026-09-23 16:00 UTC (Autumn Equinox - Afternoon)</a></li>

          <li><a href={`${BASE_URL}/download/shadow-map/20261221T093000`} download>2026-12-21 09:30 UTC (Winter Solstice - Morning)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20261221T114535`} download>2026-12-21 11:45 UTC (Winter Solstice - Midday)</a></li>
          <li><a href={`${BASE_URL}/download/shadow-map/20261221T143000`} download>2026-12-21 14:30 UTC (Winter Solstice - Afternoon)</a></li>
      </ul>

      <h2>Geospatial Data (GeoPackage)</h2>

      <p>
          In addition to raster visualisations, a <strong>GeoPackage (.gpkg)</strong> is available,
          containing detailed shadow information as geospatial layers. This dataset allows:
      </p>

      <ul>
          <li>Analysis of shadow coverage</li>
          <li>Integration in GIS tools (QGIS, PostGIS)</li>
          <li>Further spatial computations</li>
      </ul>


      <p>
        <a href={`${BASE_URL}/download/shadow-data`}>
          Download GeoPackage (~300MB)
        </a>
      </p>

      <h2>Notes</h2>
      <ul>
          <li>All timestamps are expressed in <strong>UTC</strong>.</li>
          <li>Rendering includes terrain influence via contour lines.</li>
          <li>Images represent projected shadows on streets and footpaths.</li>
      </ul>

      <h2>Related Tools & Applications</h2>

      <p>
          Several online tools exist to explore sun exposure and shadows in urban environments.
          They provide interactive and user-friendly ways to visualise sunlight conditions at a given location and time.
      </p>

      <ul>
          <li>
              <strong><a href="https://shademap.app/@50.85045,4.34878,15z,1781354661180t,0b,0p,0m">ShadeMap</a></strong> –
              a web-based tool that simulates shadows from buildings, terrain, and trees anywhere
              in the world for any chosen date and time. It dynamically updates shadow patterns and
              is commonly used for solar analysis, architecture, and outdoor planning.
          </li>

          <li>
              <strong><a href="https://zonnigeterrassen.com/">Zonnige Terrassen</a></strong> –
              an application focused on finding sunny terraces. It combines sun position with
              surrounding building data to estimate whether a place is in the sun and for how long,
              helping users choose optimal outdoor locations.
          </li>

          <li>
              <strong><a href="https://jveuxdusoleil.fr/#16/48.8551/2.3479">JveuxDuSoleil</a></strong> –
              a web application that simulates urban shadows and highlights sunlit areas on a map
              based on date, time, and building heights. It allows users to anticipate where sunlight
              will be available in cities.
          </li>
      </ul>
    </>
  );
};

export default ShadowPage;
