import { HashRouter, Routes, Route } from "react-router-dom";
import { SeasonProvider } from "./contexts/SeasonContext";
import Layout from "./components/Layout";
import RequireAccess from "./components/RequireAccess";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Compta from "./pages/Compta";
import MasseSalariale from "./pages/Budget/MasseSalariale";
import ParametresPaie from "./pages/Budget/ParametresPaie";
import Configurations from "./pages/Configurations";
import LicencesEnCours from "./pages/LicencesEnCours";
import ContactsCours from "./pages/ContactsCours";
import PaiementsLayout from "./pages/Paiements/Layout";
import ValidationPaiements from "./pages/Paiements/Validation";
import ConfigPaiements from "./pages/Paiements/Configurations";
import ApprobationsPaiements from "./pages/Paiements/Approbations";
import AttentePaiements from "./pages/Paiements/Attente";
import AboApp from "./abonnements/AboApp";
import AboAdmin from "./abonnements/admin/AboAdmin";
import Compteur from "./abonnements/Compteur";

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

            {/* Espace PUBLIC abonnés — isolé, hors du Layout compta.
                Les abonnés n'ont pas connaissance de l'outil de gestion. */}
            <Route path="/abonnements" element={<AboApp />} />

            {/* Compteur public ANONYME (iframe embarquable sur le site club) —
                hors Layout et hors auth ; ne renvoie que des nombres. */}
            <Route path="/compteur" element={<Compteur />} />

            {/* Routes protégées. Chaque module est gardé par RequireAccess :
                accès uniquement si la tuile est cochée (même pour un admin). */}
            <Route element={<Layout />}>
              {/* Gestion des abonnements (staff), atteinte par la tuile */}
              <Route path="/gestion-abonnements" element={<RequireAccess tile="abonnements"><AboAdmin /></RequireAccess>} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/compta" element={<RequireAccess tile="compta"><Compta /></RequireAccess>} />
              <Route path="/budget" element={<RequireAccess tile="budget"><MasseSalariale /></RequireAccess>} />
              <Route path="/budget/parametres" element={<RequireAccess tile="budget"><ParametresPaie /></RequireAccess>} />
              <Route path="/configurations" element={<RequireAccess admin><Configurations /></RequireAccess>} />
              <Route path="/licences-cours" element={<RequireAccess tile="licences_cours"><LicencesEnCours /></RequireAccess>} />
              <Route path="/contacts-cours" element={<RequireAccess tile="contacts_cours"><ContactsCours /></RequireAccess>} />

              {/* Routes Paiements */}
              <Route path="/paiements" element={<RequireAccess tile="paiements"><PaiementsLayout /></RequireAccess>}>
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
