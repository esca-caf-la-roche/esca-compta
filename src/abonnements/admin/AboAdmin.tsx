import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import Dossiers from "./Dossiers";
import Licences from "./Licences";
import Tests from "./Tests";
import Anomalies from "./Anomalies";
import Paiements from "./Paiements";
import Configuration from "./Configuration";

type Vue = "dossiers" | "anomalies" | "licences" | "tests" | "paiements" | "config";

const TABS: { id: Vue; label: string }[] = [
  { id: "dossiers", label: "Dossiers" },
  { id: "paiements", label: "Paiements" },
  { id: "anomalies", label: "Anomalies" },
  { id: "licences", label: "Licences" },
  { id: "tests", label: "Tests" },
  { id: "config", label: "Configuration" },
];

// Espace admin des abonnements (dans le Layout compta, atteint par la tuile).
// Réservé au staff qui gère les abonnements (garde côté serveur + ici).
// Phase B : coquille à onglets ; les vues sont remplies aux phases suivantes.
export default function AboAdmin() {
  const me = useQuery(api.abo.identity.me);
  const [vue, setVue] = useState<Vue>("dossiers");

  // Synchro on-demand au chargement (throttle serveur ~1 h) : remplace les crons
  // horaires. Non-bloquante — les vues lisent le cache et se rafraîchissent
  // toutes seules quand les données changent. Ordre géré côté serveur
  // (HelloAsso → scrap → annuaire → élèves).
  const syncAbo = useAction(api.abo.sync.syncPourAbo);
  const syncLance = useRef(false);
  useEffect(() => {
    if (syncLance.current || me?.aboRole !== "admin") return;
    syncLance.current = true;
    void syncAbo({}).catch(() => {
      /* échec silencieux : les crons n'existent plus, une source externe peut
         être temporairement indisponible sans casser l'espace admin. */
    });
  }, [syncAbo, me]);

  if (me === undefined) {
    return <div style={{ padding: "2rem" }}>Chargement…</div>;
  }
  if (!me || me.aboRole !== "admin") {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas accès à la gestion des abonnements.</p>
      </div>
    );
  }

  return (
    <div className="abo-admin" style={{ padding: "1.5rem", maxWidth: "1100px", margin: "0 auto" }}>
      <header className="page-header" style={{ marginBottom: "1.5rem" }}>
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Retour au tableau de bord
        </Link>
        <h1>Abonnements escalade</h1>
        <p className="subtitle">Gestion des nouvelles inscriptions aux créneaux autonomes.</p>
      </header>

      <nav className="abo-admin-nav" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.5rem" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setVue(t.id)}
            style={{
              background: "transparent",
              border: "none",
              padding: "0.5rem 1rem",
              fontWeight: "bold",
              cursor: "pointer",
              color: vue === t.id ? "#000" : "#6b7280",
              borderBottom: vue === t.id ? "3px solid #000" : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="abo-admin-vue">
        {vue === "dossiers" ? (
          <Dossiers />
        ) : vue === "licences" ? (
          <Licences />
        ) : vue === "tests" ? (
          <Tests />
        ) : vue === "anomalies" ? (
          <Anomalies />
        ) : vue === "paiements" ? (
          <Paiements />
        ) : vue === "config" ? (
          <Configuration />
        ) : (
          <p style={{ color: "#6b7280" }}>
            Module « {TABS.find((t) => t.id === vue)?.label} » en cours de
            développement.
          </p>
        )}
      </div>
    </div>
  );
}
