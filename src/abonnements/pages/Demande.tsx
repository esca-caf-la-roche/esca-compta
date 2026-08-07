import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { aboError, formatDateHeure } from "../lib/errors";
import { useMaintenantMinute } from "../lib/useMaintenantMinute";
import N1RedirectModal from "../N1RedirectModal";

// Formulaire de demande (abonné), gaté par la vague d'inscription :
//   - vague ≤ 1 : demande FERMÉE (écran « ouverture le … »).
//   - vague 2   : réservé aux élèves → n° de licence OBLIGATOIRE par personne
//                 (identité reconnue côté serveur, sans fuite).
//   - vague ≥ 3 : ouvert à tous → n° de licence FACULTATIF.
// La validation front est un confort UX : la vraie barrière est creerDemande
// (gating vague + owner_id côté serveur).

interface Ligne {
  nom: string;
  prenom: string;
  licence: string;
}

const formatOk = (l: string) => [12, 14].includes(l.replace(/\D/g, "").length);

export default function Demande() {
  const maintenantMs = useMaintenantMinute();
  const cfg = useQuery(api.abo.config.vaguesConfig, { maintenantMs });
  const liens = useQuery(api.abo.config.liensFinalisation);
  const suppressions = useQuery(api.abo.demandes.getMesSuppressions);
  const creerDemande = useAction(api.abo.demandes.creerDemande);

  const [personnes, setPersonnes] = useState<Ligne[]>([
    { nom: "", prenom: "", licence: "" },
  ]);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirectionN1, setRedirectionN1] = useState<string | null>(null);

  if (cfg === undefined) {
    return (
      <div className="abo-content">
        <h1>Nouvelle demande</h1>
        <p>Chargement…</p>
      </div>
    );
  }

  const vague = cfg.vague ?? 0;
  const vague2 = vague === 2;
  const derniereSuppr = (suppressions ?? [])[0];

  const historique = derniereSuppr ? (
    <p className="abo-historique">
      ℹ️ Vous avez supprimé une précédente demande le{" "}
      {formatDateHeure(derniereSuppr.supprime_le)}. Vous pouvez en refaire une
      ci-dessous.
    </p>
  ) : null;

  // Vague ≤ 1 : la demande n'est pas encore ouverte.
  if (vague < 2) {
    return (
      <div className="abo-content">
        <h1>Demande de disponibilité</h1>
        {historique}
        <div className="abo-fermee">
          <p>
            <strong>La demande n'est pas encore ouverte.</strong>
          </p>
          <p>
            Elle ouvrira le{" "}
            <strong>{formatDateHeure(cfg.vague2_debut)}</strong>, d'abord pour les{" "}
            <strong>élèves en cours d'escalade</strong> (sur n° de licence), puis{" "}
            <strong>à tous</strong> le {formatDateHeure(cfg.vague3_debut)}.
          </p>
          <p className="abo-placeholder">
            Revenez à cette date pour déposer votre demande.
          </p>
        </div>
      </div>
    );
  }

  function setLigne(i: number, champ: keyof Ligne, valeur: string) {
    setPersonnes((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [champ]: valeur } : p)),
    );
  }

  function ajouterLigne() {
    setPersonnes((prev) => [...prev, { nom: "", prenom: "", licence: "" }]);
  }

  function retirerLigne(i: number) {
    setPersonnes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    let nettoyees: Ligne[];
    if (vague2) {
      nettoyees = personnes
        .map((p) => ({ nom: "", prenom: "", licence: p.licence.trim() }))
        .filter((p) => p.licence);
      if (nettoyees.length === 0) {
        setErreur(
          "Renseignez le n° de licence de chaque personne (demande réservée aux élèves en cours d'escalade).",
        );
        return;
      }
      const mauvaise = nettoyees.find((p) => !formatOk(p.licence));
      if (mauvaise) {
        setErreur(
          `Le numéro de licence « ${mauvaise.licence} » est invalide : 12 chiffres attendus.`,
        );
        return;
      }
    } else {
      nettoyees = personnes
        .map((p) => ({
          nom: p.nom.trim(),
          prenom: p.prenom.trim(),
          licence: p.licence.trim(),
        }))
        .filter((p) => p.nom || p.prenom || p.licence);
      if (nettoyees.length === 0 || nettoyees.some((p) => !p.nom || !p.prenom)) {
        setErreur(
          "Renseignez le nom ET le prénom de chaque personne (au moins une).",
        );
        return;
      }
      const mauvaise = nettoyees.find((p) => p.licence && !formatOk(p.licence));
      if (mauvaise) {
        setErreur(
          `Le numéro de licence « ${mauvaise.licence} » est invalide : 12 chiffres attendus.`,
        );
        return;
      }
    }

    setBusy(true);
    try {
      await creerDemande({
        commentaire: message.trim() || undefined,
        personnes: nettoyees.map((p) =>
          vague2
            ? { licence: p.licence }
            : { nom: p.nom, prenom: p.prenom, licence: p.licence || undefined },
        ),
      });
      // Succès : getMonDossier (réactif) bascule l'espace vers le suivi.
    } catch (err) {
      setBusy(false);
      const erreurAbo = aboError(err);
      if (erreurAbo.code === "ABO_N1_REDIRECTION") setRedirectionN1(erreurAbo.message);
      else setErreur(erreurAbo.message);
    }
  }

  return (
    <div className="abo-content">
      <h1>Nouvelle demande</h1>
      {historique}
      <p>
        Indiquez la ou les personnes concernées (vous, et le cas échéant les
        membres de votre famille / binôme).
      </p>
      {vague2 ? (
        <p className="abo-vague-info">
          En cette période, la demande est{" "}
          <strong>réservée aux élèves en cours d'escalade</strong> : saisissez
          simplement le <strong>n° de licence</strong> de chaque personne — votre
          identité est reconnue automatiquement. Ouverture à tous le{" "}
          {formatDateHeure(cfg.vague3_debut)}.
        </p>
      ) : (
        <p className="abo-vague-info">
          Le n° de licence est facultatif (renseignez-le si vous le connaissez).
        </p>
      )}

      {erreur && (
        <p className="abo-msg abo-msg-error" role="alert">
          {erreur}
        </p>
      )}
      {redirectionN1 && (
        <N1RedirectModal
          message={redirectionN1}
          inscriptionUrl={liens?.inscription}
          onClose={() => setRedirectionN1(null)}
        />
      )}

      <form onSubmit={soumettre} className="abo-form">
        <fieldset className="abo-fieldset">
          <legend>Personnes</legend>
          {personnes.map((p, i) => (
            <div className="abo-personne-ligne" key={i}>
              {!vague2 && (
                <>
                  <input
                    className="abo-input"
                    type="text"
                    placeholder="Nom"
                    value={p.nom}
                    onChange={(e) => setLigne(i, "nom", e.target.value)}
                  />
                  <input
                    className="abo-input"
                    type="text"
                    placeholder="Prénom"
                    value={p.prenom}
                    onChange={(e) => setLigne(i, "prenom", e.target.value)}
                  />
                </>
              )}
              <input
                className="abo-input"
                type="text"
                inputMode="numeric"
                placeholder={vague2 ? "N° de licence" : "N° de licence (facultatif)"}
                value={p.licence}
                onChange={(e) => setLigne(i, "licence", e.target.value)}
              />
              <button
                type="button"
                className="abo-retirer"
                onClick={() => retirerLigne(i)}
                disabled={personnes.length <= 1}
                aria-label="Retirer cette personne"
              >
                ✕
              </button>
            </div>
          ))}
        </fieldset>

        <button type="button" className="abo-link" onClick={ajouterLigne}>
          + Ajouter une personne
        </button>

        <label htmlFor="abo-message">Message (facultatif)</label>
        <textarea
          id="abo-message"
          className="abo-input"
          rows={3}
          placeholder="Un message pour les bénévoles…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button type="submit" className="abo-btn" disabled={busy}>
          {busy ? "Envoi…" : "Envoyer la demande"}
        </button>
      </form>
    </div>
  );
}
