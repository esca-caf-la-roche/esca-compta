import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

// Vue admin « Anomalies » : lignes du scrap courant NON légitimes pour la vague
// en cours (ni abonné·e N-1, ni élève en cours, ni demande validée). Inscriptions
// directes sans autorisation, à REJETER sur le site club ; non comptées par le
// compteur. Lecture seule (api.abo.compteur.vAnomalies, wave-aware). La liste
// rétrécit automatiquement quand un canal s'ouvre. Portage de admin-anomalies.js.

const VAGUES: Record<number, string> = {
  0: "Avant vague 1 — seuls les abonné·es validé·es N-1 sont légitimes",
  1: "Vague 1 — seuls les abonné·es validé·es N-1 sont légitimes",
  2: "Vague 2 — N-1 + élèves en cours d'escalade légitimes",
  3: "Vague 3 — ouvert à tous (N-1, élèves, demandes validées)",
};

export default function Anomalies() {
  const anomalies = useQuery(api.abo.compteur.vAnomalies);
  const compteur = useQuery(api.abo.compteur.vCompteur);

  if (anomalies === undefined) return <p>Chargement…</p>;

  const vague = compteur?.vague ?? 0;

  return (
    <div className="abo-admin-section">
      <p className="abo-admin-emphasis">
        {VAGUES[vague] ?? `Vague ${vague}`}
      </p>
      <p className="abo-admin-intro">
        Lignes du <strong>scrap courant</strong> sans autorisation pour la vague en
        cours : ni abonné·e validé·e N-1, ni élève en cours d'escalade, ni demande
        validée chez nous. Ces inscriptions directes sont{" "}
        <strong>à rejeter sur le site du club</strong> ; elles ne sont{" "}
        <strong>pas comptées</strong> par le compteur. La liste se met à jour avec
        le dernier scrap et rétrécit quand une nouvelle vague s'ouvre.
      </p>
      <p className="abo-admin-count">
        {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""}
      </p>

      {anomalies.length === 0 ? (
        <p className="abo-admin-empty">Aucune anomalie pour la vague courante.</p>
      ) : (
        <ul className="abo-admin-list">
          {anomalies.map((r, i) => {
            const nom =
              `${(r.prenom ?? "").trim()} ${(r.nom ?? "").trim()}`.trim() ||
              r.nom_prenom_normalise ||
              "—";
            return (
              <li
                key={i}
                className="abo-admin-card abo-admin-card--attention abo-admin-anomaly"
              >
                <div className="abo-admin-card-copy">
                  <strong>{nom}</strong>
                  <span className="abo-admin-meta">
                    Licence : {r.licence || "—"}
                  </span>
                  <span className="abo-admin-reason">{r.raison}</span>
                </div>
                {r.abonnement_valide && (
                  <span
                    className="abo-admin-badge abo-admin-badge--success"
                  >
                    Abonné·e validé·e
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
