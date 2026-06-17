import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function App() {
  // Cette ligne va requêter les transactions via Convex en temps réel
  // Elle peut provoquer une erreur TypeScript tant que "npx convex dev" n'a pas été lancé.
  const transactions = useQuery(api.transactions.get);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Dashboard Comptabilité</h1>
        <p className="subtitle">Saison 2025-26</p>
      </header>

      <main className="main-content">
        <section className="card">
          <h2>Journal des transactions</h2>
          
          {transactions === undefined ? (
            <div className="loading">Chargement des données depuis Convex...</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <p>Aucune transaction trouvée.</p>
              <p className="hint">Une fois connecté à Convex, vos données s'afficheront ici en temps réel.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Nom</th>
                    <th>Type</th>
                    <th className="align-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t._id}>
                      <td>{t.date}</td>
                      <td>{t.nom}</td>
                      <td>
                        <span className={`badge ${t.typeDocument.toLowerCase().replace(/ /g, '-')}`}>
                          {t.typeDocument}
                        </span>
                      </td>
                      <td className="align-right font-mono">
                        {t.realise.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
