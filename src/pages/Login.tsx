import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Link, Navigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [showSubscriptionGuidance, setShowSubscriptionGuidance] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Bloquer les doubles clics strictement
    
    setError("");
    setShowSubscriptionGuidance(false);
    setLoading(true);
    try {
      await signIn("google-otp", { email });
      setStep("otp");
    } catch {
      setShowSubscriptionGuidance(true);
      setError("Impossible d'envoyer le code pour le moment. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Bloquer les doubles clics

    const cleanOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError("Saisissez les 6 chiffres du code reçu par e-mail.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn("google-otp", { email, code: cleanOtp });
      // Ne pas utiliser navigate("/") ici ! On laisse le useEffect/render s'occuper de la redirection
    } catch {
      setError("Code incorrect ou expiré. Vérifiez le dernier code reçu ou demandez-en un nouveau.");
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

        {showSubscriptionGuidance && (
          <div className="not-member-notice">
            <p>Cet espace est réservé aux membres du comité de la section escalade.</p>
            <p>Pour adhérer ou suivre une demande d'abonnement, utilisez l'espace dédié.</p>
            <Link to="/abonnements" className="btn-primary">
              Aller à l'espace abonnement
            </Link>
          </div>
        )}

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
                Si cette adresse est autorisée, vous recevrez un code par e-mail.
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
