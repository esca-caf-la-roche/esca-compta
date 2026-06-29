import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import {
  ArrowLeft, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Settings2, Database, TrendingUp,
} from "lucide-react";
import { useSeason } from "../../contexts/SeasonContext";
import {
  computePaie, computeTotaux,
  type ParametresPaie, type SalaireInput,
} from "../../utils/paieCompute";
import SalarieFormModal, { type SalarieRow } from "../../components/Budget/SalarieFormModal";
import ParametresPaieModal from "../../components/Budget/ParametresPaieModal";

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const eur0 = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function MasseSalariale() {
  const { season } = useSeason();
  const data = useQuery(api.paie.getMasseSalariale, { saison: season });
  const userSettings = useQuery(api.users.getCurrentUserSettings);
  const seed = useMutation(api.paie.seedMasseSalariale);
  const removeSalarie = useMutation(api.paie.removeSalarie);

  const isAdmin = userSettings?.role === "admin";

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isSalarieModalOpen, setIsSalarieModalOpen] = useState(false);
  const [salarieToEdit, setSalarieToEdit] = useState<SalarieRow | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [simulationPct, setSimulationPct] = useState("");

  const params = data?.params;
  const salaries = useMemo(() => data?.salaries ?? [], [data]);

  const simPct = simulationPct ? parseFloat(simulationPct) || 0 : 0;

  // Calcul de paie (base + simulé) par salarié, via la fonction pure partagée.
  const rows = useMemo(() => {
    if (!params) return [];
    const p: ParametresPaie = {
      margeSecurite: params.margeSecurite,
      indemniteCpPct: params.indemniteCpPct,
      mutuelleSalarie: params.mutuelleSalarie,
      mutuelleEmployeur: params.mutuelleEmployeur,
      primeEquipementAnnuelle: params.primeEquipementAnnuelle,
      fraisBulletin: params.fraisBulletin,
      cotisationsSalariales: params.cotisationsSalariales.map((c) => ({
        label: c.label, taux: c.taux, base: c.base as ParametresPaie["cotisationsSalariales"][number]["base"],
      })),
      cotisationsPatronales: params.cotisationsPatronales,
    };
    return salaries.map((s) => {
      const input: SalaireInput = {
        nom: s.nom,
        typeContrat: s.typeContrat,
        nbHeuresAnnuel: s.nbHeuresAnnuel,
        nbMois: s.nbMois,
        tauxHoraireBrut: s.tauxHoraireBrut,
      };
      return {
        s,
        base: computePaie(input, p),
        sim: simPct ? computePaie(input, p, { simulationPct: simPct }) : null,
      };
    });
  }, [salaries, params, simPct]);

  const totaux = params ? computeTotaux(rows.map((r) => r.base), params.margeSecurite) : null;
  const totauxSim =
    params && simPct ? computeTotaux(rows.map((r) => r.sim ?? r.base), params.margeSecurite) : null;
  const surcout = totaux && totauxSim ? totauxSim.coutAnnuel - totaux.coutAnnuel : 0;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await seed({ saison: season });
      alert(res.message);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors de l'initialisation.");
    } finally {
      setSeeding(false);
    }
  };

  const handleDelete = async (s: SalarieRow) => {
    if (window.confirm(`Supprimer ${s.nom} ? (toutes saisons confondues)`)) {
      await removeSalarie({ salarieId: s.salarieId });
    }
  };

  const openEdit = (s: SalarieRow) => {
    setSalarieToEdit(s);
    setIsSalarieModalOpen(true);
  };
  const openNew = () => {
    setSalarieToEdit(null);
    setIsSalarieModalOpen(true);
  };

  const augmentationLabel = (s: SalarieRow): string | null => {
    if (s.tauxPrecedent && s.tauxPrecedent > 0) {
      const pct = (s.tauxHoraireBrut / s.tauxPrecedent - 1) * 100;
      return `+${pct.toFixed(1)} %`;
    }
    if (s.augmentationPct != null) return `+${s.augmentationPct} %`;
    return null;
  };

  return (
    <div className="compta-page fade-in">
      <header
        className="page-header"
        style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "2rem" }}
      >
        <div>
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Retour au tableau de bord
          </Link>
          <h1>Budget prévisionnel — Masse salariale</h1>
          <p className="subtitle">Coût employeur par salarié · saison {season}</p>
        </div>
        {isAdmin && salaries.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setIsParamsModalOpen(true)}>
              <Settings2 size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
              Paramètres
            </button>
            <button className="btn-primary" style={{ width: "auto" }} onClick={openNew}>
              <Plus size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
              Salarié
            </button>
          </div>
        )}
      </header>

      {data === undefined ? (
        <div className="loading">Chargement des données...</div>
      ) : salaries.length === 0 ? (
        <section className="card glass-card">
          <div className="empty-state" style={{ textAlign: "center" }}>
            <p style={{ marginBottom: "1rem" }}>
              Aucune donnée de masse salariale pour la saison <strong>{season}</strong>.
            </p>
            {isAdmin ? (
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" style={{ width: "auto" }} onClick={handleSeed} disabled={seeding}>
                  <Database size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                  {seeding ? "Initialisation..." : "Initialiser depuis l'Excel"}
                </button>
                <button className="btn-secondary" style={{ width: "auto" }} onClick={openNew}>
                  <Plus size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                  Ajouter manuellement
                </button>
              </div>
            ) : (
              <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                Contactez un administrateur pour initialiser les données.
              </p>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* Cartes de synthèse */}
          <div className="tiles-grid" style={{ marginBottom: "2rem" }}>
            <div className="tile-card bg-info" style={{ padding: "1.5rem" }}>
              <div className="tile-content">
                <p style={{ fontSize: "0.8rem", color: "#000", textTransform: "uppercase" }}>Budget annuel (coût employeur)</p>
                <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>{eur0(totaux!.coutAnnuel)}</h3>
              </div>
            </div>
            <div className="tile-card bg-warning" style={{ padding: "1.5rem" }}>
              <div className="tile-content">
                <p style={{ fontSize: "0.8rem", color: "#000", textTransform: "uppercase" }}>
                  Avec marge de sécurité (×{params!.margeSecurite})
                </p>
                <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>{eur0(totaux!.coutAnnuelAvecMarge)}</h3>
              </div>
            </div>
            <div className="tile-card bg-success" style={{ padding: "1.5rem" }}>
              <div className="tile-content">
                <p style={{ fontSize: "0.8rem", color: "#000", textTransform: "uppercase" }}>Nombre de salariés</p>
                <h3 className="font-mono mt-2" style={{ fontSize: "1.6rem" }}>{totaux!.nbSalaries}</h3>
              </div>
            </div>
          </div>

          {/* Simulation d'augmentation */}
          <section className="card glass-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <TrendingUp size={20} /> Simulation d'augmentation
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label className="form-label" htmlFor="sim" style={{ margin: 0 }}>Augmentation globale</label>
                <input
                  id="sim"
                  type="number"
                  step="0.5"
                  className="input-field"
                  value={simulationPct}
                  onChange={(e) => setSimulationPct(e.target.value)}
                  placeholder="0"
                  style={{ width: "90px" }}
                />
                <span>%</span>
              </div>
              {simPct ? (
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Nouveau coût annuel</p>
                    <strong className="font-mono" style={{ fontSize: "1.2rem" }}>{eur0(totauxSim!.coutAnnuel)}</strong>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Surcoût annuel</p>
                    <strong className="font-mono" style={{ fontSize: "1.2rem", color: surcout >= 0 ? "#b91c1c" : "#15803d" }}>
                      {surcout >= 0 ? "+ " : "- "}{eur(Math.abs(surcout))}
                    </strong>
                    <span style={{ color: "#6b7280", marginLeft: "0.5rem" }}>
                      ({totaux!.coutAnnuel > 0 ? ((surcout / totaux!.coutAnnuel) * 100).toFixed(1) : "0"} %)
                    </span>
                  </div>
                </div>
              ) : (
                <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  Saisissez un pourcentage pour estimer le surcoût.
                </span>
              )}
            </div>
          </section>

          {/* Tableau par salarié */}
          <section className="card glass-card" style={{ overflowX: "auto" }}>
            <h2 style={{ marginBottom: "1rem" }}>Détail par salarié</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 0.5rem" }}></th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Salarié</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Heures/an</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Taux brut</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Net/mois</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Coût annuel</th>
                  {isAdmin && <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, base, sim }) => {
                  const id = s.ligneId;
                  const isOpen = expanded.has(id);
                  const aug = augmentationLabel(s);
                  return (
                    <Fragment key={id}>
                      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "0.6rem 0.5rem" }}>
                          <button
                            onClick={() => toggleExpanded(id)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                            title="Détail"
                          >
                            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>
                          <strong>{s.nom}</strong>
                          <span className="badge" style={{ marginLeft: "0.5rem", fontSize: "0.7rem", backgroundColor: "#e0f2fe", color: "#075985" }}>
                            {s.typeContrat}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">
                          {s.nbHeuresAnnuel.toLocaleString("fr-FR")}
                          <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}> ({base.heuresMensuel.toLocaleString("fr-FR")}/mois)</span>
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">
                          {eur(s.tauxHoraireBrut)}
                          {aug && (
                            <span className="badge" style={{ marginLeft: "0.4rem", fontSize: "0.7rem", backgroundColor: "#dcfce7", color: "#166534" }}>
                              {aug}
                            </span>
                          )}
                          {sim && (
                            <div style={{ fontSize: "0.75rem", color: "#b45309" }}>→ {eur(sim.tauxEffectif)}</div>
                          )}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">
                          {eur(base.netMensuel)}
                          {sim && <div style={{ fontSize: "0.75rem", color: "#b45309" }}>→ {eur(sim.netMensuel)}</div>}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", fontWeight: "bold" }} className="font-mono">
                          {eur0(base.coutAnnuel)}
                          {sim && <div style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: "normal" }}>→ {eur0(sim.coutAnnuel)}</div>}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                              <button className="btn-icon info" onClick={() => openEdit(s)} title="Modifier"><Edit2 size={16} /></button>
                              <button className="btn-icon danger" onClick={() => handleDelete(s)} title="Supprimer"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={isAdmin ? 7 : 6} style={{ padding: "0 0.5rem 1rem 2.5rem", background: "#fafafa" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem", paddingTop: "0.75rem" }}>
                              <div>
                                <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "#6b7280", marginBottom: "0.4rem" }}>Construction du brut</h4>
                                <DetailLine label="Salaire" value={eur(base.salaire)} />
                                {s.typeContrat !== "CDI" && <DetailLine label="Indemnité CP" value={eur(base.indemniteCp)} />}
                                <DetailLine label="Salaire brut" value={eur(base.brut)} bold />
                              </div>
                              <div>
                                <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "#6b7280", marginBottom: "0.4rem" }}>Salarié → Net</h4>
                                <DetailLine label="Cotisations salariales" value={`- ${eur(base.cotisSalariales)}`} />
                                <DetailLine label="Mutuelle salarié" value={`- ${eur(params!.mutuelleSalarie)}`} />
                                <DetailLine label="Net mensuel estimé" value={eur(base.netMensuel)} bold />
                                <DetailLine label="Net annuel" value={eur(base.netAnnuel)} />
                              </div>
                              <div>
                                <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "#6b7280", marginBottom: "0.4rem" }}>Employeur → Coût</h4>
                                <DetailLine label="Cotisations patronales" value={`+ ${eur(base.cotisPatronales)}`} />
                                <DetailLine label="Mutuelle employeur" value={`+ ${eur(params!.mutuelleEmployeur)}`} />
                                <DetailLine label="Prime équip. (/mois)" value={`+ ${eur(params!.primeEquipementAnnuelle / 12)}`} />
                                <DetailLine label="Frais bulletin" value={`+ ${eur(params!.fraisBulletin)}`} />
                                <DetailLine label="Coût mensuel" value={eur(base.coutMensuel)} bold />
                                <DetailLine label={`Coût annuel (×${s.nbMois} mois)`} value={eur(base.coutAnnuel)} bold />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: "bold" }}>
                  <td colSpan={5} style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Total coût annuel</td>
                  <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }} className="font-mono">{eur0(totaux!.coutAnnuel)}</td>
                  {isAdmin && <td></td>}
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}

      <SalarieFormModal
        isOpen={isSalarieModalOpen}
        onClose={() => setIsSalarieModalOpen(false)}
        salarieToEdit={salarieToEdit}
      />
      {params && (
        <ParametresPaieModal
          isOpen={isParamsModalOpen}
          onClose={() => setIsParamsModalOpen(false)}
          params={{
            margeSecurite: params.margeSecurite,
            indemniteCpPct: params.indemniteCpPct,
            mutuelleSalarie: params.mutuelleSalarie,
            mutuelleEmployeur: params.mutuelleEmployeur,
            primeEquipementAnnuelle: params.primeEquipementAnnuelle,
            fraisBulletin: params.fraisBulletin,
            cotisationsSalariales: params.cotisationsSalariales,
            cotisationsPatronales: params.cotisationsPatronales,
          }}
        />
      )}
    </div>
  );
}

function DetailLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.15rem 0", fontWeight: bold ? "bold" : "normal" }}>
      <span style={{ color: "#374151" }}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
