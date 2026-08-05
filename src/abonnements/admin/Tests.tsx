import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { aboError } from "../lib/errors";
import { cleJour, formatDateJour, formatJour, formatTranche } from "../lib/tests";

// Vue admin « Tests d'autonomie » : gestion des disponibilités + inscrits.
// Chaque admin propose ses créneaux (jour + plage). La capacité par slot de 20 min
// se cumule au prorata des encadrants présents (calcul côté serveur, tranches de
// 40/60 min). Supprimer un créneau peut déloger des candidats en surplus (LIFO) —
// la mutation renvoie le nombre annulé. Portage de src/pages/admin-tests.js.

// Grille de sélection : slots de 20 min (minutes depuis minuit). 8h00 → 22h40.
const SLOT_MIN = 8 * 60;
const SLOT_MAX = 22 * 60 + 40;

const minToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minToLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2, "0")}`;
};
const dureeLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const r = min % 60;
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r}`;
};
const hhmm = (t: string) => (t ?? "").slice(0, 5);
const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

export default function Tests() {
  const creneaux = useQuery(api.abo.tests.getMesCreneaux);
  const inscrits = useQuery(api.abo.tests.testInscritsAdmin);
  const creer = useMutation(api.abo.tests.creerTestCreneau);
  const supprimer = useMutation(api.abo.tests.supprimerTestCreneau);

  return (
    <div className="abo-admin-section">
      <p className="abo-admin-intro">
        Proposez vos disponibilités : un encadrant teste 2 personnes par tranche
        de 20 min ; la capacité de plusieurs encadrants se cumule. Les candidats
        réservent une tranche de 40 ou 60 min (répartition fine le jour J).
      </p>

      <section className="abo-admin-subsection">
        <h3 className="abo-admin-subheading">Proposer une disponibilité</h3>
        <PickerCreneau creer={creer} />
      </section>

      <hr className="abo-admin-separator" />

      <section>
        <h3 className="abo-admin-subheading">Mes créneaux</h3>
        <MesCreneaux creneaux={creneaux} supprimer={supprimer} />
      </section>

      <hr className="abo-admin-separator" />

      <section>
        <h3 className="abo-admin-subheading">Inscrits par créneau</h3>
        <Inscrits inscrits={inscrits} />
      </section>
    </div>
  );
}

