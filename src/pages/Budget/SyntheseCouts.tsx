import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Save, Users, Trophy, Wallet } from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";

const eur0 = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const LOISIR_COLOR = "#2563eb";
const COMPET_COLOR = "#d97706";

interface Props {
  masseSalarialeLoisir?: number;
  masseSalarialeCompetition?: number;
  isAdmin: boolean;
}

export default function SyntheseCouts({
  masseSalarialeLoisir,
  masseSalarialeCompetition,
  isAdmin,
}: Props) {
  const { season } = useSeason();
  const synthese = useQuery(api.effectifs.getSynthese, { saison: season });
  const setMembresLoisir = useMutation(api.effectifs.setMembresLoisir);

  const [loisirInput, setLoisirInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-synchronise l'input quand la valeur persistée change (chargement, autre client…).
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (synthese) setLoisirInput(String(synthese.nbMembresLoisir));
  }, [synthese?.nbMembresLoisir]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  if (synthese === undefined) return <div className="loading">Chargement de la synthèse…</div>;

  const nbLoisir = parseInt(loisirInput, 10) || 0;
  const nbCompet = synthese.nbMembresCompetition;
  const totalMembres = nbLoisir + nbCompet;

  // Dépenses totales = masse salariale (calcul paie, ventilée) + dépenses prévisionnelles
  // en base (montant < 0), par catégorie.
  const depLoisir = (masseSalarialeLoisir ?? 0) + synthese.depPrevLoisir;
  const depCompet = (masseSalarialeCompetition ?? 0) + synthese.depPrevCompetition;
  const depTotal = depLoisir + depCompet;

  const coutLoisir = nbLoisir > 0 ? depLoisir / nbLoisir : null;
  const coutCompet = nbCompet > 0 ? depCompet / nbCompet : null;

  const dirty = nbLoisir !== synthese.nbMembresLoisir;

  const save = async () => {
    setSaving(true);
    try {
      await setMembresLoisir({ saison: season, nbMembresLoisir: nbLoisir });
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement du nombre de membres.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: CSSProperties = { width: 120, margin: 0 };

  return (
    <div className="fade-in">
      {/* Effectifs */}
      <section className="card glass-card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Users size={20} /> Effectifs
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
          {/* Loisir */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label className="form-label" htmlFor="nb-loisir" style={{ margin: 0 }}>
              Membres loisir
            </label>
            <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
              Élèves en cours + abonnements
            </p>
            {isAdmin ? (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.25rem" }}>
                <input
                  id="nb-loisir"
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  style={inputStyle}
                  value={loisirInput}
                  onChange={(e) => setLoisirInput(e.target.value)}
                />
                <button
                  className="btn-icon info"
                  onClick={save}
                  disabled={!dirty || saving}
                  title={dirty ? "Enregistrer" : "Aucune modification"}
                  style={{ opacity: dirty ? 1 : 0.4 }}
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <p className="font-mono" style={{ fontSize: "1.4rem", margin: "0.25rem 0 0" }}>{nbLoisir}</p>
            )}
          </div>

          {/* Compétition */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label className="form-label" style={{ margin: 0 }}>
              Membres compétition <span style={{ fontWeight: "normal", color: "#6b7280" }}>(auto)</span>
            </label>
            <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>
              Σ élèves max des types de cours compétition
            </p>
            <p className="font-mono" style={{ fontSize: "1.4rem", margin: "0.25rem 0 0" }}>{nbCompet}</p>
          </div>

          {/* Total */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label className="form-label" style={{ margin: 0 }}>Total membres</label>
            <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>&nbsp;</p>
            <p className="font-mono" style={{ fontSize: "1.4rem", margin: "0.25rem 0 0", fontWeight: 700 }}>{totalMembres}</p>
          </div>
        </div>
      </section>

      {/* Coût par membre */}
      <div className="tiles-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="tile-card bg-info" style={{ padding: "1.5rem" }}>
          <div className="tile-content">
            <p className="text-sm tracking-widest uppercase" style={{ fontSize: "0.8rem", color: "#000", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Wallet size={16} /> Coût d'un membre loisir
            </p>
            <h3 className="font-mono mt-2" style={{ fontSize: "1.8rem" }}>
              {coutLoisir != null ? eur0(coutLoisir) : "—"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#374151", margin: 0 }}>
              {eur0(depLoisir)} ÷ {nbLoisir} membre{nbLoisir > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="tile-card bg-warning" style={{ padding: "1.5rem" }}>
          <div className="tile-content">
            <p className="text-sm tracking-widest uppercase" style={{ fontSize: "0.8rem", color: "#000", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Trophy size={16} /> Coût d'un membre compétition
            </p>
            <h3 className="font-mono mt-2" style={{ fontSize: "1.8rem" }}>
              {coutCompet != null ? eur0(coutCompet) : "—"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#374151", margin: 0 }}>
              {eur0(depCompet)} ÷ {nbCompet} membre{nbCompet > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Répartitions */}
      <section className="card glass-card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1.25rem" }}>Répartition des dépenses</h2>
        <RepartitionBar
          loisir={depLoisir}
          competition={depCompet}
          format={eur0}
        />
        <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.75rem", marginBottom: 0 }}>
          Inclut la masse salariale (ventilée loisir / compétition) et les dépenses
          prévisionnelles. Total : {eur0(depTotal)}.
        </p>
      </section>

      <section className="card glass-card">
        <h2 style={{ marginBottom: "1.25rem" }}>Répartition des membres</h2>
        <RepartitionBar
          loisir={nbLoisir}
          competition={nbCompet}
          format={(n) => String(n)}
        />
      </section>
    </div>
  );
}

/** Barre empilée loisir / compétition avec pourcentages et valeurs. */
function RepartitionBar({
  loisir,
  competition,
  format,
}: {
  loisir: number;
  competition: number;
  format: (n: number) => string;
}) {
  const total = loisir + competition;
  const pctLoisir = total > 0 ? (loisir / total) * 100 : 0;
  const pctCompet = total > 0 ? (competition / total) * 100 : 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 36,
          borderRadius: 8,
          overflow: "hidden",
          background: "#f1f5f9",
        }}
      >
        {pctLoisir > 0 && (
          <div style={{ width: `${pctLoisir}%`, background: LOISIR_COLOR }} title={`Loisir : ${format(loisir)}`} />
        )}
        {pctCompet > 0 && (
          <div style={{ width: `${pctCompet}%`, background: COMPET_COLOR }} title={`Compétition : ${format(competition)}`} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.75rem", gap: "1rem", flexWrap: "wrap" }}>
        <Legende color={LOISIR_COLOR} label="Loisir" value={format(loisir)} pct={pctLoisir} />
        <Legende color={COMPET_COLOR} label="Compétition" value={format(competition)} pct={pctCompet} align="right" />
      </div>
    </div>
  );
}

function Legende({
  color,
  label,
  value,
  pct,
  align = "left",
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
  align?: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color }} />
        <strong>{label}</strong>
      </div>
      <div className="font-mono" style={{ fontSize: "1.1rem" }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{pct.toFixed(1)} %</div>
    </div>
  );
}
