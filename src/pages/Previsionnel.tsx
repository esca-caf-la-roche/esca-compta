import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Circle, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import PrevisionnelFormModal from "../components/PrevisionnelFormModal";
import type { Id } from "../../convex/_generated/dataModel";
import { useSeason } from "../contexts/SeasonContext";

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

export default function Previsionnel() {
  const { season } = useSeason();
  const deletePrevisionnel = useMutation(api.previsionnels.remove);
  const updatePrevisionnel = useMutation(api.previsionnels.update);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previsionnelToEdit, setPrevisionnelToEdit] = useState<PrevisionnelRecord | null>(null);
  const [filterAnalytique, setFilterAnalytique] = useState<string>("Tous");
  const [filterEtat, setFilterEtat] = useState<string>("Tous");

  const statsQuery = useQuery(api.previsionnels.getStats, { saison: season });
  
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
    <div className="compta-page fade-in">
      <header className="page-header" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3rem" }}>
        <div>
          <Link to="/compta" className="back-link">
            <ArrowLeft size={16} /> Retour à la comptabilité
          </Link>
          <h1>Prévisionnel</h1>
          <p className="subtitle">Budget et suivi analytique</p>
        </div>
        <button className="btn-primary" style={{ width: "auto", flexGrow: 1, minWidth: "200px" }} onClick={openNewModal}>
          <Plus size={20} style={{ display: "inline-block", marginRight: "0.5rem", verticalAlign: "middle" }} />
          Nouveau Prévisionnel
        </button>
      </header>

      {previsionnels !== undefined && previsionnels.length > 0 && (
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
                {stats.recettes.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
          <div className="tile-card bg-primary" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Dépenses</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {stats.depenses.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </h3>
            </div>
          </div>
          <div className="tile-card bg-info" style={{ padding: "1.5rem" }}>
            <div className="tile-content">
              <p className="text-sm tracking-widest text-gray-500 uppercase" style={{ fontSize: "0.8rem", color: "#000" }}>Total Budgeté</p>
              <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>
                {stats.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
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
        ) : previsionnels?.length === 0 ? (
          <div className="empty-state">
            <p>Aucun prévisionnel ne correspond à ce filtre.</p>
          </div>
        ) : (
          <div className="transactions-list">
            {previsionnels?.map((prev: PrevisionnelRecord) => {
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
                    <span className="badge facture" style={{ boxShadow: "2px 2px 0px 0px #000" }}>
                      Analytique : {prev.analytiqueNom}
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
    </div>
  );
}
