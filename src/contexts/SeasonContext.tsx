import { createContext, useContext, useState, useEffect } from "react";

interface SeasonContextType {
  season: string;
  setSeason: (season: string) => void;
  availableSeasons: string[];
}

const defaultSeason = "2025-26";

const SeasonContext = createContext<SeasonContextType | undefined>(undefined);

export const SeasonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [season, setSeasonState] = useState<string>(() => {
    return localStorage.getItem("escalade_season") || defaultSeason;
  });

  const availableSeasons = ["2023-24", "2024-25", "2025-26", "2026-27"];

  const setSeason = (newSeason: string) => {
    setSeasonState(newSeason);
    localStorage.setItem("escalade_season", newSeason);
  };

  useEffect(() => {
    localStorage.setItem("escalade_season", season);
  }, [season]);

  return (
    <SeasonContext.Provider value={{ season, setSeason, availableSeasons }}>
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
