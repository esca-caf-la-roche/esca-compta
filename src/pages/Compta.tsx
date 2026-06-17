import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSeason } from "../contexts/SeasonContext";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function Compta() {
  const { season } = useSeason();
  // On pourrait passer la saison en argument de la requête si Convex le gère.
  const transactions = useQuery(api.transactions.get);

  return (
    <div className="compta-page fade-in">
      <header className="page-header flex-header">
        <div>
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Retour au tableau de bord
          </Link>
          <h1>Comptabilité</h1>
          <p className="subtitle">Saison : {season}</p>
        </div>
      </header>

      <section className="card glass-card mt-6">
        <h2>Journal des transactions</h2>
        
        {transactions === undefined ? (
          <div className="loading">Chargement des données depuis Convex...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <p>Aucune transaction trouvée.</p>
            <p className="hint">Les données s'afficheront ici en temps réel.</p>
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
    </div>
  );
}
