import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import { JOURS } from "../../utils/planning";
import type { Id } from "../../../convex/_generated/dataModel";

export interface Seance {
  jour: number;
  heureDebut: string;
  dureeHeures: number;
}

export interface CoursRow {
  _id: Id<"cours">;
  nom: string;
  tarifAnnuel: number;
  lienPaiementCB?: string;
  nbElevesMax: number;
  nbSemaines: number;
  salarieId: Id<"salaries">;
  seances: Seance[];
}

interface MoniteurOption {
  salarieId: Id<"salaries">;
  nom: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coursToEdit?: CoursRow | null;
  moniteurs: MoniteurOption[];
}

type SeanceForm = { jour: number; heureDebut: string; dureeHeures: string };

const emptySeance = (): SeanceForm => ({ jour: 0, heureDebut: "18:00", dureeHeures: "1.5" });

export default function CoursFormModal({ isOpen, onClose, coursToEdit, moniteurs }: Props) {
  const { season } = useSeason();
  const addCours = useMutation(api.cours.addCours);
  const updateCours = useMutation(api.cours.updateCours);

  const [nom, setNom] = useState("");
  const [tarifAnnuel, setTarifAnnuel] = useState("");
  const [lienPaiementCB, setLienPaiementCB] = useState("");
  const [nbElevesMax, setNbElevesMax] = useState("");
  const [nbSemaines, setNbSemaines] = useState("");
  const [salarieId, setSalarieId] = useState<string>("");
  const [seances, setSeances] = useState<SeanceForm[]>([emptySeance()]);
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    if (coursToEdit) {
      setNom(coursToEdit.nom);
      setTarifAnnuel(String(coursToEdit.tarifAnnuel));
      setLienPaiementCB(coursToEdit.lienPaiementCB ?? "");
      setNbElevesMax(String(coursToEdit.nbElevesMax));
      setNbSemaines(String(coursToEdit.nbSemaines));
      setSalarieId(coursToEdit.salarieId);
      setSeances(
        coursToEdit.seances.map((s) => ({
          jour: s.jour,
          heureDebut: s.heureDebut,
          dureeHeures: String(s.dureeHeures),
        }))
      );
    } else {
      setNom("");
      setTarifAnnuel("");
      setLienPaiementCB("");
      setNbElevesMax("");
      setNbSemaines("");
      setSalarieId(moniteurs[0]?.salarieId ?? "");
      setSeances([emptySeance()]);
    }
  }, [isOpen, coursToEdit, moniteurs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  const updateSeance = (idx: number, patch: Partial<SeanceForm>) => {
    setSeances((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSeance = () => setSeances((prev) => [...prev, emptySeance()]);
  const removeSeance = (idx: number) =>
    setSeances((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !salarieId || !nbSemaines || !nbElevesMax || !tarifAnnuel) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    const parsedSeances = seances
      .filter((s) => s.heureDebut && s.dureeHeures)
      .map((s) => ({
        jour: s.jour,
        heureDebut: s.heureDebut,
        dureeHeures: parseFloat(s.dureeHeures),
      }));
    if (parsedSeances.length === 0) {
      alert("Ajoutez au moins une séance valide (jour, heure, durée).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nom: nom.trim(),
        tarifAnnuel: parseFloat(tarifAnnuel),
        lienPaiementCB: lienPaiementCB.trim() || undefined,
        nbElevesMax: parseInt(nbElevesMax, 10),
        nbSemaines: parseInt(nbSemaines, 10),
        salarieId: salarieId as Id<"salaries">,
        seances: parsedSeances,
      };
      if (coursToEdit) {
        await updateCours({ coursId: coursToEdit._id, ...payload });
      } else {
        await addCours({ saison: season, ...payload });
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
          <h2 className="modal-title">{coursToEdit ? "Modifier le cours" : "Nouveau cours"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="cours-nom">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              id="cours-nom"
              type="text"
              className="input-field"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              placeholder="Ex: Cours enfants débutants"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cours-moniteur">
              Moniteur <span className="text-red-500">*</span>
            </label>
            <select
              id="cours-moniteur"
              className="input-field"
              value={salarieId}
              onChange={(e) => setSalarieId(e.target.value)}
              required
            >
              <option value="" disabled>
                {moniteurs.length === 0 ? "Aucun moniteur pour cette saison" : "Sélectionner…"}
              </option>
              {moniteurs.map((m) => (
                <option key={m.salarieId} value={m.salarieId}>
                  {m.nom}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="cours-tarif">
                Tarif annuel (€) <span className="text-red-500">*</span>
              </label>
              <input
                id="cours-tarif"
                type="number"
                step="0.01"
                className="input-field"
                value={tarifAnnuel}
                onChange={(e) => setTarifAnnuel(e.target.value)}
                required
                placeholder="Ex: 280"
              />
            </div>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="cours-eleves">
                Nb élèves max <span className="text-red-500">*</span>
              </label>
              <input
                id="cours-eleves"
                type="number"
                step="1"
                className="input-field"
                value={nbElevesMax}
                onChange={(e) => setNbElevesMax(e.target.value)}
                required
                placeholder="Ex: 12"
              />
            </div>
            <div className="form-group" style={{ flex: "1 1 140px" }}>
              <label className="form-label" htmlFor="cours-semaines">
                Nb semaines <span className="text-red-500">*</span>
              </label>
              <input
                id="cours-semaines"
                type="number"
                step="1"
                className="input-field"
                value={nbSemaines}
                onChange={(e) => setNbSemaines(e.target.value)}
                required
                placeholder="Ex: 30"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cours-lien">
              Lien paiement CB
            </label>
            <input
              id="cours-lien"
              type="url"
              className="input-field"
              value={lienPaiementCB}
              onChange={(e) => setLienPaiementCB(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                Séances par semaine <span className="text-red-500">*</span>{" "}
                <span style={{ color: "#6b7280", fontWeight: "normal" }}>({seances.length})</span>
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "auto", padding: "0.25rem 0.6rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                onClick={addSeance}
              >
                <Plus size={14} /> Séance
              </button>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
              {seances.map((s, idx) => (
                <div key={idx} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    className="input-field"
                    style={{ flex: "1 1 120px", margin: 0 }}
                    value={s.jour}
                    onChange={(e) => updateSeance(idx, { jour: parseInt(e.target.value, 10) })}
                  >
                    {JOURS.map((j, ji) => (
                      <option key={ji} value={ji}>
                        {j}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    className="input-field"
                    style={{ flex: "1 1 110px", margin: 0 }}
                    value={s.heureDebut}
                    onChange={(e) => updateSeance(idx, { heureDebut: e.target.value })}
                    title="Heure de début"
                  />
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    className="input-field"
                    style={{ flex: "1 1 90px", margin: 0 }}
                    value={s.dureeHeures}
                    onChange={(e) => updateSeance(idx, { dureeHeures: e.target.value })}
                    title="Durée (heures)"
                    placeholder="Durée (h)"
                  />
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => removeSeance(idx)}
                    title="Retirer la séance"
                    disabled={seances.length <= 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
