import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, Wallet, Plus, Calendar } from "lucide-react";
import ParametresPaieForm from "../../components/Budget/ParametresPaieForm";

/** Saison suivante au format "YYYY-YY" (affichage du bouton). */
function nextSaisonLabel(noms: string[]): string | null {
  const latest = noms.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort((a, b) => b.localeCompare(a))[0];
  if (!latest) return null;
  const start = parseInt(latest.slice(0, 4), 10) + 1;
  return `${start}-${((start + 1) % 100).toString().padStart(2, "0")}`;
}

/** Page de configuration de la paie, PAR SAISON, propre au module Budget. */
export default function ParametresPaie() {
  const saisons = useQuery(api.saisons.get);
  const userSettings = useQuery(api.users.getCurrentUserSettings);
  const createNext = useMutation(api.saisons.createNext);
  const isAdmin = userSettings?.role === "admin";

  const [saison, setSaison] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const data = useQuery(api.paie.getMasseSalariale, saison ? { saison } : "skip");

  // Saison par défaut = saison "par défaut" (ou la plus récente).
  useEffect(() => {
    if (!saison && saisons && saisons.length > 0) {
      const def = saisons.find((s) => s.isDefault) ?? saisons[0];
      setSaison(def.nom);
    }
  }, [saisons, saison]);

  const handleCreateNext = async () => {
    setCreating(true);
    try {
      const res = await createNext({});
      setSaison(res.nom);
      alert(`Saison ${res.nom} ajoutée (${res.lignesReprises} moniteurs repris).`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors de la création de la saison.");
    } finally {
      setCreating(false);
    }
  };

  const prochaine = saisons ? nextSaisonLabel(saisons.map((s) => s.nom)) : null;

  return (
    <div className="compta-page fade-in" style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <header className="page-header" style={{ marginBottom: "2rem" }}>
        <Link to="/budget" className="back-link">
          <ArrowLeft size={16} /> Retour à la masse salariale
        </Link>
        <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Wallet size={24} /> Paramètres de paie
        </h1>
        <p className="subtitle">Cotisations, marges et frais — configurables par saison.</p>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label className="form-label" htmlFor="saison" style={{ margin: 0 }}>Saison</label>
              <select
                id="saison"
                className="input-field"
                value={saison}
                onChange={(e) => setSaison(e.target.value)}
                style={{ width: "auto" }}
              >
                {(saisons ?? []).map((s) => (
                  <option key={s._id} value={s.nom}>{s.nom}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={creating || !saisons || saisons.length === 0}
              onClick={handleCreateNext}
              style={{ width: "auto", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              title="Crée la saison suivante en reprenant les paramètres et moniteurs de la dernière saison"
            >
              <Plus size={16} />
              {prochaine ? `Créer la saison ${prochaine}` : "Créer la saison suivante"}
            </button>
          </section>

          <section className="card glass-card">
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <Calendar size={20} /> Saison {saison}
            </h2>
            {!saison || data === undefined ? (
              <div>Chargement...</div>
            ) : !data.params ? (
              <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                Aucun paramètre pour la saison {saison}. Crée la saison (bouton ci-dessus)
                pour reprendre les paramètres de la saison précédente.
              </p>
            ) : (
              <ParametresPaieForm
                key={saison}
                saison={saison}
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
