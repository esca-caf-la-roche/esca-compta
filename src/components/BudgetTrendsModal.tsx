import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSeason } from "../contexts/SeasonContext";
import { X, TrendingUp, TrendingDown, Minus, Filter } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BudgetTrendsModal({ isOpen, onClose }: Props) {
  const { season } = useSeason();
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(false);
  
  // Requête au serveur pour récupérer les tendances pré-calculées
  const serverTrends = useQuery(api.previsionnels.getTrends, { saison: season });

  const trends = useMemo(() => {
    if (!serverTrends) return [];
    
    let result = serverTrends;

    if (showOnlyCompleted) {
      result = result.filter(r => r.allRealized);
    }

    return result;
  }, [serverTrends, showOnlyCompleted]);

  if (!isOpen) return null;

  const totalReel = trends.reduce((acc, curr) => acc + curr.reel, 0);
  const totalPrev = trends.reduce((acc, curr) => acc + curr.prev, 0);
  const totalDiff = totalReel - totalPrev;

  const formatEuro = (val: number) => 
    val.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" style={{ maxWidth: "800px" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: "1rem" }}>
          <h2 className="modal-title">Tendances du Budget</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={24} />
          </button>
        </div>

        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#fdf6e3", padding: "0.75rem", border: "2px solid #000", boxShadow: "3px 3px 0px #000" }}>
          <Filter size={18} />
          <label style={{ fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input 
              type="checkbox" 
              checked={showOnlyCompleted} 
              onChange={e => setShowOnlyCompleted(e.target.checked)} 
              style={{ width: "1.2rem", height: "1.2rem" }}
            />
            Analyser uniquement les comptes Analytiques entièrement réalisés
          </label>
        </div>

        {serverTrends === undefined ? (
          <div className="loading" style={{ padding: "2rem", textAlign: "center" }}>Chargement des tendances...</div>
        ) : (
          <div style={{ marginTop: "1rem", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "500px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", color: "#666" }}>
                  <th style={{ padding: "0.75rem" }}>Analytique</th>
                  <th style={{ padding: "0.75rem", textAlign: "right" }}>Prévisionnel</th>
                  <th style={{ padding: "0.75rem", textAlign: "right" }}>Réalisé</th>
                  <th style={{ padding: "0.75rem", textAlign: "right" }}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {trends.map(t => {
                  const isPositive = t.diff > 0;
                  const isNegative = t.diff < 0;
                  const isZero = t.diff === 0;
                  
                  return (
                    <tr key={t.analytiqueNom} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "0.75rem", fontWeight: "bold" }}>{t.analytiqueNom}</td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>{formatEuro(t.prev)}</td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>{formatEuro(t.reel)}</td>
                      <td style={{ 
                        padding: "0.75rem", 
                        textAlign: "right",
                        color: isPositive ? "var(--success)" : isNegative ? "var(--danger)" : "inherit",
                        fontWeight: "bold",
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: "0.5rem"
                      }}>
                        {isPositive ? <TrendingUp size={16} /> : isNegative ? <TrendingDown size={16} /> : <Minus size={16} />}
                        {(t.diff > 0 ? "+" : "") + formatEuro(t.diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f9f9f9", fontWeight: "bold", borderTop: "2px solid #ccc" }}>
                  <td style={{ padding: "1rem 0.75rem" }}>TOTAL</td>
                  <td style={{ padding: "1rem 0.75rem", textAlign: "right" }}>{formatEuro(totalPrev)}</td>
                  <td style={{ padding: "1rem 0.75rem", textAlign: "right" }}>{formatEuro(totalReel)}</td>
                  <td style={{ 
                    padding: "1rem 0.75rem", 
                    textAlign: "right",
                    color: totalDiff > 0 ? "var(--success)" : totalDiff < 0 ? "var(--danger)" : "inherit"
                  }}>
                    {(totalDiff > 0 ? "+" : "") + formatEuro(totalDiff)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: "2rem" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
