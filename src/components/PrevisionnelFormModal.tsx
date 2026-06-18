import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { X, Save, AlertCircle } from "lucide-react";

interface PrevisionnelFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  previsionnelToEdit?: any;
}

export default function PrevisionnelFormModal({ isOpen, onClose, previsionnelToEdit }: PrevisionnelFormModalProps) {
  const [nom, setNom] = useState("");
  const [montant, setMontant] = useState("");
  const [etat, setEtat] = useState(false);
  const [analytiqueId, setAnalytiqueId] = useState<string>("");

  const analytiques = useQuery(api.analytiques.get) || [];
  const addPrevisionnel = useMutation(api.previsionnels.add);
  const updatePrevisionnel = useMutation(api.previsionnels.update);
  const addAnalytique = useMutation(api.analytiques.add);

  const [isAddingAna, setIsAddingAna] = useState(false);
  const [newAnaNom, setNewAnaNom] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (previsionnelToEdit) {
        setNom(previsionnelToEdit.nom);
        setMontant(previsionnelToEdit.montant.toString());
        setEtat(previsionnelToEdit.etat);
        setAnalytiqueId(previsionnelToEdit.analytiqueId);
      } else {
        setNom("");
        setMontant("");
        setEtat(false);
        setAnalytiqueId("");
      }
      setIsAddingAna(false);
    }
  }, [isOpen, previsionnelToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nom || !montant || !analytiqueId) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    try {
      const montantNum = parseFloat(montant);
      
      if (previsionnelToEdit) {
        await updatePrevisionnel({
          id: previsionnelToEdit._id,
          nom,
          montant: montantNum,
          etat,
          analytiqueId: analytiqueId as any,
        });
      } else {
        await addPrevisionnel({
          nom,
          montant: montantNum,
          etat,
          analytiqueId: analytiqueId as any,
        });
      }
      onClose();
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de l'enregistrement.");
    }
  };

  const handleAddNewAna = async () => {
    if (newAnaNom.trim() !== "") {
      const newId = await addAnalytique({ nom: newAnaNom.trim() });
      setAnalytiqueId(newId);
      setIsAddingAna(false);
      setNewAnaNom("");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{previsionnelToEdit ? "Modifier le Prévisionnel" : "Nouveau Prévisionnel"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="nom">Nom <span className="text-red-500">*</span></label>
            <input
              id="nom"
              type="text"
              className="input-field"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              placeholder="Ex: Achat matériel"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="montant">Montant (€) <span className="text-red-500">*</span></label>
            <input
              id="montant"
              type="number"
              step="0.01"
              className="input-field"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              required
              placeholder="Ex: -500 ou 1000"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="analytique">Analytique BD <span className="text-red-500">*</span></label>
            {isAddingAna ? (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="input-field"
                  value={newAnaNom}
                  onChange={(e) => setNewAnaNom(e.target.value)}
                  placeholder="Nouveau code analytique"
                  autoFocus
                />
                <button type="button" className="btn-primary" onClick={handleAddNewAna}>OK</button>
                <button type="button" className="btn-secondary" onClick={() => setIsAddingAna(false)}>Annuler</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  id="analytique"
                  className="input-field"
                  value={analytiqueId}
                  onChange={(e) => {
                    if (e.target.value === "NEW") {
                      setIsAddingAna(true);
                    } else {
                      setAnalytiqueId(e.target.value);
                    }
                  }}
                  required
                >
                  <option value="">-- Sélectionner un analytique --</option>
                  {analytiques.map((ana) => (
                    <option key={ana._id} value={ana._id}>{ana.nom}</option>
                  ))}
                  <option value="NEW">+ Ajouter un nouveau...</option>
                </select>
              </div>
            )}
          </div>

          <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
            <input
              id="etat"
              type="checkbox"
              checked={etat}
              onChange={(e) => setEtat(e.target.checked)}
              style={{ width: "20px", height: "20px", accentColor: "black" }}
            />
            <label className="form-label" htmlFor="etat" style={{ margin: 0 }}>Réalisé ?</label>
          </div>

          <div className="form-actions" style={{ marginTop: "2rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "auto" }}>
              <Save size={18} />
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
