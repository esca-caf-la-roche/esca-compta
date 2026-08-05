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
    return <p className="abo-admin-empty">Chargement du compteur…</p>;
  }

  const max = c.places_max;
  const restantes = max - c.occupe;
  const pct = max > 0 ? Math.min(100, Math.round((c.occupe / max) * 100)) : 0;
  const seuilProche = Math.max(5, Math.round(max * 0.05));
  const etat = restantes < 0 ? "depassement" : restantes <= seuilProche ? "proche" : "ok";
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
    <section className={`abo-admin-jauge abo-admin-jauge--${etat}`}>
      <div className="abo-admin-jauge-header">
        <span className="abo-admin-jauge-total">
          {c.occupe} / {max}
        </span>
        <span className="abo-admin-jauge-alert">{alerte}</span>
      </div>
      <div className="abo-admin-jauge-track">
        <span className="abo-admin-jauge-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="abo-admin-jauge-detail">
        {VAGUES[c.vague] ?? `Vague ${c.vague}`} · {c.legit_scrap} inscription(s)
        légitime(s) + {c.validees_hors_legit} demande(s) validée(s) hors scrap{" "}
        <span className="abo-admin-jauge-anomalies">
          ({c.anomalies} anomalie{c.anomalies > 1 ? "s" : ""} non comptée
          {c.anomalies > 1 ? "s" : ""})
        </span>
      </p>
      <div className="abo-admin-jauge-actions">
        <button
          type="button"
          onClick={copier}
          className="abo-admin-link-button"
        >
          📋 Copier le code d'intégration (iframe)
        </button>
        {copie && (
          <span className="abo-admin-status abo-admin-status--success">
            ✓ Code copié
          </span>
        )}
      </div>
    </section>
  );
}
