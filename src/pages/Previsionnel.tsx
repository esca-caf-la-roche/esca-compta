import { useMemo, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Plus, Edit2, Trash2, CheckCircle, Circle, Filter, Lock } from "lucide-react";
import PrevisionnelFormModal from "../components/PrevisionnelFormModal";
import type { Id } from "../../convex/_generated/dataModel";
import { useSeason } from "../contexts/SeasonContext";
import { getPastelColor } from "../utils/colors";

/** Nom de l'analytique alimentée automatiquement par la masse salariale. */
const ANALYTIQUE_SALAIRES = "SAL01 : Salariés";

type PrevisionnelProps = {
  /** Coût employeur annuel de la masse salariale (sans marge). Injecté en
   *  ligne automatique sous l'analytique « SAL01 : Salariés » si renseigné. */
  masseSalarialeCout?: number;
};

type PrevisionnelRecord = {
  _id: Id<"previsionnels">;
  _creationTime: number;
  nom: string;
  montant: number;
  etat: boolean;
  analytiqueId: Id<"analytiques">;
  analytiqueNom: string;
  saison: string;
};

export default function Previsionnel({ masseSalarialeCout }: PrevisionnelProps = {}) {
  const { season } = useSeason();
  const deletePrevisionnel = useMutation(api.previsionnels.remove);
  const updatePrevisionnel = useMutation(api.previsionnels.update);
  const analytiques = useQuery(api.analytiques.get);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previsionnelToEdit, setPrevisionnelToEdit] = useState<PrevisionnelRecord | null>(null);
  const [filterAnalytique, setFilterAnalytique] = useState<string>("Tous");
  const [filterEtat, setFilterEtat] = useState<string>("Tous");

  const statsQuery = useQuery(api.previsionnels.getStats, {
    saison: season,
    filterAnalytiqueId: filterAnalytique,
    filterEtat: filterEtat,
  });
  
  const { results: previsionnels, status, loadMore } = usePaginatedQuery(
    api.previsionnels.get, 
    { 
      saison: season,
      filterAnalytiqueId: filterAnalytique,
      filterEtat: filterEtat
    },
    { initialNumItems: 50 }
  );

  const uniqueAnalytiques = statsQuery?.uniqueAnalytiques || [];

  const stats = statsQuery?.stats || { total: 0, realise: 0, recettes: 0, depenses: 0 };

  // Ligne automatique : la masse salariale (coût employeur) est reportée en
  // dépense sous l'analytique « SAL01 : Salariés ». Calculée, non modifiable.
  const autoLine = useMemo(() => {
    if (masseSalarialeCout == null || masseSalarialeCout <= 0 || !analytiques) return null;
    const ana =
      analytiques.find((a) => a.nom === ANALYTIQUE_SALAIRES) ??
      analytiques.find((a) => a.nom.startsWith("SAL01"));
    if (!ana) return null;
    return {
      _id: "auto-masse-salariale" as const,
      nom: "Masse salariale (calcul automatique)",
      montant: -Math.round(masseSalarialeCout),
      analytiqueId: ana._id,
      analytiqueNom: ana.nom,
    };
  }, [masseSalarialeCout, analytiques]);

  // La ligne auto (état « non réalisé », c'est une dépense prévue) respecte les
  // filtres actifs avant d'être comptée dans les tuiles et affichée.
  const autoVisible =
    !!autoLine &&
    (filterAnalytique === "Tous" || filterAnalytique === autoLine.analytiqueId) &&
    (filterEtat === "Tous" || filterEtat === "Non Réalisé");

  const displayStats = autoVisible
    ? {
        total: stats.total + autoLine!.montant,
        depenses: stats.depenses + Math.abs(autoLine!.montant),
        recettes: stats.recettes,
        realise: stats.realise,
      }
    : stats;


  const handleDelete = async (id: Id<"previsionnels">) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce prévisionnel ?")) {
      await deletePrevisionnel({ id });
    }
  };

  const openNewModal = () => {
    setPrevisionnelToEdit(null);
    setIsModalOpen(true);
  };

  const handleEdit = (prev: PrevisionnelRecord) => {
    setPrevisionnelToEdit(prev);
    setIsModalOpen(true);
  };

  const toggleEtat = async (prev: PrevisionnelRecord) => {
    await updatePrevisionnel({
      id: prev._id,
      etat: !prev.etat,
    });
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <button className="btn-primary" style={{ width: "auto" }} onClick={openNewModal}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
          Nouveau Prévisionnel
        </button>
      </div>

      {uniqueAnalytiques.length > 0 && (
        <div className="filter-bar fade-in" style={{ marginBottom: "2rem" }}>
          <div className="filter-group">
            <Filter size={18} color="#000" />
            <span className="filter-label" style={{ marginRight: "1rem" }}>Filtres :</span>
          </div>
          <div className="filter-group">
            <label htmlFor="filter-ana" className="filter-label">Analytique</label>
            <select
              id="filter-ana"
              className="filter-dropdown"
              value={filterAnalytique}
              onChange={(e) => setFilterAnalytique(e.target.value)}
            >
              <option value="Tous">Tous</option>
              {uniqueAnalytiques.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="filter-etat" className="filter-label">État</label>
            <select
              id="filter-etat"
              className="filter-dropdown"
              value={filterEtat}
              onChange={(e) => setFilterEtat(e.target.value)}
            >
              <option value="Tous">Tous</option>
              <option value="Réalisé">Réalisé</option>
              <option value="Non Réalisé">Non Réalisé</option>
            </select>
          </div>
        </div>
      )}

      {statsQuery !== undefined && (
        <div className="tiles-grid mt-6" style={{ marginBottom: "2rem" }}>
          <div className="tile-card bg-success" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Recettes</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {displayStats.recettes.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
          <div className="tile-card bg-primary" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Dépenses</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {displayStats.depenses.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
          <div className="tile-card bg-info" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Budgeté</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {displayStats.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
          <div className="tile-card bg-warning" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Réalisé (Coché)</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {stats.realise.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
        </div>
      )}

      <section className="card glass-card mt-6" style={{ marginTop: 0 }}>
        <h2>Lignes Prévisionnelles</h2>
        
        {previsionnels === undefined ? (
          <div className="loading">Chargement des données...</div>
        ) : previsionnels.length === 0 && !autoVisible ? (
          <div className="empty-state">
            <p>Aucun prévisionnel ne correspond à ce filtre.</p>
          </div>
        ) : (
          <div className="transactions-list">
            {autoVisible && (
              <div key={autoLine!._id} className="transaction-card" style={{ borderLeft: "4px solid #2563eb" }}>
                <div className="tc-header">
                  <div className="tc-header-main">
                    <div className="tc-title" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <Lock size={20} color="#2563eb" aria-label="Ligne automatique (lecture seule)" />
                      <span>{autoLine!.nom}</span>
                    </div>
                  </div>
                  <div className="tc-amount depense">
                    - {Math.abs(autoLine!.montant).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </div>
                </div>
                <div className="tc-badges" style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="badge facture" style={{ backgroundColor: getPastelColor(autoLine!.analytiqueNom), boxShadow: "2px 2px 0px 0px #000", color: "#1a1a1a", border: "1px solid #1a1a1a" }}>
                    {autoLine!.analytiqueNom}
                  </span>
                  <span className="badge" style={{ backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #1e40af" }}>
                    Auto · masse salariale
                  </span>
                </div>
              </div>
            )}
            {previsionnels.map((prev: PrevisionnelRecord) => {
              const isDepense = prev.montant < 0;
              return (
                <div key={prev._id} className="transaction-card">
                  <div className="tc-header">
                    <div className="tc-header-main">
                      <div className="tc-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button 
                          onClick={() => toggleEtat(prev)} 
                          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
                          title={prev.etat ? "Marquer comme non réalisé" : "Marquer comme réalisé"}
                        >
                          {prev.etat ? <CheckCircle color="green" size={24} /> : <Circle color="#ccc" size={24} />}
                        </button>
                        <span>{prev.nom}</span>
                      </div>
                    </div>
                    <div className={`tc-amount ${isDepense ? 'depense' : 'recette'}`}>
                      {isDepense ? "- " : "+ "}
                      {Math.abs(prev.montant).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </div>
                  </div>
                  <div className="tc-badges" style={{ marginTop: "0.5rem" }}>
                    <span className="badge facture" style={{ backgroundColor: getPastelColor(prev.analytiqueNom), boxShadow: "2px 2px 0px 0px #000", color: "#1a1a1a", border: "1px solid #1a1a1a" }}>
                      {prev.analytiqueNom}
                    </span>
                  </div>
                  <div className="tc-actions">
                    <button className="btn-icon" onClick={() => handleEdit(prev)} title="Modifier" aria-label="Modifier">
                      <Edit2 size={16} />
                    </button>
                    <button className="btn-icon danger" onClick={() => handleDelete(prev._id)} title="Supprimer" aria-label="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {status === "CanLoadMore" && (
          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <button className="btn-secondary" onClick={() => loadMore(50)}>
              Charger plus de prévisionnels
            </button>
          </div>
        )}
      </section>

      <PrevisionnelFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        previsionnelToEdit={previsionnelToEdit}
      />
    </>
  );
}
