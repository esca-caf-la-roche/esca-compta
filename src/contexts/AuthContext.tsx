import { createContext, useContext, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AuthContextType {
  userId: Id<"users"> | null;
  login: (id: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<Id<"users"> | null>(() => {
    const stored = localStorage.getItem("escalade_user_id");
    return stored ? (stored as Id<"users">) : null;
  });

  // Optionnel: Vérifier que l'utilisateur existe toujours dans Convex
  const user = useQuery(api.auth.getUser, userId ? { userId } : "skip");

  const login = (id: string) => {
    setUserId(id as Id<"users">);
    localStorage.setItem("escalade_user_id", id);
  };

  const logout = () => {
    setUserId(null);
    localStorage.removeItem("escalade_user_id");
  };

  return (
    <AuthContext.Provider
      value={{
        userId,
        login,
        logout,
        isAuthenticated: !!userId,
        isLoading: userId !== null && user === undefined,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
