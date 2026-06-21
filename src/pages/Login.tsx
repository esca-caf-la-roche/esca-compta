import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Navigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuthActions();
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Bloquer les doubles clics strictement
    
    setError("");
    setLoading(true);
    try {
      const isAllowed = await convex.query(api.users.checkEmailExists, { email });
      if (!isAllowed) {
        throw new Error("Cet email n'est pas autorisé. Veuillez contacter un administrateur.");
      }
      await signIn("google-otp", { email });
      setStep("otp");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erreur lors de l'envoi de l'OTP.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Bloquer les doubles clics

    const cleanOtp = otp.trim();
    setError("");
    setLoading(true);
    try {
      await signIn("google-otp", { email, code: cleanOtp });
      // Ne pas utiliser navigate("/") ici ! On laisse le useEffect/render s'occuper de la redirection
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "OTP incorrect.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Club Escalade</h1>
        <p className="subtitle">Portail de gestion</p>

        {error && <div className="error-message">{error}</div>}

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="form-group">
              <label>Email de connexion</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="input-field"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Envoi..." : "Recevoir le code OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOTPSubmit}>
            <div className="form-group">
              <label>Code OTP (6 chiffres)</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="input-field text-center font-mono text-xl tracking-widest"
              />
              <p className="text-sm mt-2 text-gray-500">
                L'email a été envoyé (vérifiez la console en dev).
              </p>
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Vérification..." : "Se connecter"}
            </button>
            <button
              type="button"
              className="btn-text mt-4"
              onClick={() => setStep("email")}
            >
              Changer d'email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
