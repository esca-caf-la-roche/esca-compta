import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { X, Save } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import type { Id } from "../../../convex/_generated/dataModel";

export interface SalarieRow {
  ligneId: Id<"salairesSaison">;
  salarieId: Id<"salaries">;
  nom: string;
  typeContrat: "CDII" | "CDI";
  nbHeuresAnnuel: number;
  nbMois: number;
  tauxHoraireBrut: number;
  augmentationPct: number | null;
  tauxPrecedent: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  salarieToEdit?: SalarieRow | null;
}

export default function SalarieFormModal({ isOpen, onClose, salarieToEdit }: Props) {
  const { season } = useSeason();
  const addSalarie = useMutation(api.paie.addSalarie);
  const updateSalarie = useMutation(api.paie.updateSalarie);

  const [nom, setNom] = useState("");
  const [typeContrat, setTypeContrat] = useState<"CDII" | "CDI">("CDII");
  const [nbHeuresAnnuel, setNbHeuresAnnuel] = useState("");
  const [nbMois, setNbMois] = useState("12");
  const [tauxHoraireBrut, setTauxHoraireBrut] = useState("");
  const [augmentationPct, setAugmentationPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (salarieToEdit) {
      setNom(salarieToEdit.nom);
      setTypeContrat(salarieToEdit.typeContrat);
      setNbHeuresAnnuel(String(salarieToEdit.nbHeuresAnnuel));
      setNbMois(String(salarieToEdit.nbMois));
      setTauxHoraireBrut(String(salarieToEdit.tauxHoraireBrut));
      setAugmentationPct(
        salarieToEdit.augmentationPct != null ? String(salarieToEdit.augmentationPct) : ""
      );
    } else {
      setNom("");
      setTypeContrat("CDII");
      setNbHeuresAnnuel("");
      setNbMois("12");
      setTauxHoraireBrut("");
      setAugmentationPct("");
    }
  }, [isOpen, salarieToEdit]);

  if (!isOpen) return null;

  // Applique l'augmentation saisie au taux de la saison précédente (aide à la saisie).
  const applyAugmentation = () => {
    const base = salarieToEdit?.tauxPrecedent;
    const pct = parseFloat(augmentationPct);
    if (base && !Number.isNaN(pct)) {
      setTauxHoraireBrut((base * (1 + pct / 100)).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !nbHeuresAnnuel || !nbMois || !tauxHoraireBrut) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nbHeuresAnnuel: parseFloat(nbHeuresAnnuel),
        nbMois: parseFloat(nbMois),
        tauxHoraireBrut: parseFloat(tauxHoraireBrut),
        augmentationPct: augmentationPct ? parseFloat(augmentationPct) : undefined,
      };
      if (salarieToEdit) {
        await updateSalarie({
          salarieId: salarieToEdit.salarieId,
          ligneId: salarieToEdit.ligneId,
          nom: nom.trim(),
          typeContrat,
          ...payload,
        });
      } else {
        await addSalarie({
          nom: nom.trim(),
          typeContrat,
          saison: season,
          ...payload,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {salarieToEdit ? "Modifier le salarié" : "Nouveau salarié"}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="nom">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              id="nom"
              type="text"
              className="input-field"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              placeholder="Ex: Clémentine"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="type">Type de contrat</label>
            <select
              id="type"
              className="input-field"
              value={typeContrat}
              onChange={(e) => setTypeContrat(e.target.value as "CDII" | "CDI")}
            >
              <option value="CDII">CDII (intermittent)</option>
              <option value="CDI">CDI</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="heures">
                Nb heures / an <span className="text-red-500">*</span>
              </label>
              <input
                id="heures"
                type="number"
                step="0.01"
                className="input-field"
                value={nbHeuresAnnuel}
                onChange={(e) => setNbHeuresAnnuel(e.target.value)}
                required
                placeholder="Ex: 740"
              />
            </div>
            <div className="form-group" style={{ flex: "1 1 100px" }}>
              <label className="form-label" htmlFor="mois">
                Nb mois <span className="text-red-500">*</span>
              </label>
              <input
                id="mois"
                type="number"
                step="1"
                className="input-field"
                value={nbMois}
                onChange={(e) => setNbMois(e.target.value)}
                required
                placeholder="12"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="taux">
                Taux horaire brut (€) <span className="text-red-500">*</span>
              </label>
              <input
                id="taux"
                type="number"
                step="0.01"
                className="input-field"
                value={tauxHoraireBrut}
                onChange={(e) => setTauxHoraireBrut(e.target.value)}
                required
                placeholder="Ex: 20.25"
              />
            </div>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="aug">Augmentation vs N-1 (%)</label>
              <input
                id="aug"
                type="number"
                step="0.01"
                className="input-field"
                value={augmentationPct}
                onChange={(e) => setAugmentationPct(e.target.value)}
                placeholder="Ex: 3"
              />
            </div>
          </div>

          {salarieToEdit?.tauxPrecedent != null && (
            <button
              type="button"
              className="btn-secondary"
              onClick={applyAugmentation}
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}
            >
              Appliquer l'augmentation sur le taux N-1 ({salarieToEdit.tauxPrecedent.toFixed(2)} €)
            </button>
          )}

          <div className="form-actions" style={{ marginTop: "2rem" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "auto" }}
            >
              <Save size={18} />
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
