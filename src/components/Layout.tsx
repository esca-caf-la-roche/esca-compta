import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSeason } from "../contexts/SeasonContext";
import { LogOut } from "lucide-react";

export default function Layout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const { season, setSeason, availableSeasons } = useSeason();
  const location = useLocation();
  // Discriminant staff vs abonné public : un abonné public (auto-inscrit via
  // abo-otp) n'a pas de userSettings et ne doit jamais voir l'app compta.
  const me = useQuery(api.abo.identity.me);

  // Les parties Paiements et Abonnements ne fonctionnent pas avec les saisons
  // (chacune gère son propre reset manuel) : on masque le sélecteur sur ces écrans.
  const showSeasonSelector =
    !location.pathname.startsWith("/paiements") &&
    !location.pathname.startsWith("/gestion-abonnements") &&
    !location.pathname.startsWith("/licences-cours");

  if (isLoading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  // Authentifié mais pas staff → abonné public : on le renvoie vers son espace
  // (sans révéler l'existence du portail compta).
  if (me === undefined) {
    return <div className="loading-screen">Chargement...</div>;
  }
  if (me && !me.isStaff) {
    return <Navigate to="/abonnements" replace />;
  }

  return (
    <div className="app-layout">
      <header className="main-header">
        <div className="header-brand">
          <span className="logo-text">Escalade Club</span>
        </div>
        
        <div className="header-controls">
          {showSeasonSelector && (
            <div className="season-selector">
              <label htmlFor="season">Saison :</label>
              <select
                id="season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="season-dropdown"
              >
                {availableSeasons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => void signOut()} className="btn-logout" aria-label="Se déconnecter">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}
