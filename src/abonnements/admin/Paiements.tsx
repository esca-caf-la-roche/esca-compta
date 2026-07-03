import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { aboError } from "../lib/errors";

// Vue admin « Paiements » : cache HelloAsso du formulaire abonnements. Cards avec
// statut interne (boutons), commentaire (Remboursé / En attente), timeline des
// remboursements et détection d'un problème de remboursement (divergence statut
// interne ↔ HelloAsso). Portage de admin-paiements.js. Le statut interne est un
// suivi ; il n'affecte pas les étapes (le paiement « officiel » vient du scrap).

type Reponse = NonNullable<ReturnType<typeof useQuery<typeof api.abo.paiements.getPaiementsAbo>>>;
type Paiement = Reponse["paiements"][number];

const STATUTS: Record<string, string> = {
  a_traiter: "À traiter",
  traite: "Traité",
  rembourse: "Remboursé",
  en_attente: "En attente",
};
const AVEC_COMMENTAIRE = new Set(["rembourse", "en_attente"]);
const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const dateHeureFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
const majNom = (s: string | null) => (s ?? "").toUpperCase();
const capPrenom = (s: string | null) =>
  (s ?? "").toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase());

function messageProbleme(p: Paiement): string {
  if (!p.besoin_action_remboursement) return "";
  return p.statut_local === "rembourse"
    ? "⚠ Marqué « Remboursé » mais aucun remboursement HelloAsso"
    : "⚠ Remboursé sur HelloAsso mais pas marqué « Remboursé » ici";
}

