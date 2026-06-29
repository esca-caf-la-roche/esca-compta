import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, Wallet, Calendar } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import ParametresPaieForm from "../../components/Budget/ParametresPaieForm";

/** Page de configuration de la paie, propre au module Budget.
 *  Utilise la saison sélectionnée dans le header (pas de second sélecteur).
 *  La création de saison se fait depuis Configurations → Saisons. */
export default function ParametresPaie() {
  const { season } = useSeason();
  const userSettings = useQuery(api.users.getCurrentUserSettings);
  const isAdmin = userSettings?.role === "admin";

  const data = useQuery(api.paie.getMasseSalariale, { saison: season });

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
        <section className="card glass-card">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <Calendar size={20} /> Saison {season}
          </h2>
          {data === undefined ? (
            <div>Chargement...</div>
          ) : !data.params ? (
            <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
              Aucun paramètre pour la saison {season}. Crée la saison depuis
              Configurations → Saisons, ou ouvre-la dans la masse salariale pour
              reprendre la saison précédente.
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
      )}
    </div>
  );
}
