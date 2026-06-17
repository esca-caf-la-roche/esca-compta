import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSeason } from "../contexts/SeasonContext";
import { LogOut } from "lucide-react";

export default function Layout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { season, setSeason, availableSeasons } = useSeason();

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
          <button onClick={logout} className="btn-logout" aria-label="Se déconnecter">
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
