import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Plus, Edit2, Trash2, CalendarDays, AlertTriangle } from "lucide-react";
import { useMutation } from "convex/react";
import { useSeason } from "../../contexts/SeasonContext";
import CoursFormModal, { type CoursRow } from "../../components/Budget/CoursFormModal";
import { JOURS } from "../../utils/planning";
import type { Id } from "../../../convex/_generated/dataModel";

const eur0 = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Palette stable assignée par cours (index) pour colorer les barres du Gantt.
const PALETTE = [
  "#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed",
  "#0891b2", "#dc2626", "#65a30d", "#9333ea", "#0d9488",
];

/** "18:30" -> 18.5 (heures décimales). */
function toDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) + (m || 0) / 60;
}

/** 18.5 -> "18h30" pour l'affichage. */
function fmtHeure(dec: number): string {
  const h = Math.floor(dec);
  const m = Math.round((dec - h) * 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

interface Props {
  isAdmin: boolean;
}

export default function PlanningCours({ isAdmin }: Props) {
  const { season } = useSeason();
  const data = useQuery(api.cours.getPlanning, { saison: season });
  const removeCours = useMutation(api.cours.removeCours);
  const reprendrePlanning = useMutation(api.cours.reprendrePlanningSaisonPrecedente);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [coursToEdit, setCoursToEdit] = useState<CoursRow | null>(null);
  const [reprise, setReprise] = useState(false);
  const [autoSeason, setAutoSeason] = useState<string | null>(null);

  const cours = useMemo(() => data?.cours ?? [], [data]);
  const moniteurs = useMemo(
    () => (data?.salaries ?? []).map((s) => ({ salarieId: s.salarieId, nom: s.nom })),
    [data]
  );

  // Règle de saison (comme la masse salariale) : si la saison courante n'a pas de
  // cours mais que la précédente en contient, on reprend automatiquement le planning.
  useEffect(() => {
    if (
      isAdmin &&
      data !== undefined &&
      data.cours.length === 0 &&
      (data.prevCoursCount ?? 0) > 0 &&
      !reprise &&
      autoSeason !== season
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoSeason(season);
      setReprise(true);
      void reprendrePlanning({ saison: season })
        .catch((err) => console.error(err))
        .finally(() => setReprise(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, data, season]);

  // Couleur par cours (index dans la liste triée).
  const colorByCours = useMemo(() => {
    const map = new Map<string, string>();
    cours.forEach((c, i) => map.set(c._id, PALETTE[i % PALETTE.length]));
    return map;
  }, [cours]);

  // Construction des séances par jour (0=Lundi … 6=Dimanche) pour le Gantt.
  // Une séance partagée par plusieurs moniteurs apparaît sur la ligne de chacun.
  const planningParJour = useMemo(() => {
    type Item = {
      coursId: string;
      coursNom: string;
      salarieId: Id<"salaries">;
      debut: number;
      fin: number;
      color: string;
    };
    const jours: Array<{
      jour: number;
      items: Item[];
      moniteurs: Array<{ salarieId: Id<"salaries">; nom: string }>;
      min: number;
      max: number;
    }> = [];

    for (let j = 0; j < 7; j++) {
      const items: Item[] = [];
      for (const c of cours) {
        for (const s of c.seances) {
          if (s.jour !== j) continue;
          const debut = toDecimal(s.heureDebut);
          for (const m of c.moniteurs) {
            items.push({
              coursId: c._id,
              coursNom: c.nom,
              salarieId: m.salarieId,
              debut,
              fin: debut + s.dureeHeures,
              color: colorByCours.get(c._id) ?? PALETTE[0],
            });
          }
        }
      }
      if (items.length === 0) continue;

      // Moniteurs présents ce jour-là, dans l'ordre de la masse salariale.
      const presentIds = new Set(items.map((it) => it.salarieId));
      const monitsJour = moniteurs.filter((m) => presentIds.has(m.salarieId));

      const min = Math.floor(Math.min(...items.map((it) => it.debut)));
      const max = Math.ceil(Math.max(...items.map((it) => it.fin)));
      jours.push({ jour: j, items, moniteurs: monitsJour, min, max });
    }
    return jours;
  }, [cours, moniteurs, colorByCours]);

  const handleDelete = async (c: { _id: Id<"cours">; nom: string }) => {
    if (window.confirm(`Supprimer le cours « ${c.nom} » ?`)) {
      await removeCours({ coursId: c._id });
    }
  };

  const openEdit = (c: (typeof cours)[number]) => {
    setCoursToEdit({
      _id: c._id,
      nom: c.nom,
      tarifAnnuel: c.tarifAnnuel,
      lienPaiementCB: c.lienPaiementCB,
      nbElevesMax: c.nbElevesMax,
      moniteurs: c.moniteurs.map((m) => ({ salarieId: m.salarieId, nbSemaines: m.nbSemaines })),
      seances: c.seances,
    });
    setIsModalOpen(true);
  };
  const openNew = () => {
    setCoursToEdit(null);
    setIsModalOpen(true);
  };

  if (data === undefined) {
    return <div className="loading">Chargement du planning…</div>;
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <p className="subtitle" style={{ margin: 0 }}>
          Planning des cours · saison {season}
        </p>
        {isAdmin && moniteurs.length > 0 && (
          <button className="btn-primary" style={{ width: "auto" }} onClick={openNew}>
            <Plus size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
            Cours
          </button>
        )}
      </div>

      {moniteurs.length === 0 ? (
        <section className="card glass-card">
          <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>
            Aucun moniteur pour la saison {season}. Ajoutez d'abord des moniteurs dans
            l'onglet « Masse salariale » pour pouvoir créer des cours.
          </p>
        </section>
      ) : reprise ? (
        <div className="loading">Reprise du planning de la saison précédente…</div>
      ) : cours.length === 0 ? (
        <section className="card glass-card">
          <div className="empty-state" style={{ textAlign: "center" }}>
            <p style={{ marginBottom: isAdmin ? "1rem" : 0 }}>
              Aucun cours enregistré pour la saison <strong>{season}</strong>.
            </p>
            {isAdmin && (
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                {(data.prevCoursCount ?? 0) > 0 && (
                  <button
                    className="btn-primary"
                    style={{ width: "auto" }}
                    onClick={async () => {
                      setReprise(true);
                      try {
                        const res = await reprendrePlanning({ saison: season });
                        if (res.copiees === 0) alert(res.message);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Erreur lors de la reprise.");
                      } finally {
                        setReprise(false);
                      }
                    }}
                  >
                    <Plus size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                    Reprendre la saison précédente
                  </button>
                )}
                <button className="btn-secondary" style={{ width: "auto" }} onClick={openNew}>
                  <Plus size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
                  Ajouter un cours
                </button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* Diagramme de Gantt par jour de semaine */}
          {planningParJour.map((jourData) => (
            <GanttJour key={jourData.jour} jourData={jourData} />
          ))}

          {/* Cohérence des heures : planning vs masse salariale */}
          <section className="card glass-card" style={{ marginTop: "2rem", overflowX: "auto" }}>
            <h2 style={{ marginBottom: "1rem" }}>Heures par moniteur — planning vs masse salariale</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Moniteur</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Heures planning</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Heures masse salariale</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {(data.heuresParMoniteur ?? []).map((h) => {
                  const ecart = h.calculees - h.saisies;
                  const significatif = Math.abs(ecart) >= 0.5;
                  return (
                    <tr key={h.salarieId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <strong>{h.nom}</strong>
                        <span className="badge" style={{ marginLeft: "0.5rem", fontSize: "0.7rem", backgroundColor: "#e0f2fe", color: "#075985" }}>
                          {h.typeContrat}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">
                        {h.calculees.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">
                        {h.saisies.toLocaleString("fr-FR")} h
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", fontWeight: significatif ? "bold" : "normal" }} className="font-mono">
                        <span style={{ color: !significatif ? "#15803d" : ecart > 0 ? "#b45309" : "#b91c1c", display: "inline-flex", alignItems: "center", gap: "0.3rem", justifyContent: "flex-end" }}>
                          {significatif && <AlertTriangle size={14} />}
                          {ecart >= 0 ? "+" : "−"}
                          {Math.abs(ecart).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "0.75rem", marginBottom: 0 }}>
              Heures planning = Σ (durée hebdo du cours × semaines couvertes par le moniteur).
              Cet écart est informatif et ne modifie pas la masse salariale.
            </p>
          </section>

          {/* Tableau des cours (CRUD) */}
          <section className="card glass-card" style={{ marginTop: "2rem", overflowX: "auto" }}>
            <h2 style={{ marginBottom: "1rem" }}>Liste des cours</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "880px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Cours</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Moniteur(s)</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Séances</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Tarif/an</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Élèves max</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Semaines</th>
                  <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>h/sem</th>
                  {isAdmin && <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {cours.map((c) => {
                  const hSem = c.seances.reduce((a, s) => a + s.dureeHeures, 0);
                  const totalSem = c.moniteurs.reduce((a, m) => a + m.nbSemaines, 0);
                  return (
                    <tr key={c._id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 8, backgroundColor: colorByCours.get(c._id) }} />
                        <strong>{c.nom}</strong>
                        {c.lienPaiementCB && (
                          <a href={c.lienPaiementCB} target="_blank" rel="noreferrer" style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#2563eb" }}>
                            lien CB
                          </a>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", fontSize: "0.85rem" }}>
                        {c.moniteurs.map((m, i) => (
                          <span key={i} style={{ display: "block", color: "#374151" }}>
                            {m.nom}
                            {c.moniteurs.length > 1 && (
                              <span style={{ color: "#9ca3af" }}> ({m.nbSemaines} sem.)</span>
                            )}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", fontSize: "0.85rem" }}>
                        {c.seances.map((s, i) => (
                          <span key={i} style={{ display: "block", color: "#374151" }}>
                            {JOURS[s.jour]} {fmtHeure(toDecimal(s.heureDebut))} ({s.dureeHeures} h)
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">{eur0(c.tarifAnnuel)}</td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">{c.nbElevesMax}</td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">{totalSem}</td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }} className="font-mono">{hSem.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                      {isAdmin && (
                        <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                            <button className="btn-icon info" onClick={() => openEdit(c)} title="Modifier"><Edit2 size={16} /></button>
                            <button className="btn-icon danger" onClick={() => handleDelete(c)} title="Supprimer"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <CoursFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        coursToEdit={coursToEdit}
        moniteurs={moniteurs}
      />
    </>
  );
}

/** Une journée du Gantt : lignes = moniteurs, axe horizontal = horaires. */
function GanttJour({
  jourData,
}: {
  jourData: {
    jour: number;
    items: Array<{
      coursId: string;
      coursNom: string;
      salarieId: Id<"salaries">;
      debut: number;
      fin: number;
      color: string;
    }>;
    moniteurs: Array<{ salarieId: Id<"salaries">; nom: string }>;
    min: number;
    max: number;
  };
}) {
  const { jour, items, moniteurs, min, max } = jourData;
  const span = Math.max(max - min, 1);
  const heures: number[] = [];
  for (let h = min; h <= max; h++) heures.push(h);

  const pct = (v: number) => `${((v - min) / span) * 100}%`;
  const LABEL_W = 140;

  return (
    <section className="card glass-card" style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 0, marginBottom: "1rem" }}>
        <CalendarDays size={18} /> {JOURS[jour]}
      </h3>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 640 }}>
          {/* Axe des heures */}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ position: "relative", flex: 1, height: 20 }}>
              {heures.map((h) => (
                <span
                  key={h}
                  style={{ position: "absolute", left: pct(h), transform: "translateX(-50%)", fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}
                >
                  {h}h
                </span>
              ))}
            </div>
          </div>

          {/* Une ligne par moniteur */}
          {moniteurs.map((m) => {
            const seances = items.filter((it) => it.salarieId === m.salarieId);
            return (
              <div key={m.salarieId} style={{ display: "flex", alignItems: "center", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ width: LABEL_W, flexShrink: 0, padding: "0.5rem 0.5rem 0.5rem 0", fontWeight: 600, fontSize: "0.9rem" }}>
                  {m.nom}
                </div>
                <div style={{ position: "relative", flex: 1, height: 44 }}>
                  {/* Lignes verticales (heures) */}
                  {heures.map((h) => (
                    <div key={h} style={{ position: "absolute", left: pct(h), top: 0, bottom: 0, width: 1, background: "#f1f5f9" }} />
                  ))}
                  {/* Barres des séances */}
                  {seances.map((s, i) => (
                    <div
                      key={i}
                      title={`${s.coursNom} · ${fmtHeure(s.debut)}–${fmtHeure(s.fin)}`}
                      style={{
                        position: "absolute",
                        left: pct(s.debut),
                        width: `${((s.fin - s.debut) / span) * 100}%`,
                        top: 6,
                        height: 32,
                        background: s.color,
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 0.4rem",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                      }}
                    >
                      {s.coursNom}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
