import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { aboError } from "../lib/errors";
import CompteurJauge from "./CompteurJauge";
import SyncClub from "./SyncClub";
import FilDiscussion from "../FilDiscussion";

// Vue admin « Dossiers » : jauge compteur en tête, cartes filtrées (défaut
// « nouvelles demandes »), validation PAR PERSONNE (boutons de statut) et détail
// d'une personne en modal (barre des 8 étapes internes). Le badge « en cours
// d'escalade » (passe-droit vague 2) est posé par matching licence puis nom+prénom
// sur api.abo.compteur.getElevesEnCours. Portage de src/pages/admin.js.

type Dossier = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.demandes.getDossiersAdmin>>
>[number];
type Personne = Dossier["personnes"][number];

const STATUTS: Record<string, string> = {
  nouvelle_demande: "Nouvelle demande",
  validee: "Validée",
  liste_attente: "Liste d'attente",
  refusee: "Refusée",
  complete: "Complète",
};

const DECISIONS = [
  { valeur: "validee", label: "Valider" },
  { valeur: "liste_attente", label: "Liste d'attente" },
  { valeur: "refusee", label: "Refuser" },
] as const;

export default function Dossiers() {
  const dossiers = useQuery(api.abo.demandes.getDossiersAdmin);
  const suppressions = useQuery(api.abo.demandes.getSuppressions);
  const eleves = useQuery(api.abo.compteur.getElevesEnCours);
  const nonLus = useQuery(api.abo.messages.messagesNonLusAdmin);
  const validerPersonne = useMutation(api.abo.demandes.validerPersonne);

  // Map dossierId → nb de messages non lus par les admins (badges 💬).
  const nonLusParDossier = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nonLus ?? []) m.set(n.dossierId, n.count);
    return m;
  }, [nonLus]);

  // Tables de matching « élève en cours » : par licence (fiable), repli par
  // nom+prénom normalisé (homonymes possibles — indicatif). Valeur = horaire.
  const parLicence = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of eleves ?? []) if (e.licence) m.set(e.licence, e.horaire);
    return m;
  }, [eleves]);
  const parNom = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of eleves ?? []) m.set(e.nom_prenom_normalise, e.horaire);
    return m;
  }, [eleves]);

  function horaireEleve(p: Personne): string | null | undefined {
    if (p.licence && parLicence.has(p.licence)) return parLicence.get(p.licence);
    if (parNom.has(p.nom_prenom_normalise)) return parNom.get(p.nom_prenom_normalise);
    return undefined; // pas un·e élève en cours
  }

  const [statut, setStatut] = useState("nouvelle_demande");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<{ dossier: Dossier; personne: Personne } | null>(
    null,
  );
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const filtres = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return (dossiers ?? []).filter((d) => {
      if (statut !== "tous" && d.statut_dossier !== statut) return false;
      if (!texte) return true;
      const foin = [d.email, ...d.personnes.flatMap((p) => [p.nom, p.prenom])]
        .join(" ")
        .toLowerCase();
      return foin.includes(texte);
    });
  }, [dossiers, statut, q]);

  async function decider(personne: Personne, decision: string) {
    if (decision === personne.etape_validation) return;
    try {
      await validerPersonne({
        personneId: personne.id as Id<"abo_personnes">,
        decision: decision as "validee" | "liste_attente" | "refusee",
      });
      setErreurs((prev) => {
        const next = { ...prev };
        delete next[personne.id];
        return next;
      });
    } catch (err) {
      setErreurs((prev) => ({ ...prev, [personne.id]: aboError(err).message }));
    }
  }

  if (dossiers === undefined) {
    return <p>Chargement…</p>;
  }

  return (
    <div className="abo-admin-section">
      <CompteurJauge />
      <SyncClub />
      <div className="abo-admin-toolbar">
        <label>
          Statut{" "}
          <select value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="tous">Tous</option>
            {Object.entries(STATUTS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recherche{" "}
          <input
            type="search"
            placeholder="Nom ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      <p className="abo-admin-intro">
        {filtres.length} dossier{filtres.length > 1 ? "s" : ""}
      </p>

      <div className="abo-admin-card-grid">
        {filtres.length === 0 ? (
          <p className="abo-admin-empty">Aucun dossier ne correspond.</p>
        ) : (
          filtres.map((d) => (
            <article key={d.id} className="abo-admin-card abo-admin-dossier-card">
              <div className="abo-admin-card-header">
                <Badge statut={d.statut_dossier} />
                <span className="abo-admin-toolbar">
                  {(nonLusParDossier.get(d.id) ?? 0) > 0 && (
                    <span
                      title="Messages non lus"
                      className="abo-admin-badge abo-admin-badge--unread"
                    >
                      💬 {nonLusParDossier.get(d.id)}
                    </span>
                  )}
                  <span className="abo-admin-meta">{d.email}</span>
                </span>
              </div>
              <p className="abo-admin-meta">
                Soumis le{" "}
                {d.date_soumission
                  ? new Date(d.date_soumission).toLocaleDateString("fr-FR")
                  : "—"}
              </p>
              {d.commentaire && (
                <p
                  className="abo-admin-comment"
                >
                  {d.commentaire}
                </p>
              )}
              <ul className="abo-admin-sublist">
                {d.personnes.map((p, i) => (
                  <li
                    key={p.id}
                    className="abo-admin-person-row"
                  >
                    <div
                      className="abo-admin-toolbar"
                    >
                      <button
                        onClick={() => setDetail({ dossier: d, personne: p })}
                        className="abo-admin-link-button"
                      >
                        {`${p.prenom} ${p.nom}`.trim() || "—"}
                      </button>
                      {i === 0 && (
                        <span className="abo-admin-meta">
                          demandeur
                        </span>
                      )}
                      <ChipEnCours horaire={horaireEleve(p)} />
                    </div>
                    <div className="abo-admin-decision-group">
                      {DECISIONS.map((dec) => (
                        <button
                          key={dec.valeur}
                          onClick={() => decider(p, dec.valeur)}
                          className={`abo-admin-decision${p.etape_validation === dec.valeur ? " is-active" : ""}`}
                        >
                          {dec.label}
                        </button>
                      ))}
                    </div>
                    {erreurs[p.id] && (
                      <p className="abo-admin-status abo-admin-status--error">
                        Échec : {erreurs[p.id]}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>

      {suppressions && suppressions.length > 0 && (
        <details className="abo-admin-archive">
          <summary className="abo-admin-archive-summary">
            Demandes supprimées ({suppressions.length})
          </summary>
          <ul>
            {suppressions.map((s, i) => (
              <li key={i} className="abo-admin-archive-item">
                <strong>{(s.personnes ?? "").trim() || s.email}</strong> a supprimé
                sa demande le{" "}
                {s.supprime_le
                  ? new Date(s.supprime_le).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}{" "}
                <span className="abo-admin-muted">({s.email})</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {detail && (
        <DetailModal
          dossier={detail.dossier}
          personne={detail.personne}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// Puce « en cours d'escalade » + créneau : la personne figure dans les élèves en
// cours (passe-droit vague 2). Fiable par licence, indicatif par nom+prénom.
// `horaire === undefined` → pas un·e élève (rien affiché).
function ChipEnCours({ horaire }: { horaire: string | null | undefined }) {
  if (horaire === undefined) return null;
  const creneau = (horaire ?? "").trim();
  return (
    <span
      title="Élève en cours d'escalade (export des cours)"
      className="abo-admin-badge abo-admin-badge--course"
    >
      🧗 {creneau ? `en cours · ${creneau}` : "en cours d'escalade"}
    </span>
  );
}

function Badge({ statut }: { statut: string }) {
  return (
    <span className={`abo-admin-badge abo-admin-badge--${statut}`}>
      {STATUTS[statut] ?? statut}
    </span>
  );
}

// ── Détail d'une personne (barre des 8 étapes internes) ──────────────
interface EtapeInterne {
  titre: string;
  etat: "done" | "waiting" | "pending" | "attente" | "rejected";
  etatLabel: string;
}
const MARQUES: Record<string, string> = {
  done: "✓",
  rejected: "✕",
  attente: "!",
  waiting: "",
  pending: "",
};

function etapesDe(p: Personne): EtapeInterne[] {
  const auto = (champ: keyof Personne, titre: string): EtapeInterne =>
    p[champ]
      ? { titre, etat: "done", etatLabel: "Détecté" }
      : { titre, etat: "pending", etatLabel: "En attente de détection" };

  const validation = (): EtapeInterne => {
    const map: Record<string, { etat: EtapeInterne["etat"]; etatLabel: string }> = {
      en_attente: { etat: "waiting", etatLabel: "En attente de validation" },
      validee: { etat: "done", etatLabel: "Validée" },
      liste_attente: { etat: "attente", etatLabel: "Liste d'attente" },
      refusee: { etat: "rejected", etatLabel: "Refusée" },
    };
    const s = map[p.etape_validation] ?? map.en_attente;
    return { titre: "Validation de la demande", ...s };
  };

  const test = (): EtapeInterne | null => {
    const v = p.etape_test_autonomie;
    if (v === "non_requis" || (p.age != null && p.age < 16)) return null;
    if (v === "valide")
      return { titre: "Test d'autonomie", etat: "done", etatLabel: "Validé" };
    if (v === "requis")
      return { titre: "Test d'autonomie", etat: "waiting", etatLabel: "Requis" };
    return {
      titre: "Test d'autonomie",
      etat: "pending",
      etatLabel: "En attente de détection",
    };
  };

  return [
    p.etape_demande
      ? { titre: "Demande envoyée", etat: "done", etatLabel: "Envoyée" }
      : { titre: "Demande envoyée", etat: "waiting", etatLabel: "En attente" },
    validation(),
    auto("etape_licence", "Licence prise"),
    test(),
    auto("etape_inscription_site", "Inscription espace adhérent"),
    auto("etape_photo", "Photo validée"),
    p.etape_paiement
      ? { titre: "Paiement HelloAsso", etat: "done", etatLabel: "Payé" }
      : {
          titre: "Paiement HelloAsso",
          etat: "pending",
          etatLabel: "En attente de paiement",
        },
    auto("etape_abonnement_valide", "Abonnement validé"),
  ].filter((e): e is EtapeInterne => e !== null);
}

function DetailModal({
  dossier,
  personne,
  onClose,
}: {
  dossier: Dossier;
  personne: Personne;
  onClose: () => void;
}) {
  const nom = `${personne.prenom} ${personne.nom}`.trim() || "—";
  return (
    <div className="abo-admin-modal-backdrop" onClick={onClose}>
      <div className="abo-admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="abo-admin-modal-header">
          <h3>{nom}</h3>
          <button
            onClick={onClose}
            className="abo-admin-modal-close"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <p className="abo-admin-meta">
          <code>{dossier.email}</code> <Badge statut={dossier.statut_dossier} />
        </p>
        {personne.licence && (
          <p className="abo-admin-modal-copy">
            Licence : <code>{personne.licence}</code>
            {personne.licence_statut ? ` (${personne.licence_statut})` : ""}
          </p>
        )}
        <ol className="abo-admin-steps">
          {etapesDe(personne).map((e, i) => (
            <li
              key={i}
              className={`abo-admin-step${i > 0 ? " abo-admin-step--after" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`abo-admin-step-mark abo-admin-step-mark--${e.etat}`}
              >
                {MARQUES[e.etat] ?? ""}
              </span>
              <span className="abo-admin-step-title">{e.titre}</span>
              <span className="abo-admin-step-state">{e.etatLabel}</span>
            </li>
          ))}
        </ol>

        <h4 className="abo-admin-modal-subtitle">Messagerie</h4>
        <p className="abo-admin-step-state">
          Fil partagé avec l'abonné·e (rattaché au dossier, pas à la personne).
        </p>
        <FilDiscussion dossierId={dossier.id as Id<"abo_dossiers">} hauteur={220} />
      </div>
    </div>
  );
}
