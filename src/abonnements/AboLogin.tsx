import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

// Connexion OTP des abonnés PUBLICS (provider abo-otp, auto-inscription).
// Aucune mention de l'outil compta : espace autonome du club.
export default function AboLogin() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await signIn("abo-otp", { email: email.trim() });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi du code.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await signIn("abo-otp", { email: email.trim(), code: otp.trim() });
      // La bascule d'écran est gérée par l'état d'auth (AboApp).
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="abo-login">
      <div className="abo-card">
        <h1>Abonnements Escalade</h1>
        <p className="abo-subtitle">CAF La Roche-Bonneville — créneaux autonomes</p>

        {error && <div className="abo-msg abo-msg-error">{error}</div>}

        {step === "email" ? (
          <form onSubmit={handleEmail}>
            <label htmlFor="abo-email">Votre email</label>
            <input
              id="abo-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.fr"
            />
            <p className="abo-hint">Vous recevrez un code à 6 chiffres pour vous connecter.</p>
            <button type="submit" disabled={loading} className="abo-btn">
              {loading ? "Envoi…" : "Recevoir le code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <label htmlFor="abo-otp">Code à 6 chiffres</label>
            <input
              id="abo-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="abo-otp-input"
            />
            <p className="abo-hint">Un code a été envoyé à {email}.</p>
            <button type="submit" disabled={loading} className="abo-btn">
              {loading ? "Vérification…" : "Se connecter"}
            </button>
            <button type="button" className="abo-link" onClick={() => setStep("email")}>
              ← Changer d'email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
