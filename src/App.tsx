import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SeasonProvider } from "./contexts/SeasonContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Compta from "./pages/Compta";

// Composant temporaire pour les routes non implémentées
const Placeholder = ({ title }: { title: string }) => (
  <div className="p-8 text-center">
    <h2 className="text-2xl font-bold mb-4">{title}</h2>
    <p>Ce module est en cours de développement.</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <SeasonProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Routes protégées */}
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/compta" element={<Compta />} />
              <Route path="/adherents" element={<Placeholder title="Module Adhérents" />} />
              <Route path="/evenements" element={<Placeholder title="Module Événements" />} />
              <Route path="/statistiques" element={<Placeholder title="Module Statistiques" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SeasonProvider>
    </AuthProvider>
  );
}

export default App;
