import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { aboError } from "../lib/errors";

// Bouton admin « Synchroniser le site club » (Phase H). Déclenche à la demande le
// scrap des abonnés (+ matching) puis l'import des élèves en cours — les mêmes
// tâches que les crons horaires. Réservé aux admins (garde côté serveur).
export default function SyncClub() {
  const synchroniser = useAction(api.abo.scrap.synchroniserClub);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancer() {
    setEnCours(true);
    setMessage(null);
    setErreur(null);
    try {
      const r = await synchroniser({});
      setMessage(
        `Abonnés : ${r.abonnes.upsertees} synchronisés, ${r.abonnes.maj} personne(s) mise(s) à jour. ` +
          `Élèves en cours : ${r.eleves.avecLicence + r.eleves.sansLicence} importé(s).`,
      );
    } catch (err) {
      setErreur(aboError(err).message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={lancer}
        disabled={enCours}
        style={{
          background: "#111827",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "0.5rem 1rem",
          fontWeight: "bold",
          cursor: enCours ? "default" : "pointer",
          opacity: enCours ? 0.6 : 1,
        }}
      >
        {enCours ? "Synchronisation…" : "Synchroniser le site club"}
      </button>
      {message && <span style={{ color: "#047857", fontSize: "0.9rem" }}>{message}</span>}
      {erreur && <span style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{erreur}</span>}
    </div>
  );
}
