import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// Compteur public embarquable (iframe du site club). Lit l'agrégat ANONYME
// api.abo.compteur.compteurPublic (aucune donnée nominative). Réactif Convex :
// se met à jour tout seul quand le scrap / les validations changent — pas de
// polling. Styles inline, fond transparent : s'adapte à la page hôte.
// Portage de compteur.html + src/embed/compteur.js.

const INK = "#111111";
const PAPER = "#f5f3ea";
const DANGER = "#e5484d";

export default function Compteur() {
  const data = useQuery(api.abo.compteur.compteurPublic);

  const wrap: React.CSSProperties = {
    padding: 4,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    color: INK,
    background: "transparent",
  };

  if (data === undefined) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: "0.85rem", color: "#5a574d", margin: 0 }}>Chargement…</p>
      </div>
    );
  }

  const { places_max, places_restantes } = data;
  const restantes = Math.max(0, places_restantes);
  const complet = places_restantes <= 0;
  const pct =
    places_max > 0
      ? Math.min(100, Math.round(((places_max - restantes) / places_max) * 100))
      : 0;

  return (
    <div style={wrap}>
      <div
        style={{
          background: "#fff",
          border: `2px solid ${INK}`,
          boxShadow: `4px 4px 0 ${INK}`,
          padding: "0.8rem 1rem",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            marginBottom: "0.3rem",
          }}
        >
          Places escalade autonomie
        </div>
        <div
          style={{
            fontSize: "2.4rem",
            fontWeight: 800,
            lineHeight: 1,
            color: complet ? DANGER : INK,
          }}
        >
          {restantes}
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#5a574d" }}>
            {" "}
            / {places_max}
          </span>
        </div>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, marginTop: "0.15rem" }}>
          {complet ? "Complet" : "places disponibles"}
        </div>
        <div
          style={{
            marginTop: "0.5rem",
            height: "0.7rem",
            border: `2px solid ${INK}`,
            background: PAPER,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${pct}%`,
              background: complet ? DANGER : INK,
            }}
          />
        </div>
      </div>
    </div>
  );
}
