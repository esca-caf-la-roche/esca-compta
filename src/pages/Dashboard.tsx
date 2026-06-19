import { useState } from "react";
import Tile from "../components/Tile";
import { Calculator, Settings } from "lucide-react";
import SeasonManagementModal from "../components/SeasonManagementModal";

export default function Dashboard() {
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);

  return (
    <div className="dashboard-page">
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Tableau de bord</h1>
          <p className="subtitle">Sélectionnez un outil pour commencer.</p>
        </div>
        <button 
          className="btn-secondary" 
          onClick={() => setIsSeasonModalOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", padding: "0.5rem 0.75rem", background: "transparent", border: "1px solid #e5e7eb" }}
        >
          <Settings size={16} /> Gérer les Saisons
        </button>
      </header>

      <div className="tiles-grid">
        <Tile
          title="Comptabilité"
          description="Gérez les transactions, prévisionnels et analyses."
          icon={Calculator}
          to="/compta"
          colorClass="bg-info"
        />
      </div>

      <SeasonManagementModal 
        isOpen={isSeasonModalOpen} 
        onClose={() => setIsSeasonModalOpen(false)} 
      />
    </div>
  );
}
