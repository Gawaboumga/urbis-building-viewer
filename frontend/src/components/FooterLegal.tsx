export default function FooterLegal() {
  return (
    <footer style={{ marginTop: "2rem", padding: "1rem", fontSize: "0.8rem", color: "#899", borderTop: "1px solid #ddd", }} >
    <p>
        Using UrbIS data - available as open data:
        <a href="https://be.brussels/fr/propos-de-la-region/les-donnees-urbis" target="_blank" rel="noopener">
        https://be.brussels/fr/propos-de-la-region/les-donnees-urbis
        </a>
    </p>

    <p>
        © OpenStreetMap - Data available under the ODbL 1.0 license.
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
        https://www.openstreetmap.org/copyright
        </a>
    </p>

    <p><strong>Liability limitation:</strong> All measurements are indicative. No responsibility is taken for errors, inaccuracies, or any consequences resulting from the use of this tool.</p>

    <p><strong>No warranty:</strong> The data is provided "as is". It may be incomplete, approximate, or outdated.</p>

    <p><strong>Reasonable use:</strong> This site must not be used for legal, technical, or administrative decisions without professional validation.</p>

    <p><strong>Not a replacement for a licensed surveyor:</strong> The displayed measurements have no legal value and do not replace the work of a certified land surveyor.</p>

    <p><strong>User responsibility:</strong> The user remains solely responsible for how they use the data and results provided.</p>

    <p><strong>Open Data licensing:</strong> Any reuse must comply with the UrbIS open data license and citation requirements.</p>
    </footer>
  );
}
