import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { aboError } from "../lib/errors";

// Vue admin « Licences » : résolution des licences des demandes. La licence relie
// demandes / scrap / cours. Les correspondances exactes (nom/prénom, même inversé)
// sont résolues automatiquement ; les autres sont arbitrées ici (candidats fuzzy
// classés par similarité, ou saisie manuelle). Portage de src/pages/admin-licences.js.

export default function Licences() {
  const personnes = useQuery(api.abo.licences.getLicencesAValider);
  const conflits = useQuery(api.abo.licences.getConflitsLicences);
  const resoudre = useMutation(api.abo.licences.resoudreLicencesPersonnes);
  const importer = useAction(api.abo.licences.importerAnnuaireLicences);
  const fusionner = useMutation(api.abo.licences.fusionnerPersonnesLicence);

  const [msgResoudre, setMsgResoudre] = useState<string | null>(null);
  const [msgImport, setMsgImport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lancerResolution() {
    setMsgResoudre("Résolution…");
    try {
      const n = await resoudre({});
      setMsgResoudre(`${n} personne(s) résolue(s).`);
    } catch (err) {
      setMsgResoudre(`Échec : ${aboError(err).message}`);
    }
  }

  async function lancerImport() {
    setBusy(true);
    setMsgImport("Téléchargement de l'annuaire…");
    try {
      const r = await importer({});
      setMsgImport(
        `Annuaire synchronisé : ${r.upsertees} licence(s) (sur ${r.recus} reçue(s)).`,
      );
    } catch (err) {
      setMsgImport(`Échec : ${aboError(err).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (personnes === undefined) {
    return <p>Chargement…</p>;
  }

  return (
    <div className="abo-admin-section">
      <p className="abo-admin-intro">
        La licence relie les demandes au scrap et aux cours. Les correspondances
        exactes (nom/prénom, même inversé) sont résolues automatiquement.
        Ci-dessous, les personnes à <strong>arbitrer</strong> : choisissez le bon
        candidat de l'annuaire, ou saisissez une licence à la main.
      </p>

      <div className="abo-admin-toolbar">
        <button onClick={lancerResolution} className="abo-admin-button abo-admin-button--secondary">
          ↻ Relancer la résolution automatique
        </button>
        {msgResoudre && <span className="abo-admin-status">{msgResoudre}</span>}
      </div>
      <div className="abo-admin-toolbar">
        <button onClick={lancerImport} className="abo-admin-button abo-admin-button--secondary" disabled={busy}>
          ⬇ Synchroniser l'annuaire des licences
        </button>
        {msgImport && <span className="abo-admin-status">{msgImport}</span>}
      </div>

      <section className="abo-admin-subsection abo-admin-licence-conflicts">
        <h3 className="abo-admin-subheading">Conflits de licence</h3>
        <p className="abo-admin-meta">
          Une licence ne peut appartenir qu'à une personne. Choisissez la personne à conserver : seules ses réservations de test récupèrent l'historique de l'autre personne ; les dossiers, comptes et messages restent séparés.
        </p>
        {conflits === undefined ? (
          <p>Chargement…</p>
        ) : conflits.length === 0 ? (
          <p className="abo-admin-empty">Aucun conflit de licence.</p>
        ) : (
          <ul className="abo-admin-list">
            {conflits.map((conflit) => (
              <CarteConflit key={conflit.licence} conflit={conflit} fusionner={fusionner} />
            ))}
          </ul>
        )}
      </section>

      <p className="abo-admin-count">
        {personnes.length} personne{personnes.length > 1 ? "s" : ""} à valider
      </p>

      {personnes.length === 0 ? (
        <p className="abo-admin-empty">
          Aucune personne à valider : toutes les licences sont résolues.
        </p>
      ) : (
        <ul className="abo-admin-list">
          {personnes.map((p) => (
            <CartePersonne key={p.personne_id} personne={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

type ConflitLicence = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.licences.getConflitsLicences>>
>[number];

function CarteConflit({
  conflit,
  fusionner,
}: {
  conflit: ConflitLicence;
  fusionner: ReturnType<typeof useMutation<typeof api.abo.licences.fusionnerPersonnesLicence>>;
}) {
  const [cibleId, setCibleId] = useState<Id<"abo_personnes"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fusionnerDansCible(sourceId: Id<"abo_personnes">) {
    if (!cibleId) return;
    const source = conflit.personnes.find((personne) => personne.personneId === sourceId);
    const cible = conflit.personnes.find((personne) => personne.personneId === cibleId);
    if (!source || !cible) return;
    if (!window.confirm(`Fusionner ${source.prenom} ${source.nom} dans ${cible.prenom} ${cible.nom} ? Cette action supprime la personne écartée après transfert de ses réservations de test. Son dossier sera aussi supprimé s'il devient réellement vide.`)) return;
    setMessage("Fusion…");
    try {
      const resultat = await fusionner({ personneSourceId: sourceId, personneCibleId: cibleId });
      setMessage(`${resultat.reservationsReaffectees} réservation(s) de test réaffectée(s). ${resultat.dossierSourceSupprime ? "Le dossier vide a été supprimé." : "Le dossier source contient encore des données et a été conservé."}`);
    } catch (err) {
      setMessage(`Échec : ${aboError(err).message}`);
    }
  }

  return (
    <li className="abo-admin-card abo-admin-licence-card abo-admin-licence-conflict">
      <strong>Licence {conflit.licence}</strong>
      <p className="abo-admin-meta">Choisissez la personne correcte, puis fusionnez chaque doublon dans celle-ci.</p>
      <ul className="abo-admin-sublist">
        {conflit.personnes.map((personne) => {
          const estCible = cibleId === personne.personneId;
          return (
            <li key={personne.personneId} className="abo-admin-list-row">
              <span>
                <strong>{`${personne.prenom} ${personne.nom}`.trim()}</strong><br />
                <span className="abo-admin-meta">{personne.email} · {personne.etapeValidation}{personne.reservationActive ? " · réservation de test active" : ""}</span>
              </span>
              {estCible ? (
                <span className="abo-admin-badge abo-admin-badge--success">À conserver</span>
              ) : cibleId ? (
                <button type="button" className="abo-admin-link-button abo-admin-link-button--danger" onClick={() => void fusionnerDansCible(personne.personneId as Id<"abo_personnes">)}>
                  Fusionner dans la personne conservée
                </button>
              ) : (
                <button type="button" className="abo-admin-link-button" onClick={() => setCibleId(personne.personneId as Id<"abo_personnes">)}>
                  Conserver cette personne
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {cibleId && <button type="button" className="abo-admin-link-button" onClick={() => setCibleId(null)}>Changer de personne à conserver</button>}
      {message && <p className="abo-admin-status">{message}</p>}
    </li>
  );
}

type PersonneAValider = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.licences.getLicencesAValider>>
>[number];

function CartePersonne({ personne }: { personne: PersonneAValider }) {
  const validerLicence = useMutation(api.abo.licences.validerLicence);
  const fusionner = useMutation(api.abo.licences.fusionnerPersonnesLicence);
  const [manuel, setManuel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [conflit, setConflit] = useState<{
    licence: string;
    personneExistanteId: Id<"abo_personnes">;
    personneExistanteNom: string;
    personneExistantePrenom: string;
    personneExistanteEmail: string | null;
  } | null>(null);

  async function associer(licence: string) {
    setMsg("Association…");
    try {
      const resultat = await validerLicence({
        personneId: personne.personne_id as Id<"abo_personnes">,
        licence: licence.trim(),
      });
      if (resultat.statut === "conflit") {
        setConflit(resultat);
        setMsg(null);
      } else {
        setConflit(null);
        // La personne résolue disparaît de la liste (query réactive).
      }
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    }
  }

  async function confirmerFusion() {
    if (!conflit) return;
    const nomExistant = `${conflit.personneExistantePrenom} ${conflit.personneExistanteNom}`.trim();
    if (!window.confirm(`Conserver ${nom} et fusionner ${nomExistant} dans cette personne ? Les réservations de test seront transférées. Le dossier écarté sera supprimé s'il devient réellement vide ; les comptes et messages ne seront jamais supprimés automatiquement.`)) return;
    setMsg("Fusion…");
    try {
      await fusionner({
        personneSourceId: conflit.personneExistanteId,
        personneCibleId: personne.personne_id as Id<"abo_personnes">,
      });
      setConflit(null);
      // La personne cible reçoit la licence et disparaît de la liste réactive.
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    }
  }

  const nom = `${personne.prenom} ${personne.nom}`.trim() || "—";

  return (
    <li className="abo-admin-card abo-admin-licence-card">
      <div className="abo-admin-card-title">{nom}</div>
      <ul className="abo-admin-sublist">
        {personne.candidats.length === 0 ? (
          <li className="abo-admin-empty">
            Aucun candidat proche dans l'annuaire.
          </li>
        ) : (
          personne.candidats.map((c) => {
            const cn = `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "—";
            return (
              <li
                key={c.licence}
                className="abo-admin-list-row"
              >
                <span>
                  {cn} — <code>{c.licence}</code>{" "}
                  <span className="abo-admin-meta">
                    {Math.round((c.score ?? 0) * 100)}%
                  </span>
                </span>
                <button
                  onClick={() => associer(c.licence)}
                  className="abo-admin-link-button"
                >
                  Associer
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="abo-admin-toolbar">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Saisir une licence (12 chiffres)"
          value={manuel}
          onChange={(e) => setManuel(e.target.value)}
        />
        <button
          onClick={() => associer(manuel)}
          className="abo-admin-link-button"
        >
          Associer cette licence
        </button>
      </div>
      {conflit && (
        <div className="abo-admin-notice abo-admin-notice--warning">
          <strong>Licence {conflit.licence} déjà attribuée</strong>
          <p>
            Elle est actuellement liée à {`${conflit.personneExistantePrenom} ${conflit.personneExistanteNom}`.trim()}
            {conflit.personneExistanteEmail ? ` (${conflit.personneExistanteEmail})` : ""}.
          </p>
          <p>
            Si c&apos;est la même personne, conservez ce dossier-ci et transférez uniquement les réservations de test. Sinon, laissez les deux dossiers séparés.
          </p>
          <button type="button" onClick={() => void confirmerFusion()} className="abo-admin-link-button abo-admin-link-button--danger">
            Conserver ce dossier et fusionner l&apos;autre personne
          </button>
        </div>
      )}
      {msg && (
        <p className="abo-admin-status abo-admin-status--error">
          {msg}
        </p>
      )}
    </li>
  );
}
