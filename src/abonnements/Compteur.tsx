import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import "./abo.css";
import { useMaintenantMinute } from "./lib/useMaintenantMinute";

// Compteur public embarquable (iframe du site club). Lit l'agrégat ANONYME
// api.abo.compteur.compteurPublic (aucune donnée nominative). Réactif Convex :
// se met à jour tout seul quand le scrap / les validations changent — pas de
// polling. Fond transparent : s'adapte à la page hôte.
// Portage de compteur.html + src/embed/compteur.js.

export default function Compteur() {
  const maintenantMs = useMaintenantMinute();
  const data = useQuery(api.abo.compteur.compteurPublic, { maintenantMs });

  if (data === undefined) {
    return (
      <div className="abo-compteur-embed">
        <p className="abo-compteur-loading">Chargement…</p>
      </div>
    );
  }

  const { places_max, places_restantes, vague } = data;
  const restantes = Math.max(0, places_restantes);
  const complet = places_restantes <= 0;
  const pct =
    places_max > 0
      ? Math.min(100, Math.round(((places_max - restantes) / places_max) * 100))
      : 0;

  return (
    <div className="abo-compteur-embed">
      <div className="abo-compteur-card">
        <div className="abo-compteur-title">
          Places escalade autonomie
        </div>
        <div className={`abo-compteur-value${complet ? " is-complet" : ""}`}>
          {complet ? "Complet" : `${restantes} place${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`}
        </div>
        <div className="abo-compteur-total">
          {places_max} places au total
        </div>
        <div className="abo-compteur-vague">
          {vague <= 0 ? "Avant la vague 1" : `Vague ${vague}`}
        </div>
        <p className="abo-compteur-note">
          La disponibilité est indicative : les dossiers sont validés manuellement par des bénévoles.
          Une place affichée peut donc ne plus être disponible au moment du traitement de votre demande.
        </p>
        <div className="abo-compteur-track">
          <span
            className={`abo-compteur-fill${complet ? " is-complet" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
