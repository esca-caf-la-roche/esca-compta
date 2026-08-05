import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import FilDiscussion from "../FilDiscussion";

type Dossier = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.demandes.getDossiersAdmin>>
>[number];

/**
 * Boîte de réception commune aux bénévoles. Les messages non lus sont affichés
 * en premier, sans être masqués par le statut administratif du dossier.
 */
export default function Messages() {
  const dossiers = useQuery(api.abo.demandes.getDossiersAdmin);
  const nonLus = useQuery(api.abo.messages.messagesNonLusAdmin);
  const [afficher, setAfficher] = useState<"non_lus" | "tous">("non_lus");
  const [dossierOuvert, setDossierOuvert] = useState<Id<"abo_dossiers"> | null>(null);

  const nonLusParDossier = useMemo(
    () => new Map((nonLus ?? []).map(({ dossierId, count }) => [dossierId, count])),
    [nonLus],
  );
  const conversations = useMemo(() => {
    const toutes = dossiers ?? [];
    const filtrees =
      afficher === "non_lus"
        ? toutes.filter((dossier) => (nonLusParDossier.get(dossier.id) ?? 0) > 0)
        : toutes;
    return [...filtrees].sort(
      (a, b) =>
        (nonLusParDossier.get(b.id) ?? 0) - (nonLusParDossier.get(a.id) ?? 0) ||
        b.date_soumission.localeCompare(a.date_soumission),
    );
  }, [afficher, dossiers, nonLusParDossier]);

  function ouvrirDossier(dossierId: Id<"abo_dossiers">) {
    if (dossierOuvert === dossierId) {
      setDossierOuvert(null);
      setAfficher("non_lus");
      return;
    }
    // L'ouverture marque les messages lus dans FilDiscussion. Quitter d'abord
    // le filtre « À traiter » empêche donc le fil de disparaître en direct.
    setAfficher("tous");
    setDossierOuvert(dossierId);
  }

  if (dossiers === undefined || nonLus === undefined) return <p>Chargement…</p>;

  const totalNonLus = nonLus.reduce((total, message) => total + message.count, 0);
  return (
    <section className="abo-admin-section" aria-labelledby="abo-messages-title">
      <h2 id="abo-messages-title">Messages</h2>
      <p className="abo-admin-intro">
        {totalNonLus > 0
          ? `${totalNonLus} message${totalNonLus > 1 ? "s" : ""} à traiter.`
          : "Aucun message à traiter."}
      </p>
      <div className="abo-admin-toolbar">
        <button className={`abo-admin-button${afficher === "non_lus" ? " is-active" : " abo-admin-button--secondary"}`} type="button" onClick={() => setAfficher("non_lus")} aria-pressed={afficher === "non_lus"}>
          À traiter ({totalNonLus})
        </button>
        <button className={`abo-admin-button${afficher === "tous" ? " is-active" : " abo-admin-button--secondary"}`} type="button" onClick={() => setAfficher("tous")} aria-pressed={afficher === "tous"}>
          Toutes les conversations
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="abo-admin-empty">
          {afficher === "non_lus"
            ? "Tous les messages ont été lus."
            : "Aucune conversation n’est encore ouverte."}
        </p>
      ) : (
        <div className="abo-admin-list">
          {conversations.map((dossier) => (
            <Conversation
              key={dossier.id}
              dossier={dossier}
              nonLus={nonLusParDossier.get(dossier.id) ?? 0}
              ouverte={dossierOuvert === dossier.id}
              onOuvrir={() => ouvrirDossier(dossier.id as Id<"abo_dossiers">)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Conversation({
  dossier,
  nonLus,
  ouverte,
  onOuvrir,
}: {
  dossier: Dossier;
  nonLus: number;
  ouverte: boolean;
  onOuvrir: () => void;
}) {
  const demandeur = dossier.personnes[0];
  const nom = demandeur ? `${demandeur.prenom} ${demandeur.nom}`.trim() : dossier.email;
  return (
    <article className={`abo-admin-card abo-admin-conversation${nonLus > 0 ? " abo-admin-card--attention" : ""}`}>
      <div className="abo-admin-card-header">
        <div>
          <strong>{nom || "Demandeur non renseigné"}</strong>
          <div className="abo-admin-meta">{dossier.email}</div>
        </div>
        <div className="abo-admin-toolbar">
          {nonLus > 0 && <strong className="abo-admin-status abo-admin-status--error">{nonLus} non lu{nonLus > 1 ? "s" : ""}</strong>}
          <button className="abo-admin-button abo-admin-button--secondary" type="button" onClick={onOuvrir}>{ouverte ? "Fermer" : "Voir et répondre"}</button>
        </div>
      </div>
      {ouverte && (
        <div className="abo-admin-conversation-thread">
          <FilDiscussion dossierId={dossier.id as Id<"abo_dossiers">} hauteur={300} />
        </div>
      )}
    </article>
  );
}
