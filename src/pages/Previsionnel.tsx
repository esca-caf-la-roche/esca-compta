import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Circle, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import PrevisionnelFormModal from "../components/PrevisionnelFormModal";
import type { Id } from "../../convex/_generated/dataModel";

export default function Previsionnel() {
  const previsionnels = useQuery(api.previsionnels.get);
  const deletePrevisionnel = useMutation(api.previsionnels.remove);
  const updatePrevisionnel = useMutation(api.previsionnels.update);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previsionnelToEdit, setPrevisionnelToEdit] = useState<any | null>(null);
  const [filterAnalytique, setFilterAnalytique] = useState<string>("Tous");

  const uniqueAnalytiques = useMemo(() => {
    if (!previsionnels) return [];
    const set = new Set(previsionnels.map((p: any) => p.analytiqueNom));
    return Array.from(set).sort();
  }, [previsionnels]);

  const filteredPrevisionnels = useMemo(() => {
    if (!previsionnels) return undefined;
    return previsionnels.filter((p: any) => {
      return filterAnalytique === "Tous" || p.analytiqueNom === filterAnalytique;
    });
  }, [previsionnels, filterAnalytique]);

  const stats = useMemo(() => {
    if (!filteredPrevisionnels) return { total: 0, realise: 0, recettes: 0, depenses: 0 };
    return filteredPrevisionnels.reduce(
      (acc, prev) => {
        acc.total += prev.montant;
        if (prev.montant >= 0) {
          acc.recettes += prev.montant;
        } else {
          acc.depenses += Math.abs(prev.montant);
        }
        if (prev.etat) acc.realise += prev.montant;
        return acc;
      },
      { total: 0, realise: 0, recettes: 0, depenses: 0 }
    );
  }, [filteredPrevisionnels]);

  const handleDelete = async (id: Id<"previsionnels">) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce prévisionnel ?")) {
      await deletePrevisionnel({ id });
    }
  };

  const openNewModal = () => {
    setPrevisionnelToEdit(null);
    setIsModalOpen(true);
  };

  const handleEdit = (prev: any) => {
    setPrevisionnelToEdit(prev);
    setIsModalOpen(true);
  };

  const toggleEtat = async (prev: any) => {
    await updatePrevisionnel({
      id: prev._id,
      etat: !prev.etat,
    });
  };

  return (
    <div className="compta-page fade-in">
      <header className="page-header flex-header" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3rem" }}>
        <div>
          <Link to="/compta" className="back-link">
            <ArrowLeft size={16} /> Retour à la comptabilité
          </Link>
          <h1>Prévisionnel</h1>
          <p className="subtitle">Budget et suivi analytique</p>
        </div>
        <button className="btn-primary" style={{ width: "auto" }} onClick={openNewModal}>
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
              {uniqueAnalytiques.map(a => <option key={a as string} value={a as string}>{a as string}</option>)}
            </select>
          </div>
        </div>
      )}

      {filteredPrevisionnels !== undefined && (
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
        ) : filteredPrevisionnels?.length === 0 ? (
          <div className="empty-state">
            <p>Aucun prévisionnel ne correspond à ce filtre.</p>
          </div>
        ) : (
          <div className="transactions-list" style={{ display: "table", width: "100%", borderCollapse: "collapse" }}>
            <div style={{ display: "table-row", fontWeight: "bold", borderBottom: "2px solid #eee" }}>
              <div style={{ display: "table-cell", padding: "1rem" }}>Nom</div>
              <div style={{ display: "table-cell", padding: "1rem" }}>Analytique BD</div>
              <div style={{ display: "table-cell", padding: "1rem", textAlign: "right" }}>Montant</div>
              <div style={{ display: "table-cell", padding: "1rem", textAlign: "center" }}>État</div>
              <div style={{ display: "table-cell", padding: "1rem", textAlign: "right" }}>Actions</div>
            </div>
            {filteredPrevisionnels?.map((prev: any) => {
              const isDepense = prev.montant < 0;
              return (
                <div key={prev._id} style={{ display: "table-row", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "table-cell", padding: "1rem", verticalAlign: "middle" }}>
                    {prev.nom}
                  </div>
                  <div style={{ display: "table-cell", padding: "1rem", verticalAlign: "middle" }}>
                    <span className="badge facture" style={{ boxShadow: "2px 2px 0px 0px #000" }}>
                      {prev.analytiqueNom}
                    </span>
                  </div>
                  <div style={{ display: "table-cell", padding: "1rem", textAlign: "right", verticalAlign: "middle", fontFamily: "monospace", color: isDepense ? "#e53e3e" : "inherit" }}>
                    {isDepense ? "- " : "+ "}
                    {Math.abs(prev.montant).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </div>
                  <div style={{ display: "table-cell", padding: "1rem", textAlign: "center", verticalAlign: "middle" }}>
                    <button 
                      onClick={() => toggleEtat(prev)} 
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                      title={prev.etat ? "Marquer comme non réalisé" : "Marquer comme réalisé"}
                    >
                      {prev.etat ? <CheckCircle color="green" /> : <Circle color="#ccc" />}
                    </button>
                  </div>
                  <div style={{ display: "table-cell", padding: "1rem", textAlign: "right", verticalAlign: "middle" }}>
                    <div className="tc-actions" style={{ justifyContent: "flex-end" }}>
                      <button className="btn-icon" onClick={() => handleEdit(prev)} title="Modifier">
                        <Edit2 size={16} />
                      </button>
                      <button className="btn-icon danger" onClick={() => handleDelete(prev._id)} title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
