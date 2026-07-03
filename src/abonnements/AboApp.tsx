import { useConvexAuth } from "convex/react";
import AboLogin from "./AboLogin";
import AboEspace from "./AboEspace";
import "./abo.css";

// Shell PUBLIC isolé des abonnés (route /abonnements, hors du Layout compta).
// Aucune référence à l'outil de gestion : un abonné ne sait pas qu'il existe.
export default function AboApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <div className="abo-root">
      {isLoading ? (
        <div className="abo-loading">Chargement…</div>
      ) : !isAuthenticated ? (
        <AboLogin />
      ) : (
        <AboEspace />
      )}
    </div>
  );
}
