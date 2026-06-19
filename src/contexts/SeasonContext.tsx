import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface SeasonContextType {
  season: string;
  setSeason: (season: string) => void;
  availableSeasons: string[];
}

const SeasonContext = createContext<SeasonContextType | undefined>(undefined);

export const SeasonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dbSaisons = useQuery(api.saisons.get);
  const availableSeasons = dbSaisons ? dbSaisons.map(s => s.nom) : ["2025-26"];

  const [season, setSeasonState] = useState<string>("");

  useEffect(() => {
    // Si la saison n'est pas encore définie et que les données Convex sont chargées
    if (!season && dbSaisons) {
      const stored = localStorage.getItem("escalade_season");
      if (stored && availableSeasons.includes(stored)) {
        setSeasonState(stored);
      } else {
        const defaultS = dbSaisons.find(s => s.isDefault);
        const fallback = defaultS ? defaultS.nom : (dbSaisons.length > 0 ? dbSaisons[0].nom : "2025-26");
        setSeasonState(fallback);
        localStorage.setItem("escalade_season", fallback);
      }
    }
  }, [season, dbSaisons, availableSeasons]);

  const setSeason = (newSeason: string) => {
    setSeasonState(newSeason);
    localStorage.setItem("escalade_season", newSeason);
  };

  return (
    <SeasonContext.Provider value={{ season: season || "2025-26", setSeason, availableSeasons }}>
      {children}
    </SeasonContext.Provider>
  );
};

export const useSeason = () => {
  const context = useContext(SeasonContext);
  if (context === undefined) {
    throw new Error("useSeason must be used within a SeasonProvider");
  }
  return context;
};
