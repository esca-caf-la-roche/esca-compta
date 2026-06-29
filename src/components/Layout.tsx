import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSeason } from "../contexts/SeasonContext";
import { LogOut } from "lucide-react";

export default function Layout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const { season, setSeason, availableSeasons } = useSeason();
  const location = useLocation();

  // La partie Paiements ne fonctionne pas avec les saisons :
  // on masque le sélecteur de saison sur ces écrans.
  const showSeasonSelector = !location.pathname.startsWith("/paiements");

  if (isLoading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
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
