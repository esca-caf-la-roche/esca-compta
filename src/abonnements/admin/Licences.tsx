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
  const resoudre = useMutation(api.abo.licences.resoudreLicencesPersonnes);
  const importer = useAction(api.abo.licences.importerAnnuaireLicences);

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

type PersonneAValider = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.licences.getLicencesAValider>>
>[number];

function CartePersonne({ personne }: { personne: PersonneAValider }) {
  const validerLicence = useMutation(api.abo.licences.validerLicence);
  const [manuel, setManuel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function associer(licence: string) {
    setMsg("Association…");
    try {
      await validerLicence({
        personneId: personne.personne_id as Id<"abo_personnes">,
        licence: licence.trim(),
      });
      // La personne résolue disparaît de la liste (query réactive).
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
      {msg && (
        <p className="abo-admin-status abo-admin-status--error">
          {msg}
        </p>
      )}
    </li>
  );
}
