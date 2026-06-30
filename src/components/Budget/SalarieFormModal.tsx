import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { X, Save } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import type { Id } from "../../../convex/_generated/dataModel";

export type HeureSup = {
  designation: string;
  nbHeures: number;
  competition?: boolean;
};

export interface SalarieRow {
  ligneId: Id<"salairesSaison">;
  salarieId: Id<"salaries">;
  nom: string;
  typeContrat: "CDII" | "CDI";
  nbHeuresAnnuel: number; // total auto (cours + 5h réunion + heures sup)
  heuresLoisir: number;
  heuresCompetition: number;
  heuresSup: HeureSup[];
  heuresAuto: boolean; // true si un planning existe pour la saison
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

  type HeureSupForm = { designation: string; nbHeures: string; competition: boolean };

  const [nom, setNom] = useState("");
  const [typeContrat, setTypeContrat] = useState<"CDII" | "CDI">("CDII");
  const [nbMois, setNbMois] = useState("12");
  const [tauxHoraireBrut, setTauxHoraireBrut] = useState("");
  const [augmentationPct, setAugmentationPct] = useState("");
  const [heuresSup, setHeuresSup] = useState<HeureSupForm[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (salarieToEdit) {
      setNom(salarieToEdit.nom);
      setTypeContrat(salarieToEdit.typeContrat);
      setNbMois(String(salarieToEdit.nbMois));
      setTauxHoraireBrut(String(salarieToEdit.tauxHoraireBrut));
      setAugmentationPct(
        salarieToEdit.augmentationPct != null ? String(salarieToEdit.augmentationPct) : ""
      );
      setHeuresSup(
        (salarieToEdit.heuresSup ?? []).map((h) => ({
          designation: h.designation,
          nbHeures: String(h.nbHeures),
          competition: h.competition ?? false,
        }))
      );
    } else {
      setNom("");
      setTypeContrat("CDII");
      setNbMois("12");
      setTauxHoraireBrut("");
      setAugmentationPct("");
      setHeuresSup([]);
    }
  }, [isOpen, salarieToEdit]);

  const addHeureSup = () =>
    setHeuresSup((prev) => [...prev, { designation: "", nbHeures: "", competition: false }]);
  const updateHeureSup = (idx: number, patch: Partial<HeureSupForm>) =>
    setHeuresSup((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  const removeHeureSup = (idx: number) =>
    setHeuresSup((prev) => prev.filter((_, i) => i !== idx));

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
    if (!nom.trim() || !nbMois || (!hasPrev && !tauxHoraireBrut)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    const heuresSupClean = heuresSup
      .filter((h) => h.designation.trim() && parseFloat(h.nbHeures) > 0)
      .map((h) => ({
        designation: h.designation.trim(),
        nbHeures: parseFloat(h.nbHeures),
        competition: h.competition,
      }));
    setSaving(true);
    try {
      const payload = {
        heuresSup: heuresSupClean,
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

          {salarieToEdit && salarieToEdit.heuresAuto && (
            <div className="form-group">
              <label className="form-label">Nb heures / an — calculé automatiquement</label>
              <div
                style={{
                  background: "#f3f4f6",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  fontSize: "0.9rem",
                  color: "#374151",
                }}
              >
                <strong>{salarieToEdit.nbHeuresAnnuel.toFixed(1)} h</strong> au total
                <span style={{ color: "#6b7280" }}>
                  {" "}— Loisir {salarieToEdit.heuresLoisir.toFixed(1)} h · Compétition{" "}
                  {salarieToEdit.heuresCompetition.toFixed(1)} h
                </span>
                <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                  Heures de cours du planning + 5 h de réunion (loisir) + heures supplémentaires
                  ci-dessous.
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Heures supplémentaires</label>
            {heuresSup.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: "0 0 0.5rem" }}>
                Aucune. Ajoutez des heures (réunions, événements…) avec une désignation et une
                catégorie.
              </p>
            )}
            {heuresSup.map((h, idx) => (
              <div
                key={idx}
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}
              >
                <input
                  type="text"
                  className="input-field"
                  style={{ flex: "2 1 160px" }}
                  value={h.designation}
                  onChange={(e) => updateHeureSup(idx, { designation: e.target.value })}
                  placeholder="Désignation (ex: Stage été)"
                />
                <input
                  type="number"
                  step="0.5"
                  className="input-field"
                  style={{ flex: "1 1 90px" }}
                  value={h.nbHeures}
                  onChange={(e) => updateHeureSup(idx, { nbHeures: e.target.value })}
                  placeholder="Heures"
                />
                <label
                  style={{ flex: "1 1 120px", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={h.competition}
                    onChange={(e) => updateHeureSup(idx, { competition: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "#374151" }}>Compétition&nbsp;?</span>
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => removeHeureSup(idx)}
                  style={{ width: "auto", padding: "0 0.75rem" }}
                  aria-label="Supprimer"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={addHeureSup}
              style={{ width: "auto" }}
            >
              + Ajouter des heures
            </button>
          </div>

          <div className="form-group">
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
