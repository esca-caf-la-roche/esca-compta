import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../convex/_generated/api";

// Vérification des licences FFCAM des élèves EN COURS (abo_eleves_en_cours) :
// - Liste d'attente exclue (pas en cours).
// - Licence renseignée → toujours valide.
// - Licence vide → tolérance en septembre si l'élève était déjà en cours la
//   saison précédente (saison_precedente non vide), invalide sinon.
// Lecture seule : abo_eleves_en_cours est régénérée à chaque scrape du site
// club, aucune résolution n'est persistée ici — les candidats de l'annuaire
// abo_licences sont proposés à titre indicatif pour le suivi manuel.

const RAISON_LABEL: Record<string, string> = {
  licence_absente_hors_fenetre: "Licence absente (hors tolérance de septembre)",
  nouvel_eleve_sans_licence: "Nouvel élève sans licence saisie",
};

export default function LicencesEnCours() {
  const data = useQuery(api.abo.licencesEnCours.getElevesLicenceInvalide);

  return (
    <div className="licences-cours-page" style={{ padding: "1.5rem", maxWidth: "1100px", margin: "0 auto" }}>
      <header className="page-header">
        <Link to="/" className="back-link" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <ArrowLeft size={16} /> Retour au tableau de bord
        </Link>
        <h1>Licences élèves en cours</h1>
        <p className="subtitle">
          Élèves en cours (hors liste d'attente) sans licence FFCAM valide pour la saison.
        </p>
      </header>

      {data === undefined ? (
        <p>Chargement…</p>
      ) : (
        <>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 700,
              padding: "0.5rem 1rem",
              margin: "1rem 0",
              backgroundColor: "#fff",
              border: "var(--border-width, 3px) solid var(--border-color, #000)",
              boxShadow: "3px 3px 0px 0px var(--border-color, #000)",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>{data.total}</span>
            <span>élève{data.total > 1 ? "s" : ""} sans licence valide</span>
          </div>

          {data.total === 0 ? (
            <p style={{ color: "#6b7280" }}>Tous les élèves en cours ont une licence valide.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "1rem" }}>
              {data.eleves.map((e) => (
                <li
                  key={e.eleve_id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "1rem",
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ fontWeight: 700 }}>
                      {`${e.prenom ?? ""} ${e.nom ?? ""}`.trim() || "—"}
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "#b91c1c", fontWeight: 600 }}>
                      {RAISON_LABEL[e.raison] ?? e.raison}
                    </span>
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {e.cours ?? "Cours non renseigné"} {e.horaire ? `— ${e.horaire}` : ""}
                  </div>

                  {e.candidats.length > 0 && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Correspondances possibles dans l'annuaire des licences :
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {e.candidats.map((c) => {
                          const cn = `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "—";
                          return (
                            <li key={c.licence} style={{ padding: "0.2rem 0", fontSize: "0.9rem" }}>
                              {cn} — <code>{c.licence}</code>{" "}
                              <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                                {Math.round(c.score * 100)}%
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
