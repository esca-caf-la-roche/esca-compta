import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Save, Plus, Trash2 } from "lucide-react";

interface CotisSalariale { label: string; taux: number; base: string }
interface CotisPatronale { label: string; taux: number }

export interface ParametresPaieValue {
  margeSecurite: number;
  indemniteCpPct: number;
  mutuelleSalarie: number;
  mutuelleEmployeur: number;
  primeEquipementAnnuelle: number;
  fraisBulletin: number;
  cotisationsSalariales: CotisSalariale[];
  cotisationsPatronales: CotisPatronale[];
}

interface Props {
  saison: string;
  params: ParametresPaieValue;
}

const BASE_OPTIONS = [
  { value: "brut", label: "Salaire brut" },
  { value: "csgcrds", label: "Base CSG/CRDS (98,25 %)" },
  { value: "micro", label: "Base réduite (0,2 %)" },
];

/** Formulaire d'édition des paramètres de paie d'une saison (réutilisable). */
export default function ParametresPaieForm({ saison, params }: Props) {
  const updateParametres = useMutation(api.paie.updateParametres);

  const [form, setForm] = useState<ParametresPaieValue>(params);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Recharge le formulaire quand la saison (ou ses paramètres) change.
  useEffect(() => {
    setForm(params);
    setSavedAt(null);
  }, [saison, params]);

  const num = (v: string) => (v === "" ? 0 : parseFloat(v));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateParametres({ saison, ...form });
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de l'enregistrement des paramètres.");
    } finally {
      setSaving(false);
    }
  };

  const scalarFields: Array<{ key: keyof ParametresPaieValue; label: string; step: string }> = [
    { key: "margeSecurite", label: "Marge de sécurité (×)", step: "0.01" },
    { key: "indemniteCpPct", label: "Indemnité CP (%) — CDII", step: "0.1" },
    { key: "mutuelleSalarie", label: "Mutuelle part salarié (€)", step: "1" },
    { key: "mutuelleEmployeur", label: "Mutuelle part employeur (€)", step: "1" },
    { key: "primeEquipementAnnuelle", label: "Prime d'équipement annuelle (€)", step: "1" },
    { key: "fraisBulletin", label: "Frais bulletin de paie (€)", step: "1" },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        {scalarFields.map((f) => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            <input
              type="number"
              step={f.step}
              className="input-field"
              value={String(form[f.key] as number)}
              onChange={(e) => setForm({ ...form, [f.key]: num(e.target.value) })}
            />
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Cotisations salariales</h3>
      {form.cotisationsSalariales.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            className="input-field"
            value={c.label}
            onChange={(e) => {
              const list = [...form.cotisationsSalariales];
              list[i] = { ...c, label: e.target.value };
              setForm({ ...form, cotisationsSalariales: list });
            }}
            style={{ flex: "2 1 160px" }}
          />
          <input
            type="number"
            step="0.001"
            className="input-field"
            value={String(c.taux)}
            onChange={(e) => {
              const list = [...form.cotisationsSalariales];
              list[i] = { ...c, taux: num(e.target.value) };
              setForm({ ...form, cotisationsSalariales: list });
            }}
            style={{ flex: "0 1 90px" }}
            title="Taux %"
          />
          <select
            className="input-field"
            value={c.base}
            onChange={(e) => {
              const list = [...form.cotisationsSalariales];
              list[i] = { ...c, base: e.target.value };
              setForm({ ...form, cotisationsSalariales: list });
            }}
            style={{ flex: "1 1 120px" }}
          >
            {BASE_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon danger"
            onClick={() =>
              setForm({
                ...form,
                cotisationsSalariales: form.cotisationsSalariales.filter((_, j) => j !== i),
              })
            }
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        style={{ width: "auto", fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}
        onClick={() =>
          setForm({
            ...form,
            cotisationsSalariales: [...form.cotisationsSalariales, { label: "Nouvelle cotisation", taux: 0, base: "brut" }],
          })
        }
      >
        <Plus size={14} style={{ verticalAlign: "middle" }} /> Ajouter une ligne
      </button>

      <h3 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Cotisations patronales</h3>
      {form.cotisationsPatronales.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            className="input-field"
            value={c.label}
            onChange={(e) => {
              const list = [...form.cotisationsPatronales];
              list[i] = { ...c, label: e.target.value };
              setForm({ ...form, cotisationsPatronales: list });
            }}
            style={{ flex: "2 1 160px" }}
          />
          <input
            type="number"
            step="0.001"
            className="input-field"
            value={String(c.taux)}
            onChange={(e) => {
              const list = [...form.cotisationsPatronales];
              list[i] = { ...c, taux: num(e.target.value) };
              setForm({ ...form, cotisationsPatronales: list });
            }}
            style={{ flex: "0 1 90px" }}
            title="Taux %"
          />
          <button
            type="button"
            className="btn-icon danger"
            onClick={() =>
              setForm({
                ...form,
                cotisationsPatronales: form.cotisationsPatronales.filter((_, j) => j !== i),
              })
            }
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        style={{ width: "auto", fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}
        onClick={() =>
          setForm({
            ...form,
            cotisationsPatronales: [...form.cotisationsPatronales, { label: "Nouvelle cotisation", taux: 0 }],
          })
        }
      >
        <Plus size={14} style={{ verticalAlign: "middle" }} /> Ajouter une ligne
      </button>

      <div className="form-actions" style={{ marginTop: "2rem", alignItems: "center", gap: "1rem" }}>
        {savedAt && (
          <span style={{ color: "#15803d", fontSize: "0.9rem" }}>Paramètres enregistrés ✓</span>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "auto" }}
        >
          <Save size={18} />
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
