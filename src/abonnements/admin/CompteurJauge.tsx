import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMaintenantMinute } from "../lib/useMaintenantMinute";

// Jauge « occupé / plafond » + places restantes. La validation demande une
// confirmation et propose la liste d'attente lorsque le plafond est atteint.
// Compteur réactif aux données ; vague calculée par la query légère vaguesConfig.
// Bouton de copie du code
// d'intégration de l'iframe publique (compteur.html → route /#/compteur ici).
// Portage de compteurHtml() (src/pages/admin.js).

const VAGUES: Record<number, string> = {
  0: "Avant vague 1 (inscription directe)",
  1: "Vague 1 (N-1 uniquement)",
  2: "Vague 2 (N-1 + élèves)",
  3: "Vague 3 (ouvert à tous)",
};

export default function CompteurJauge() {
  const maintenantMs = useMaintenantMinute();
  const c = useQuery(api.abo.compteur.vCompteur, {});
  const cfg = useQuery(api.abo.config.vaguesConfig, { maintenantMs });
  const [copie, setCopie] = useState(false);

  if (c === undefined || cfg === undefined) {
    return <p className="abo-admin-empty">Chargement du compteur…</p>;
  }

  const max = c.places_max;
  const restantes = max - c.total_affiche;
  const pct = max > 0 ? Math.min(100, Math.round((c.total_affiche / max) * 100)) : 0;
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
          {c.total_affiche} / {max}
        </span>
        <span className="abo-admin-jauge-alert">{alerte}</span>
      </div>
      <div className="abo-admin-jauge-track">
        <span className="abo-admin-jauge-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="abo-admin-jauge-detail">{VAGUES[cfg.vague] ?? `Vague ${cfg.vague}`}</p>
      <section className="abo-admin-counter-explanation" aria-label="Règle de calcul du compteur">
        <h3>Ce qui est compté</h3>
        <p>
          Total inscrit = les statuts « Oui » + « Non » du site du club. Les statuts
          « Bloqué » ne sont pas comptés. Le compteur ajoute ensuite les demandes
          portail validées qui ne figurent pas déjà sur le site.
          Après cette mise à jour, synchronisez le site pour distinguer correctement
          les anciens statuts « Non » et « Bloqué ».
        </p>
      </section>
      <section className="abo-admin-counter-details" aria-label="Détail des inscriptions et demandes">
        <div className="abo-admin-counter-group">
          <h3>Site du club</h3>
          <dl className="abo-admin-counter-grid">
            <CompteurDetail label="Total inscrit" valeur={c.abonnements_site_valides + c.abonnements_site_non_valides_a_suivre} />
            <CompteurDetail label="Oui" valeur={c.abonnements_site_valides} />
            <CompteurDetail label="Non" valeur={c.abonnements_site_non_valides_a_suivre} />
            <CompteurDetail label="Bloquées" valeur={c.bloquees} attention />
            <CompteurDetail label="Anomalies" valeur={c.anomalies} attention />
          </dl>
        </div>
        <div className="abo-admin-counter-group">
          <h3>Demandes du portail</h3>
          <dl className="abo-admin-counter-grid">
            <CompteurDetail label="Validées" valeur={c.demandes_validees} />
            <CompteurDetail label="Liste d’attente" valeur={c.demandes_liste_attente} />
            <CompteurDetail label="Refusées" valeur={c.demandes_refusees} />
            <CompteurDetail label="À traiter" valeur={c.demandes_a_traiter} attention />
          </dl>
        </div>
      </section>
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

function CompteurDetail({
  label,
  valeur,
  attention = false,
}: {
  label: string;
  valeur: number;
  attention?: boolean;
}) {
  return (
    <div className={`abo-admin-counter-stat${attention ? " abo-admin-counter-stat--attention" : ""}`}>
      <dt>{label}</dt>
      <dd>{valeur}</dd>
    </div>
  );
}