// ── Sélecteur de créneau (jour + grille de slots 20 min) ─────────────
function PickerCreneau({
  creer,
}: {
  creer: ReturnType<typeof useMutation<typeof api.abo.tests.creerTestCreneau>>;
}) {
  const [jour, setJour] = useState("");
  const [debut, setDebut] = useState<number | null>(null);
  const [fin, setFin] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cliquer(min: number) {
    // 1er clic = début ; 2e clic (après le début) = fin ; sinon on redémarre.
    if (debut == null || fin != null || min <= debut) {
      setDebut(min);
      setFin(null);
    } else {
      setFin(min);
    }
  }

  async function ajouter() {
    if (debut == null || fin == null) return;
    setBusy(true);
    setMsg("Ajout…");
    try {
      await creer({
        date: jour,
        debut: minToTime(debut),
        fin: minToTime(fin + 20), // le créneau va jusqu'à la fin du dernier slot
      });
      setDebut(null);
      setFin(null);
      setMsg(null);
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    } finally {
      setBusy(false);
    }
  }

  const complet = debut != null && fin != null;
  const resume = complet
    ? `${minToLabel(debut!)} → ${minToLabel(fin! + 20)} · ${dureeLabel(fin! + 20 - debut!)}`
    : debut != null
      ? `Début ${minToLabel(debut)} — cliquez l'heure de fin.`
      : "Cliquez l'heure de début.";

  const heures: number[] = [];
  for (let h = Math.floor(SLOT_MIN / 60); h <= Math.floor(SLOT_MAX / 60); h++) {
    heures.push(h);
  }

  return (
    <div>
      <label className="abo-admin-label">
        Jour{" "}
        <input
          type="date"
          min={todayISO()}
          value={jour}
          onChange={(e) => {
            setJour(e.target.value);
            setDebut(null);
            setFin(null);
          }}
          className="abo-admin-input abo-admin-input--date"
        />
      </label>

      {jour && (
        <>
          <div className="abo-admin-slot-grid">
            {heures.map((h) => (
              <div key={h} className="abo-admin-slot-row">
                <span className="abo-admin-slot-hour">
                  {h}h
                </span>
                <div className="abo-admin-slot-buttons">
                  {[0, 20, 40].map((mm) => {
                    const min = h * 60 + mm;
                    if (min < SLOT_MIN || min > SLOT_MAX) {
                      return <span key={mm} className="abo-admin-slot-placeholder" />;
                    }
                    const estBorne = min === debut || min === fin;
                    const dans = debut != null && fin != null && min > debut && min < fin;
                    return (
                      <button
                        key={mm}
                        type="button"
                        onClick={() => cliquer(min)}
                        className={`abo-admin-slot${estBorne ? " abo-admin-slot--selected" : dans ? " abo-admin-slot--range" : ""}`}
                      >
                        {String(mm).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="abo-admin-status">{resume}</p>
          <button
            type="button"
            className="abo-admin-button abo-admin-button--secondary"
            onClick={ajouter}
            disabled={!complet || busy}
          >
            Ajouter le créneau
          </button>
          {msg && <span className="abo-admin-status">{msg}</span>}
        </>
      )}
    </div>
  );
}

// ── Mes créneaux (liste + suppression avec résolution du surbooking) ──
function MesCreneaux({
  creneaux,
  supprimer,
}: {
  creneaux: ReturnType<typeof useQuery<typeof api.abo.tests.getMesCreneaux>>;
  supprimer: ReturnType<typeof useMutation<typeof api.abo.tests.supprimerTestCreneau>>;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  async function retirer(id: Id<"abo_test_creneaux">) {
    const ok = window.confirm(
      "Supprimer ce créneau ?\n\nSi des candidats sont inscrits au-delà de la nouvelle " +
        "capacité, les derniers inscrits seront automatiquement désinscrits (et notifiés).",
    );
    if (!ok) return;
    setMsg(null);
    try {
      const n = await supprimer({ creneauId: id });
      setMsg(
        n > 0
          ? `Créneau supprimé. ${n} réservation${n > 1 ? "s" : ""} en surplus annulée${n > 1 ? "s" : ""}.`
          : "Créneau supprimé.",
      );
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    }
  }

  if (creneaux === undefined) return <p>Chargement…</p>;
  if (creneaux.length === 0) {
    return <p className="abo-admin-empty">Vous n'avez proposé aucun créneau pour l'instant.</p>;
  }

  return (
    <>
      <ul className="abo-admin-list">
        {creneaux.map((c) => (
          <li
            key={c.id}
            className="abo-admin-card abo-admin-list-row"
          >
            <span>
              {formatDateJour(c.date_jour)} ·{" "}
              <strong>
                {hhmm(c.heure_debut)}–{hhmm(c.heure_fin)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => retirer(c.id as Id<"abo_test_creneaux">)}
              className="abo-admin-link-button abo-admin-link-button--danger"
            >
              ✕ Supprimer
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className="abo-admin-status">{msg}</p>}
    </>
  );
}

// ── Inscrits par jour puis par tranche ───────────────────────────────
function Inscrits({
  inscrits,
}: {
  inscrits: ReturnType<typeof useQuery<typeof api.abo.tests.testInscritsAdmin>>;
}) {
  if (inscrits === undefined) return <p>Chargement…</p>;
  if (inscrits.length === 0) {
    return <p className="abo-admin-empty">Aucun candidat inscrit pour l'instant.</p>;
  }

  // Regroupe par jour, puis par tranche (clé = début).
  const jours = new Map<
    string,
    {
      label: string;
      tranches: Map<string, { fin: string | null; gens: typeof inscrits }>;
    }
  >();
  for (const r of inscrits) {
    const kJour = cleJour(r.tranche_debut);
    if (!jours.has(kJour)) {
      jours.set(kJour, { label: formatJour(r.tranche_debut), tranches: new Map() });
    }
    const j = jours.get(kJour)!;
    if (!j.tranches.has(r.tranche_debut)) {
      j.tranches.set(r.tranche_debut, { fin: r.tranche_fin, gens: [] });
    }
    j.tranches.get(r.tranche_debut)!.gens.push(r);
  }

  return (
    <div className="abo-admin-list">
      {[...jours.values()].map((j) => (
        <div key={j.label}>
          <h4 className="abo-admin-subheading">{j.label}</h4>
          <div className="abo-admin-list">
            {[...j.tranches.entries()].map(([debut, { fin, gens }]) => (
              <div
                key={debut}
                className="abo-admin-card"
              >
                <div className="abo-admin-toolbar">
                  <strong>{formatTranche(debut, fin)}</strong>
                  <span className="abo-admin-meta">
                    {gens.length} inscrit{gens.length > 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="abo-admin-attendee-list">
                  {gens.map((g) => (
                    <li key={g.personne_id}>
                      {`${g.prenom ?? ""} ${g.nom ?? ""}`.trim() || "—"}{" "}
                      <span className="abo-admin-meta">({g.email})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
