import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

// Jauge « occupé / plafond » + places restantes (aide à la décision, pas de
// blocage). Wave-aware via api.abo.compteur.vCompteur. Bouton de copie du code
// d'intégration de l'iframe publique (compteur.html → route /#/compteur ici).
// Portage de compteurHtml() (src/pages/admin.js).

const VAGUES: Record<number, string> = {
  0: "Avant vague 1 (inscription directe)",
  1: "Vague 1 (N-1 uniquement)",
  2: "Vague 2 (N-1 + élèves)",
  3: "Vague 3 (ouvert à tous)",
};

export default function CompteurJauge() {
  const c = useQuery(api.abo.compteur.vCompteur);
  const [copie, setCopie] = useState(false);

  if (c === undefined) {
    return <p style={{ color: "#6b7280" }}>Chargement du compteur…</p>;
  }

  const max = c.places_max;
  const restantes = max - c.occupe;
  const pct = max > 0 ? Math.min(100, Math.round((c.occupe / max) * 100)) : 0;
  const seuilProche = Math.max(5, Math.round(max * 0.05));
  const etat = restantes < 0 ? "depassement" : restantes <= seuilProche ? "proche" : "ok";
  const couleur = etat === "depassement" ? "#dc2626" : etat === "proche" ? "#d97706" : "#16a34a";
  const alerte =
    etat === "depassement"
      ? `⚠ Plafond dépassé de ${-restantes}`
      : etat === "proche"
        ? `⚠ Plus que ${restantes} place${restantes > 1 ? "s" : ""}`
        : `${restantes} place${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`;

  const iframe = `<iframe src="${window.location.origin}/#/compteur" width="280" height="150" style="border:0;overflow:hidden" title="Places escalade autonomie" loading="lazy"></iframe>`;

  async function copier() {
    try {
      await navigator.clipboard.writeText(iframe);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* clipboard indisponible : silencieux */
    }
  }

  return (
    <section
      style={{
        border: `2px solid ${couleur}`,
        borderRadius: 8,
        padding: "0.85rem 1rem",
        background: couleur + "0d",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "1.35rem", fontWeight: 800 }}>
          {c.occupe} / {max}
        </span>
        <span style={{ fontWeight: 700, color: couleur }}>{alerte}</span>
      </div>
      <div
        style={{
          marginTop: "0.5rem",
          height: "0.6rem",
          borderRadius: 999,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <span
          style={{ display: "block", height: "100%", width: `${pct}%`, background: couleur }}
        />
      </div>
      <p style={{ fontSize: "0.85rem", color: "#374151", margin: "0.6rem 0 0" }}>
        {VAGUES[c.vague] ?? `Vague ${c.vague}`} · {c.legit_scrap} inscription(s)
        légitime(s) + {c.validees_hors_legit} demande(s) validée(s) hors scrap{" "}
        <span style={{ color: "#9ca3af" }}>
          ({c.anomalies} anomalie{c.anomalies > 1 ? "s" : ""} non comptée
          {c.anomalies > 1 ? "s" : ""})
        </span>
      </p>
      <div style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          onClick={copier}
          style={{
            background: "none",
            border: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: 0,
            fontWeight: 600,
          }}
        >
          📋 Copier le code d'intégration (iframe)
        </button>
        {copie && (
          <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "#16a34a" }}>
            ✓ Code copié
          </span>
        )}
      </div>
    </section>
  );
}
