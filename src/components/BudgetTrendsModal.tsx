import { useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown, Minus, Filter } from "lucide-react";

type Transaction = {
  realise: number;
  analytiqueNom?: string;
};

type Previsionnel = {
  montant: number;
  analytiqueNom?: string;
  etat: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[] | undefined;
  previsionnels: Previsionnel[] | undefined;
};

export default function BudgetTrendsModal({ isOpen, onClose, transactions, previsionnels }: Props) {
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(false);

  const trends = useMemo(() => {
    if (!transactions || !previsionnels) return [];

    const statsByAna: Record<string, { reel: number; prev: number; allRealized: boolean; hasPrev: boolean }> = {};

    // Agréger les prévisionnels
    previsionnels.forEach(p => {
      const anaName = p.analytiqueNom || "Inconnu";
      if (!statsByAna[anaName]) statsByAna[anaName] = { reel: 0, prev: 0, allRealized: true, hasPrev: false };
      statsByAna[anaName].prev += p.montant;
      statsByAna[anaName].hasPrev = true;
      if (!p.etat) {
        statsByAna[anaName].allRealized = false;
      }
    });

    // Agréger les transactions réelles
    transactions.forEach(t => {
      const anaName = t.analytiqueNom || "Inconnu";
      // S'il n'y a pas de prévisionnel pour cet analytique, on le marque par défaut comme non "terminé" par rapport au prévisionnel ?
      // Le besoin : "si toutes les lignes de previsionnel d'un analytique identique comparer le reel previsionnel".
      // S'il n'y a aucun prévisionnel, on peut le cacher si on filtre par "terminés".
      if (!statsByAna[anaName]) statsByAna[anaName] = { reel: 0, prev: 0, allRealized: false, hasPrev: false };
      statsByAna[anaName].reel += t.realise;
    });

    // Calculer les écarts
    let result = Object.entries(statsByAna).map(([anaName, stats]) => {
      const diff = stats.reel - stats.prev;
      return {
        analytiqueNom: anaName,
        reel: stats.reel,
        prev: stats.prev,
        diff,
        allRealized: stats.hasPrev && stats.allRealized,
      };
    });

    if (showOnlyCompleted) {
      result = result.filter(r => r.allRealized);
    }

    // Trier par nom analytique
    return result.sort((a, b) => a.analytiqueNom.localeCompare(b.analytiqueNom));
  }, [transactions, previsionnels, showOnlyCompleted]);

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

        <div className="form-actions" style={{ marginTop: "2rem" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
