import { HashRouter, Routes, Route } from "react-router-dom";
import { SeasonProvider } from "./contexts/SeasonContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Compta from "./pages/Compta";
import Previsionnel from "./pages/Previsionnel";
import Configurations from "./pages/Configurations";
import PaiementsLayout from "./pages/Paiements/Layout";
import ValidationPaiements from "./pages/Paiements/Validation";
import ConfigPaiements from "./pages/Paiements/Configurations";
import ApprobationsPaiements from "./pages/Paiements/Approbations";
import AttentePaiements from "./pages/Paiements/Attente";

// Composant temporaire pour les routes non implémentées
const Placeholder = ({ title }: { title: string }) => (
  <div className="p-8 text-center">
    <h2 className="text-2xl font-bold mb-4">{title}</h2>
    <p>Ce module est en cours de développement.</p>
  </div>
);

function App() {
  return (
    <SeasonProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Routes protégées */}
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/compta" element={<Compta />} />
              <Route path="/compta/previsionnel" element={<Previsionnel />} />
              <Route path="/configurations" element={<Configurations />} />
              
              {/* Routes Paiements */}
              <Route path="/paiements" element={<PaiementsLayout />}>
                <Route index element={<ValidationPaiements />} />
                <Route path="config" element={<ConfigPaiements />} />
                <Route path="approbations" element={<ApprobationsPaiements />} />
                <Route path="attente" element={<AttentePaiements />} />
              </Route>

              <Route path="/adherents" element={<Placeholder title="Module Adhérents" />} />
              <Route path="/evenements" element={<Placeholder title="Module Événements" />} />
              <Route path="/statistiques" element={<Placeholder title="Module Statistiques" />} />
            </Route>
          </Routes>
        </HashRouter>
    </SeasonProvider>
  );
}

export default App;
