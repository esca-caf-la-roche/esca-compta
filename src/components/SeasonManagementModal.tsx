import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { X, Save, Star, Trash2 } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SeasonManagementModal({ isOpen, onClose }: Props) {
  const saisons = useQuery(api.saisons.get);
  const createSaison = useMutation(api.saisons.create);
  const updateSaison = useMutation(api.saisons.update);
  const removeSaison = useMutation(api.saisons.remove);

  const [newSaisonName, setNewSaisonName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddSaison = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSaisonName.trim();
    if (!name) return;

    if (saisons?.some(s => s.nom === name)) {
      alert("Cette saison existe déjà.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSaison({ nom: name, isDefault: false });
      setNewSaisonName("");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'ajout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (id: Id<"saisons">) => {
    try {
      await updateSaison({ id, isDefault: true });
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour.");
    }
  };

  const handleDelete = async (id: Id<"saisons">) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette saison ? Elle ne doit contenir aucune donnée.")) {
      try {
        await removeSaison({ id });
      } catch (err: any) {
        console.error(err);
        alert(err.message || "Erreur lors de la suppression.");
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h2 className="modal-title">Gestion des Saisons</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
          
          <form onSubmit={handleAddSaison} style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: 2027-28"
              value={newSaisonName}
              onChange={e => setNewSaisonName(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ whiteSpace: "nowrap" }}>
              <Save size={16} style={{ marginRight: "0.5rem" }} /> Ajouter
            </button>
          </form>

          {saisons === undefined ? (
            <div>Chargement...</div>
          ) : (
            <div className="saisons-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {saisons.map((saison) => (
                <div key={saison._id} className="card glass-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", margin: 0 }}>
                  <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{saison.nom}</span>
                  
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {saison.isDefault ? (
                      <span className="badge" style={{ backgroundColor: "#fef08a", color: "#854d0e", display: "flex", alignItems: "center", gap: "0.25rem", boxShadow: "2px 2px 0px 0px #000" }}>
                        <Star size={14} fill="currentColor" /> Par défaut
                      </span>
                    ) : (
                      <button 
                        className="btn-secondary info" 
                        onClick={() => handleSetDefault(saison._id)}
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                      >
                        Définir par défaut
                      </button>
                    )}
                    
                    {!saison.isDefault && (
                      <button 
                        className="btn-icon danger" 
                        onClick={() => handleDelete(saison._id)}
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