export default function Paiements() {
  const reponse = useQuery(api.abo.paiements.getPaiementsAbo);
  const setStatut = useMutation(api.abo.paiements.setStatutPaiementAbo);
  const enregistrerLien = useMutation(api.abo.paiements.enregistrerLienAbo);
  const synchroniser = useAction(api.abo.paiements.synchroniserPaiementsAbo);

  const [statut, setStatutFiltre] = useState("a_traiter");
  const [q, setQ] = useState("");
  const [problemes, setProblemes] = useState(false);
  const [sync, setSync] = useState<string | null>(null);

  const paiements = reponse?.paiements ?? [];
  const nbProblemes = paiements.filter((p) => p.besoin_action_remboursement).length;

  const filtres = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return paiements.filter((p) => {
      if (problemes && !p.besoin_action_remboursement) return false;
      if (statut !== "tous" && p.statut_local !== statut) return false;
      if (!texte) return true;
      const foin = [
        p.inscrit_prenom, p.inscrit_nom, p.inscrit_email,
        p.payeur_prenom, p.payeur_nom, p.payeur_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return foin.includes(texte);
    });
  }, [paiements, statut, q, problemes]);

  async function lancerSync() {
    setSync("Synchronisation…");
    try {
      const r = await synchroniser({});
      setSync(
        r.errors.length
          ? `Terminé avec ${r.errors.length} erreur(s) : ${r.errors[0]}`
          : `✓ ${r.synced_count} transaction(s) synchronisée(s).`,
      );
    } catch (err) {
      setSync(`Échec : ${aboError(err).message}`);
    }
  }

  if (reponse === undefined) return <p>Chargement…</p>;
  if (!reponse.configured) {
    return <ConfigLien enregistrer={enregistrerLien} />;
  }

  const compter = (s: string) => paiements.filter((p) => p.statut_local === s).length;

  return (
    <div>
      <p style={{ color: "#6b7280", maxWidth: 680 }}>
        Cache du formulaire HelloAsso abonnements. Le statut interne est votre suivi
        d'arbitrage ; il n'affecte pas les étapes (le paiement « officiel » vient du
        scrap).
      </p>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary" onClick={lancerSync}>
          🔄 Synchroniser maintenant
        </button>
        {sync && <span style={{ fontSize: "0.85rem" }}>{sync}</span>}
      </div>

      {nbProblemes > 0 && (
        <p style={{ color: "#b45309", fontWeight: 700, marginTop: "0.75rem" }}>
          ⚠ {nbProblemes} problème(s) de remboursement à vérifier
        </p>
      )}

      <section
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          margin: "1rem 0",
        }}
      >
        {[["Total", paiements.length] as const, ...Object.entries(STATUTS).map(
          ([v, l]) => [l, compter(v)] as const,
        )].map(([label, n], i) => (
          <div
            key={label}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "0.4rem 0.75rem",
              background: i === 0 ? "#111" : "#fff",
              color: i === 0 ? "#fff" : "#111",
              minWidth: 72,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{n}</div>
            <div style={{ fontSize: "0.75rem" }}>{label}</div>
          </div>
        ))}
      </section>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Statut{" "}
          <select value={statut} onChange={(e) => setStatutFiltre(e.target.value)}>
            <option value="tous">Tous</option>
            {Object.entries(STATUTS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Recherche{" "}
          <input
            type="search"
            placeholder="Nom ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <input type="checkbox" checked={problemes} onChange={(e) => setProblemes(e.target.checked)} />
          ⚠ Problèmes uniquement
        </label>
      </div>

      <p style={{ color: "#6b7280", margin: "0.75rem 0" }}>
        {filtres.length} paiement{filtres.length > 1 ? "s" : ""}
      </p>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        }}
      >
        {filtres.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>Aucun paiement ne correspond.</p>
        ) : (
          filtres.map((p) => (
            <Card key={p.id} p={p} adminUrl={reponse.adminUrl} setStatut={setStatut} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Carte d'un paiement ──────────────────────────────────────────────
function Card({
  p,
  adminUrl,
  setStatut,
}: {
  p: Paiement;
  adminUrl: string | null;
  setStatut: ReturnType<typeof useMutation<typeof api.abo.paiements.setStatutPaiementAbo>>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [comment, setComment] = useState(p.commentaire ?? "");
  const [copie, setCopie] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inscrit = `${majNom(p.inscrit_nom)} ${capPrenom(p.inscrit_prenom)}`.trim() || "—";
  const payeur = `${majNom(p.payeur_nom)} ${capPrenom(p.payeur_prenom)}`.trim();
  const payeurDiff = payeur && payeur.toLowerCase() !== inscrit.toLowerCase();
  const probleme = messageProbleme(p);

  async function enregistrer(s: string, c: string | undefined) {
    setErr(null);
    try {
      await setStatut({
        dossierId: p.id as Id<"dossiers">,
        statut: s as "a_traiter" | "traite" | "rembourse" | "en_attente",
        commentaire: c,
      });
      setPending(null);
    } catch (e) {
      setErr(aboError(e).message);
    }
  }

  function onStatut(s: string) {
    if (s === p.statut_local) return;
    if (AVEC_COMMENTAIRE.has(s)) {
      setComment(p.commentaire ?? "");
      setPending(s);
    } else {
      void enregistrer(s, undefined); // statut sans commentaire → on l'efface
    }
  }

  async function rembourser() {
    const email = p.payeur_email || p.inscrit_email || "";
    if (email) {
      try {
        await navigator.clipboard.writeText(email);
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
      } catch {
        /* presse-papier indisponible : le lien s'ouvre quand même */
      }
    }
    if (adminUrl) window.open(adminUrl, "_blank", "noopener,noreferrer");
  }

  const lien: React.CSSProperties = { color: "#2563eb", fontWeight: 600, fontSize: "0.85rem" };

  return (
    <article
      style={{
        border: `1px solid ${p.besoin_action_remboursement ? "#f59e0b" : "#e5e7eb"}`,
        borderRadius: 8,
        padding: "0.85rem",
        background: p.besoin_action_remboursement ? "#fffbeb" : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong>{inscrit}</strong>
        <span style={{ fontWeight: 800 }}>{euros.format(p.montant ?? 0)}</span>
      </div>
      <div style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.35rem 0" }}>
        Payé le {dateHeureFr(p.date_paiement)} · {p.statut_helloasso ?? "—"}
        {p.ha_rembourse && (
          <span
            style={{
              marginLeft: "0.4rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              padding: "0.05rem 0.4rem",
              borderRadius: 999,
              background: "#dc262622",
              color: "#dc2626",
            }}
          >
            Remboursé HA
          </span>
        )}
        {p.payeur_email && <div>✉ {p.payeur_email}</div>}
        {payeurDiff && <div>Payeur : {payeur}</div>}
      </div>

      {p.remboursements.map((r, i) => (
        <div key={i} style={{ fontSize: "0.8rem", color: "#b45309" }}>
          ↩ Remboursé {euros.format(r.montant)} le {dateHeureFr(r.date)}
        </div>
      ))}
      {probleme && (
        <p style={{ color: "#b45309", fontWeight: 600, fontSize: "0.82rem", margin: "0.4rem 0" }}>
          {probleme}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        {p.recu_url && (
          <a href={p.recu_url} target="_blank" rel="noopener noreferrer" style={lien}>
            📄 Reçu
          </a>
        )}
        {p.attestation_url && (
          <a href={p.attestation_url} target="_blank" rel="noopener noreferrer" style={lien}>
            🧾 Reçu fiscal
          </a>
        )}
        {adminUrl && (
          <button
            type="button"
            onClick={rembourser}
            style={{ ...lien, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            ↩ Rembourser
          </button>
        )}
        {copie && <span style={{ fontSize: "0.8rem", color: "#16a34a" }}>✓ Email copié</span>}
      </div>

      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {Object.entries(STATUTS).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onStatut(v)}
            style={{
              fontSize: "0.75rem",
              padding: "0.25rem 0.5rem",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              cursor: "pointer",
              background: p.statut_local === v ? "#111" : "#fff",
              color: p.statut_local === v ? "#fff" : "#374151",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {pending && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Commentaire…"
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button type="button" onClick={() => enregistrer(pending, comment.trim() || undefined)}>
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {err && <p style={{ color: "#b91c1c", fontSize: "0.75rem", margin: "0.35rem 0 0" }}>Échec : {err}</p>}
      {!pending && p.commentaire && (
        <p style={{ fontSize: "0.82rem", margin: "0.4rem 0 0" }}>💬 {p.commentaire}</p>
      )}
      {p.suivi_updater_email && (
        <p style={{ fontSize: "0.72rem", color: "#9ca3af", margin: "0.25rem 0 0" }}>
          Statué par {p.suivi_updater_email}
          {p.suivi_updated_at ? ` le ${dateHeureFr(p.suivi_updated_at)}` : ""}
        </p>
      )}
    </article>
  );
}

// ── Configuration du lien (quand aucun formulaire n'est encore branché) ──
function ConfigLien({
  enregistrer,
}: {
  enregistrer: ReturnType<typeof useMutation<typeof api.abo.paiements.enregistrerLienAbo>>;
}) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function valider() {
    setMsg("Enregistrement…");
    try {
      await enregistrer({ url: url.trim() });
      setMsg("✓ Lien enregistré. Lancez une synchronisation pour importer les paiements.");
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: "#6b7280" }}>
        Aucun formulaire HelloAsso n'est encore configuré pour les abonnements.
        Collez le lien public du formulaire de paiement des abonnements :
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="url"
          placeholder="https://www.helloasso.com/associations/…/paiements/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: "1 1 320px", padding: "0.4rem" }}
        />
        <button type="button" className="btn-secondary" onClick={valider} disabled={!url.trim()}>
          Enregistrer
        </button>
      </div>
      {msg && <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>{msg}</p>}
    </div>
  );
}
