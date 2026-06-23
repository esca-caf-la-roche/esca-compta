import { Link } from "react-router-dom";
import Tile from "../components/Tile";
import { Calculator, Settings, CreditCard } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Dashboard() {
  const userSettings = useQuery(api.users.getCurrentUserSettings);

  return (
    <div className="dashboard-page">
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Tableau de bord</h1>
          <p className="subtitle">Sélectionnez un outil pour commencer.</p>
        </div>
        
        {userSettings?.role === "admin" && (
          <Link 
            to="/configurations"
            className="btn-secondary" 
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", padding: "0.5rem 0.75rem", background: "transparent", border: "1px solid #e5e7eb", textDecoration: "none", color: "inherit" }}
          >
            <Settings size={16} /> Configurations
          </Link>
        )}
      </header>

      {userSettings === undefined ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>Chargement de vos accès...</div>
      ) : (
        <div className="tiles-grid">
          {(userSettings.role === "admin" || userSettings.allowedTiles?.includes("compta")) && (
            <Tile
              title="Comptabilité"
              description="Gérez les transactions, prévisionnels et analyses."
              icon={Calculator}
              to="/compta"
              colorClass="bg-info"
            />
          )}
          
          {(userSettings.role === "admin" || userSettings.allowedTiles?.includes("paiements")) && (
            <Tile
              title="Paiements Escalade"
              description="Suivi des paiements pour les cours d'escalade."
              icon={CreditCard}
              href="https://project-y4zr8.vercel.app/login"
              colorClass="bg-success"
            />
          )}
          
          {userSettings.role !== "admin" && (!userSettings.allowedTiles || userSettings.allowedTiles.length === 0) && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
              <p>Vous n'avez accès à aucun module. Veuillez contacter un administrateur.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
