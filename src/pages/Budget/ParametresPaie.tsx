import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, Wallet, Plus, Calendar } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import ParametresPaieForm from "../../components/Budget/ParametresPaieForm";

/** Saison suivante au format "YYYY-YY" (affichage du bouton). */
function nextSaisonLabel(noms: string[]): string | null {
  const latest = noms.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort((a, b) => b.localeCompare(a))[0];
  if (!latest) return null;
  const start = parseInt(latest.slice(0, 4), 10) + 1;
  return `${start}-${((start + 1) % 100).toString().padStart(2, "0")}`;
}

/** Page de configuration de la paie, propre au module Budget.
 *  Utilise la saison sélectionnée dans le header (pas de second sélecteur). */
export default function ParametresPaie() {
  const { season, setSeason, availableSeasons } = useSeason();
  const userSettings = useQuery(api.users.getCurrentUserSettings);
  const createNext = useMutation(api.saisons.createNext);
  const isAdmin = userSettings?.role === "admin";

  const [creating, setCreating] = useState(false);

  const data = useQuery(api.paie.getMasseSalariale, { saison: season });

  const handleCreateNext = async () => {
    setCreating(true);
    try {
      const res = await createNext({});
      setSeason(res.nom);
      alert(`Saison ${res.nom} ajoutée (${res.lignesReprises} moniteurs repris).`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors de la création de la saison.");
    } finally {
      setCreating(false);
    }
  };

  const prochaine = nextSaisonLabel(availableSeasons);

  return (
    <div className="compta-page fade-in" style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <header className="page-header" style={{ marginBottom: "2rem" }}>
        <Link to="/budget" className="back-link">
          <ArrowLeft size={16} /> Retour à la masse salariale
        </Link>
        <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Wallet size={24} /> Paramètres de paie — {season}
        </h1>
        <p className="subtitle">Cotisations, marges et frais de la saison {season} (sélectionnée en haut).</p>
      </header>

      {!isAdmin ? (
        <section className="card glass-card">
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
            Seul un administrateur peut modifier les paramètres de paie.
          </p>
        </section>
      ) : (
        <>
          <section className="card glass-card" style={{ marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, color: "#6b7280" }}>
              Besoin d'une nouvelle saison ? Elle reprend automatiquement les paramètres
              et moniteurs de la dernière saison.
            </p>
            <button
              type="button"
              className="btn-secondary"
              disabled={creating || availableSeasons.length === 0}
              onClick={handleCreateNext}
              style={{ width: "auto", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Plus size={16} />
              {prochaine ? `Créer la saison ${prochaine}` : "Créer la saison suivante"}
            </button>
          </section>

          <section className="card glass-card">
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <Calendar size={20} /> Saison {season}
            </h2>
            {data === undefined ? (
              <div>Chargement...</div>
            ) : !data.params ? (
              <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                Aucun paramètre pour la saison {season}. Crée la saison (bouton ci-dessus)
                ou reprends la saison précédente depuis la masse salariale.
              </p>
            ) : (
              <ParametresPaieForm
                key={season}
                saison={season}
                params={{
                  margeSecurite: data.params.margeSecurite,
                  indemniteCpPct: data.params.indemniteCpPct,
                  mutuelleSalarie: data.params.mutuelleSalarie,
                  mutuelleEmployeur: data.params.mutuelleEmployeur,
                  primeEquipementAnnuelle: data.params.primeEquipementAnnuelle,
                  fraisBulletin: data.params.fraisBulletin,
                  cotisationsSalariales: data.params.cotisationsSalariales,
                  cotisationsPatronales: data.params.cotisationsPatronales,
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
