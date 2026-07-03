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
    <div>
      <p style={{ fontWeight: 600, color: "#374151" }}>
        {VAGUES[vague] ?? `Vague ${vague}`}
      </p>
      <p style={{ color: "#6b7280", maxWidth: 680 }}>
        Lignes du <strong>scrap courant</strong> sans autorisation pour la vague en
        cours : ni abonné·e validé·e N-1, ni élève en cours d'escalade, ni demande
        validée chez nous. Ces inscriptions directes sont{" "}
        <strong>à rejeter sur le site du club</strong> ; elles ne sont{" "}
        <strong>pas comptées</strong> par le compteur. La liste se met à jour avec
        le dernier scrap et rétrécit quand une nouvelle vague s'ouvre.
      </p>
      <p style={{ fontWeight: 700 }}>
        {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""}
      </p>

      {anomalies.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>Aucune anomalie pour la vague courante.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
          {anomalies.map((r, i) => {
            const nom =
              `${(r.prenom ?? "").trim()} ${(r.nom ?? "").trim()}`.trim() ||
              r.nom_prenom_normalise ||
              "—";
            return (
              <li
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  border: "1px solid #fed7aa",
                  background: "#fff7ed",
                  borderRadius: 6,
                  padding: "0.6rem 0.8rem",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  <strong>{nom}</strong>
                  <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                    Licence : {r.licence || "—"}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#b45309" }}>{r.raison}</span>
                </div>
                {r.abonnement_valide && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.5rem",
                      borderRadius: 999,
                      background: "#16a34a22",
                      color: "#16a34a",
                      whiteSpace: "nowrap",
                    }}
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
