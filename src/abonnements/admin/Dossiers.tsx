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
    <div>
      <CompteurJauge />
      <SyncClub />
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
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

      <p style={{ color: "#6b7280" }}>
        {filtres.length} dossier{filtres.length > 1 ? "s" : ""}
      </p>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        }}
      >
        {filtres.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>Aucun dossier ne correspond.</p>
        ) : (
          filtres.map((d) => (
            <article
              key={d.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "1rem",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <Badge statut={d.statut_dossier} />
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {(nonLusParDossier.get(d.id) ?? 0) > 0 && (
                    <span
                      title="Messages non lus"
                      style={{
                        background: "#e5484d",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: "0.72rem",
                        fontWeight: "bold",
                        padding: "0.05rem 0.45rem",
                      }}
                    >
                      💬 {nonLusParDossier.get(d.id)}
                    </span>
                  )}
                  <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>{d.email}</span>
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: "0 0 0.5rem" }}>
                Soumis le{" "}
                {d.date_soumission
                  ? new Date(d.date_soumission).toLocaleDateString("fr-FR")
                  : "—"}
              </p>
              {d.commentaire && (
                <p
                  style={{
                    fontSize: "0.85rem",
                    fontStyle: "italic",
                    background: "#f9fafb",
                    padding: "0.5rem",
                    borderRadius: 4,
                  }}
                >
                  {d.commentaire}
                </p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
                {d.personnes.map((p, i) => (
                  <li
                    key={p.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      padding: "0.5rem 0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => setDetail({ dossier: d, personne: p })}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 600,
                        }}
                      >
                        {`${p.prenom} ${p.nom}`.trim() || "—"}
                      </button>
                      {i === 0 && (
                        <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                          demandeur
                        </span>
                      )}
                      <ChipEnCours horaire={horaireEleve(p)} />
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.35rem" }}>
                      {DECISIONS.map((dec) => (
                        <button
                          key={dec.valeur}
                          onClick={() => decider(p, dec.valeur)}
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            cursor: "pointer",
                            background:
                              p.etape_validation === dec.valeur ? "#111" : "#fff",
                            color:
                              p.etape_validation === dec.valeur ? "#fff" : "#374151",
                          }}
                        >
                          {dec.label}
                        </button>
                      ))}
                    </div>
                    {erreurs[p.id] && (
                      <p style={{ color: "#b91c1c", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
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
        <details style={{ marginTop: "1.5rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Demandes supprimées ({suppressions.length})
          </summary>
          <ul>
            {suppressions.map((s, i) => (
              <li key={i} style={{ fontSize: "0.85rem", margin: "0.25rem 0" }}>
                <strong>{(s.personnes ?? "").trim() || s.email}</strong> a supprimé
                sa demande le{" "}
                {s.supprime_le
                  ? new Date(s.supprime_le).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}{" "}
                <span style={{ color: "#9ca3af" }}>({s.email})</span>
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
      style={{
        fontSize: "0.7rem",
        fontWeight: 700,
        padding: "0.1rem 0.45rem",
        borderRadius: 999,
        background: "#dbeafe",
        color: "#1d4ed8",
        whiteSpace: "nowrap",
      }}
    >
      🧗 {creneau ? `en cours · ${creneau}` : "en cours d'escalade"}
    </span>
  );
}

function Badge({ statut }: { statut: string }) {
  const couleurs: Record<string, string> = {
    nouvelle_demande: "#2563eb",
    validee: "#16a34a",
    liste_attente: "#d97706",
    refusee: "#dc2626",
    complete: "#6b7280",
  };
  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 700,
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        background: (couleurs[statut] ?? "#6b7280") + "22",
        color: couleurs[statut] ?? "#6b7280",
      }}
    >
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "1.5rem",
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{nom}</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem" }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          <code>{dossier.email}</code> <Badge statut={dossier.statut_dossier} />
        </p>
        {personne.licence && (
          <p style={{ fontSize: "0.85rem" }}>
            Licence : <code>{personne.licence}</code>
            {personne.licence_statut ? ` (${personne.licence_statut})` : ""}
          </p>
        )}
        <ol style={{ listStyle: "none", padding: 0 }}>
          {etapesDe(personne).map((e, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0",
                borderTop: i > 0 ? "1px solid #f3f4f6" : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  fontSize: "0.7rem",
                  background: e.etat === "done" ? "#16a34a" : "#e5e7eb",
                  color: e.etat === "done" ? "#fff" : "#6b7280",
                }}
              >
                {MARQUES[e.etat] ?? ""}
              </span>
              <span style={{ flex: 1 }}>{e.titre}</span>
              <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{e.etatLabel}</span>
            </li>
          ))}
        </ol>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>Messagerie</h4>
        <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0 0 0.5rem" }}>
          Fil partagé avec l'abonné·e (rattaché au dossier, pas à la personne).
        </p>
        <FilDiscussion dossierId={dossier.id as Id<"abo_dossiers">} hauteur={220} />
      </div>
    </div>
  );
}
