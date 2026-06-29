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

  // Le taux est dérivé de l'augmentation dès qu'il existe une saison précédente
  // pour ce moniteur : taux = taux(N-1) × (1 + augmentation). Sinon (nouvel arrivant /
  // saison de référence), on saisit un taux d'entrée.
  const hasPrev = salarieToEdit?.tauxPrecedent != null;
  const tauxCalcule = hasPrev
    ? salarieToEdit!.tauxPrecedent! * (1 + (parseFloat(augmentationPct) || 0) / 100)
    : parseFloat(tauxHoraireBrut) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !nbHeuresAnnuel || !nbMois || (!hasPrev && !tauxHoraireBrut)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nbHeuresAnnuel: parseFloat(nbHeuresAnnuel),
        nbMois: parseFloat(nbMois),
        // Quand il y a une saison précédente, le serveur recalcule le taux depuis
        // l'augmentation ; sinon on envoie le taux d'entrée saisi.
        tauxHoraireBrut: hasPrev ? tauxCalcule : parseFloat(tauxHoraireBrut),
        augmentationPct:
          hasPrev ? (parseFloat(augmentationPct) || 0) : (augmentationPct ? parseFloat(augmentationPct) : undefined),
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

          {hasPrev ? (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label className="form-label" htmlFor="aug">
                  Augmentation vs N-1 (%) <span className="text-red-500">*</span>
                </label>
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
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label className="form-label">Taux horaire brut (€) — calculé</label>
                <input
                  type="text"
                  className="input-field"
                  value={`${tauxCalcule.toFixed(4)} €`}
                  readOnly
                  disabled
                  title="Calculé automatiquement à partir du taux N-1 et de l'augmentation"
                  style={{ background: "#f3f4f6" }}
                />
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="taux">
                Taux horaire brut d'entrée (€) <span className="text-red-500">*</span>
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
          )}

          {hasPrev && (
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "-0.5rem" }}>
              Taux saison précédente : <strong>{salarieToEdit!.tauxPrecedent!.toFixed(4)} €</strong> →
              avec +{parseFloat(augmentationPct) || 0} % : <strong>{tauxCalcule.toFixed(4)} €</strong>
            </p>
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
