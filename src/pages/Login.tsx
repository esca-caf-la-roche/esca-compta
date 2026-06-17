import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOTP = useMutation(api.auth.sendOTP);
  const verifyOTP = useMutation(api.auth.verifyOTP);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendOTP({ email });
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi de l'OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verifyOTP({ email, code: otp });
      login(result.token);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "OTP incorrect.");
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
                Regardez dans la console Convex pour le code de test.
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
