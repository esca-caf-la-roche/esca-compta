import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function Anomalies() {
  const anomalies = useQuery(api.abo.compteur.vAnomalies, {});

  if (anomalies === undefined) return <p>Chargement…</p>;

  return (
    <div className="abo-admin-section">
      <p className="abo-admin-intro">
        Sont listées uniquement les inscriptions du site du club dont
        « Abonnement valide ? » vaut Oui, Non ou l'ancien statut Inconnu à
        resynchroniser. Les inscriptions déjà marquées Bloqué sont exclues.
      </p>
      <ul className="abo-admin-rules-list" aria-label="Comment lire les anomalies">
        <li><strong>Règle 1 :</strong> la personne n'était pas abonnée l'année dernière et aucune demande n'a été déposée sur le portail.</li>
        <li><strong>Règle 2 :</strong> la personne n'était pas abonnée l'année dernière et la demande portail n'est pas validée.</li>
        <li>Une correspondance N-1 ambiguë doit être vérifiée manuellement : elle n'est jamais assimilée à « Non ».</li>
        <li>Le portail est en lecture seule : toute correction de l'inscription se fait sur le site du club, puis une synchronisation actualise cette liste.</li>
      </ul>
      <p className="abo-admin-count">
        {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""} à traiter
      </p>

      {anomalies.length === 0 ? (
        <p className="abo-admin-empty">
          Aucune anomalie : les inscriptions du site respectent les règles.
        </p>
      ) : (
        <ul className="abo-admin-list">
          {anomalies.map((r) => {
            const nom =
              ((r.prenom ?? "").trim() + " " + (r.nom ?? "").trim()).trim() ||
              r.nom_prenom_normalise ||
              "—";
            return (
              <li key={r.id} className="abo-admin-card abo-admin-card--attention abo-admin-anomaly">
                <div className="abo-admin-card-copy">
                  <strong>{nom}</strong>
                  <span className="abo-admin-meta">Licence : {r.licence || "—"}</span>
                  <p className="abo-admin-reason">{r.raison}</p>
                  <dl className="abo-admin-anomaly-checks">
                    <StatutInscriptionSite valeur={r.abonnement_valide} />
                    <ControleAbonnementN1
                      abonne={r.controles.abonneN1}
                      ambigu={r.controles.abonneN1Ambigu}
                    />
                    <ControleTexte label="Statut du dossier portail" valeur={r.controles.statutDossier} />
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ControleAbonnementN1({
  abonne,
  ambigu,
}: {
  abonne: boolean;
  ambigu: boolean;
}) {
  const texte = ambigu ? "Ambigu / à vérifier" : abonne ? "Oui" : "Non";
  return <div><dt>Abonné N-1</dt><dd>{texte}</dd></div>;
}

function ControleTexte({ label, valeur }: { label: string; valeur: string }) {
  const texte = valeur === "nouvelle_demande"
    ? "Nouvelle demande"
    : valeur === "liste_attente"
      ? "Liste d'attente"
      : valeur === "refusee"
        ? "Refusée"
        : valeur === "validee"
          ? "Validée"
          : valeur === "complete"
            ? "Complète"
            : "Inconnu";
  return <div><dt>{label}</dt><dd>{texte}</dd></div>;
}

function StatutInscriptionSite({
  valeur,
}: {
  valeur: boolean | "oui" | "non" | "bloque" | "inconnu";
}) {
  const statut = valeur === true ? "oui" : valeur === false ? "inconnu" : valeur;
  const texte =
    statut === "oui"
      ? "Oui"
      : statut === "non"
        ? "Non"
        : statut === "bloque"
          ? "Bloqué"
          : "À resynchroniser";
  const explication =
    statut === "oui"
      ? "Le site du club considère l'abonnement comme valide."
      : statut === "non"
        ? "Le site du club ne considère pas encore l'abonnement comme valide."
        : statut === "bloque"
          ? "Le site du club a bloqué l'inscription ; elle ne doit plus apparaître dans les anomalies après synchronisation."
          : "Cette ancienne valeur ne distingue pas Non de Bloqué. Une synchronisation du site est nécessaire.";

  return (
    <div className={`abo-admin-site-status abo-admin-site-status--${statut}`}>
      <dt>Inscription sur le site du club</dt>
      <dd><strong>Abonnement valide ? {texte}</strong><span>{explication}</span></dd>
    </div>
  );
}
