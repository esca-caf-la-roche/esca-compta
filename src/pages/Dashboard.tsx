import Tile from "../components/Tile";
import { Calculator } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="dashboard-page">
      <header className="page-header">
        <h1>Tableau de bord</h1>
        <p className="subtitle">Sélectionnez un outil pour commencer.</p>
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
    </div>
  );
}
