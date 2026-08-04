import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Link, Navigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [showStaffOnlyNotice, setShowStaffOnlyNotice] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setShowStaffOnlyNotice(false);
    setLoading(true);
    try {
      await signIn("google-otp", { email });
      setStep("otp");
    } catch {
      // The staff OTP endpoint deliberately keeps the email eligibility private.
      // Present a single useful next step instead of a misleading technical error.
      setShowStaffOnlyNotice(true);
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const cleanOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError("Saisissez les 6 chiffres du code reçu par e-mail.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn("google-otp", { email, code: cleanOtp });
    } catch {
      setError("Code incorrect ou expiré. Vérifiez le dernier code reçu ou demandez-en un nouveau.");
    } finally {
      setLoading(false);
    }
  };

  const resetEmailStep = () => {
    setEmail("");
    setError("");
    setShowStaffOnlyNotice(false);
    setStep("email");
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Club Escalade</h1>
        <p className="subtitle">Portail de gestion</p>

        {showStaffOnlyNotice ? (
          <section className="login-guidance" aria-labelledby="staff-only-title">
            <h2 id="staff-only-title">Accès réservé au comité</h2>
            <p>
              Ce portail est destiné aux membres du comité de la section escalade.
            </p>
            <p>
              Pour adhérer ou suivre une demande d&apos;abonnement, rendez-vous sur
              l&apos;espace dédié.
            </p>
            <Link to="/abonnements" className="btn-primary">
              Aller à l&apos;espace abonnement
            </Link>
            <button type="button" className="btn-text" onClick={resetEmailStep}>
              Essayer une autre adresse e-mail
            </button>
          </section>
        ) : step === "email" ? (
          <form onSubmit={handleEmailSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">Email de connexion</label>
              <input
                id="login-email"
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
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label htmlFor="login-otp">Code OTP (6 chiffres)</label>
              <input
                id="login-otp"
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
            <button type="button" className="btn-text mt-4" onClick={resetEmailStep}>
              Changer d&apos;adresse e-mail
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
