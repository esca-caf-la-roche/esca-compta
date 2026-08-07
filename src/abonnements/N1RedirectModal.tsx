import { useEffect, useRef } from "react";

function urlHttpsValide(valeur: string | null | undefined): valeur is string {
  if (!valeur) return false;
  try {
    const url = new URL(valeur);
    const hote = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hote === "caflarochebonneville.fr" ||
      hote.endsWith(".caflarochebonneville.fr")
    );
  } catch {
    return false;
  }
}

export default function N1RedirectModal({
  message,
  inscriptionUrl,
  onClose,
}: {
  message?: string;
  inscriptionUrl?: string | null;
  onClose: () => void;
}) {
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const lienDisponible = urlHttpsValide(inscriptionUrl);

  useEffect(() => {
    boutonFermer.current?.focus();
    const fermerAvecEchap = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fermerAvecEchap);
    return () => window.removeEventListener("keydown", fermerAvecEchap);
  }, [onClose]);

  return (
    <div className="abo-admin-modal-backdrop" role="presentation">
      <section
        className="abo-admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="n1-redirect-title"
        aria-describedby="n1-redirect-description"
      >
        <div className="abo-admin-modal-header">
          <h2 id="n1-redirect-title">Réinscription N-1</h2>
          <button ref={boutonFermer} type="button" onClick={onClose} className="abo-admin-modal-close" aria-label="Fermer">×</button>
        </div>
        <p id="n1-redirect-description">{message ?? "Cette personne était déjà inscrite l’année dernière. Inscrivez-vous directement sur le site du club."}</p>
        <p className="abo-admin-toolbar">
          {lienDisponible && (
            <a className="abo-btn" href={inscriptionUrl} target="_blank" rel="noopener noreferrer">
              Ouvrir le site du club
            </a>
          )}
          <button type="button" className="abo-link" onClick={onClose}>Retour au formulaire</button>
        </p>
      </section>
    </div>
  );
}
