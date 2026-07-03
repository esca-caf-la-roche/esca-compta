import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { aboError } from "../lib/errors";

// Vue admin « Licences » : résolution des licences des demandes. La licence relie
// demandes / scrap / cours. Les correspondances exactes (nom/prénom, même inversé)
// sont résolues automatiquement ; les autres sont arbitrées ici (candidats fuzzy
// classés par similarité, ou saisie manuelle). Portage de src/pages/admin-licences.js.

export default function Licences() {
  const personnes = useQuery(api.abo.licences.getLicencesAValider);
  const resoudre = useMutation(api.abo.licences.resoudreLicencesPersonnes);
  const importer = useAction(api.abo.licences.importerAnnuaireLicences);

  const [msgResoudre, setMsgResoudre] = useState<string | null>(null);
  const [msgImport, setMsgImport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lancerResolution() {
    setMsgResoudre("Résolution…");
    try {
      const n = await resoudre({});
      setMsgResoudre(`${n} personne(s) résolue(s).`);
    } catch (err) {
      setMsgResoudre(`Échec : ${aboError(err).message}`);
    }
  }

  async function lancerImport() {
    setBusy(true);
    setMsgImport("Téléchargement de l'annuaire…");
    try {
      const r = await importer({});
      setMsgImport(
        `Annuaire synchronisé : ${r.upsertees} licence(s) (sur ${r.recus} reçue(s)).`,
      );
    } catch (err) {
      setMsgImport(`Échec : ${aboError(err).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (personnes === undefined) {
    return <p>Chargement…</p>;
  }

  return (
    <div>
      <p style={{ color: "#6b7280", maxWidth: 640 }}>
        La licence relie les demandes au scrap et aux cours. Les correspondances
        exactes (nom/prénom, même inversé) sont résolues automatiquement.
        Ci-dessous, les personnes à <strong>arbitrer</strong> : choisissez le bon
        candidat de l'annuaire, ou saisissez une licence à la main.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", margin: "1rem 0" }}>
        <button onClick={lancerResolution} className="btn-secondary">
          ↻ Relancer la résolution automatique
        </button>
        {msgResoudre && <span style={{ fontSize: "0.85rem" }}>{msgResoudre}</span>}
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
        <button onClick={lancerImport} className="btn-secondary" disabled={busy}>
          ⬇ Synchroniser l'annuaire des licences
        </button>
        {msgImport && <span style={{ fontSize: "0.85rem" }}>{msgImport}</span>}
      </div>

      <p style={{ fontWeight: 600 }}>
        {personnes.length} personne{personnes.length > 1 ? "s" : ""} à valider
      </p>

      {personnes.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>
          Aucune personne à valider : toutes les licences sont résolues.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "1rem" }}>
          {personnes.map((p) => (
            <CartePersonne key={p.personne_id} personne={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

type PersonneAValider = NonNullable<
  ReturnType<typeof useQuery<typeof api.abo.licences.getLicencesAValider>>
>[number];

function CartePersonne({ personne }: { personne: PersonneAValider }) {
  const validerLicence = useMutation(api.abo.licences.validerLicence);
  const [manuel, setManuel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function associer(licence: string) {
    setMsg("Association…");
    try {
      await validerLicence({
        personneId: personne.personne_id as Id<"abo_personnes">,
        licence: licence.trim(),
      });
      // La personne résolue disparaît de la liste (query réactive).
    } catch (err) {
      setMsg(`Échec : ${aboError(err).message}`);
    }
  }

  const nom = `${personne.prenom} ${personne.nom}`.trim() || "—";

  return (
    <li
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "1rem",
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{nom}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.75rem" }}>
        {personne.candidats.length === 0 ? (
          <li style={{ color: "#9ca3af", fontStyle: "italic" }}>
            Aucun candidat proche dans l'annuaire.
          </li>
        ) : (
          personne.candidats.map((c) => {
            const cn = `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "—";
            return (
              <li
                key={c.licence}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.3rem 0",
                }}
              >
                <span>
                  {cn} — <code>{c.licence}</code>{" "}
                  <span style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                    {Math.round((c.score ?? 0) * 100)}%
                  </span>
                </span>
                <button
                  onClick={() => associer(c.licence)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Associer
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Saisir une licence (12 chiffres)"
          value={manuel}
          onChange={(e) => setManuel(e.target.value)}
        />
        <button
          onClick={() => associer(manuel)}
          style={{
            background: "none",
            border: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Associer cette licence
        </button>
      </div>
      {msg && (
        <p style={{ fontSize: "0.8rem", color: "#b91c1c", margin: "0.4rem 0 0" }}>
          {msg}
        </p>
      )}
    </li>
  );
}
