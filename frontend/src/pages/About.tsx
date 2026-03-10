import React from "react";

const About: React.FC = () => {
  return (
    <>
      <header>
        <h1>Brussels Building Surface & Measurement Explorer</h1>
        <p>
          Visualize every building in Brussels, measure distances, and calculate
          roof and facade surface areas in an intuitive web interface.
        </p>
      </header>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading">Key features</h2>
        <ul>
          <li>
            <strong>3D building visualization:</strong> Explore Brussels
            buildings from multiple angles on an interactive map.
          </li>
          <li>
            <strong>Precise measurements:</strong> Take linear measurements
            between points on roofs, facades, and parcels.
          </li>
          <li>
            <strong>Surface calculation:</strong> Instantly compute roof,
            facade, and footprint surface areas.
          </li>
          <li>
            <strong>Brussels-focused dataset:</strong> Optimized for urban
            analysis, renovation planning, and solar potential studies in
            Brussels.
          </li>
        </ul>
      </section>

      <section aria-labelledby="use-cases-heading">
        <h2 id="use-cases-heading">Use cases</h2>
        <p>
          Architects, urban planners, energy consultants, and property owners
          can quickly estimate roof surfaces for solar panels, facade areas for
          insulation projects, and more—without on-site measurements.
        </p>
      </section>

      <section aria-labelledby="cta-heading">
        <h2 id="cta-heading">Start exploring Brussels buildings</h2>
        <p>
          Launch the interactive map to begin measuring roofs and facades across
          Brussels.
        </p>
        <a href="/" className="cta-button">
          Open the building explorer
        </a>
      </section>
    </>
  );
};

export default About;
