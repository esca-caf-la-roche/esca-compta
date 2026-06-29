import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type LinkForm = {
  url: string;
  label: string;
  responsible_id: string;
  is_installment: boolean;
};

type GroupForm = {
  name: string;
  requires_approval: boolean;
  link_ids: string[];
};

const EMPTY_LINK: LinkForm = {
  url: "",
  label: "",
  responsible_id: "",
  is_installment: false,
};
const EMPTY_GROUP: GroupForm = {
  name: "",
  requires_approval: false,
  link_ids: [],
};

function truncate(url: string, max = 55) {
  return url.length <= max ? url : url.slice(0, max) + "…";
}

export default function ConfigPaiements() {
  const links = useQuery(api.paiements.getLinks);
  const groups = useQuery(api.paiements.getGroups);
  const responsibles = useQuery(api.paiements.getResponsibles);
  const settings = useQuery(api.users.getCurrentUserSettings);

  if (links === undefined || groups === undefined || responsibles === undefined) {
    return <div className="loading">Chargement…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div className="pay-header">
        <span className="pay-tag">Configuration</span>
        <h1>Liens &amp; Groupes</h1>
      </div>

      <LinksSection links={links} groups={groups} responsibles={responsibles} />
      <GroupsSection groups={groups} links={links} />

      {settings?.role === "admin" && <DangerZone />}
    </div>
  );
}

// ─── Liens ───────────────────────────────────────────────────────────────────

function LinksSection({
  links,
  groups,
  responsibles,
}: {
  links: any[];
  groups: any[];
  responsibles: { id: string; name: string }[];
}) {
  const addLink = useMutation(api.paiements.addLink);
  const updateLink = useMutation(api.paiements.updateLink);
  const deleteLink = useMutation(api.paiements.deleteLink);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LinkForm>(EMPTY_LINK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_LINK);
    setError(null);
    setShowForm(true);
  };
  const openEdit = (l: any) => {
    setEditId(l._id);
    setForm({
      url: l.url,
      label: l.label,
      responsible_id: l.responsible_id ?? "",
      is_installment: l.is_installment,
    });
    setError(null);
    setShowForm(true);
  };
  const cancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_LINK);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim() || !form.label.trim()) {
      setError("Le label et l'URL sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        url: form.url.trim(),
        label: form.label.trim(),
        is_installment: form.is_installment,
        responsible_id: form.responsible_id
          ? (form.responsible_id as Id<"users">)
          : undefined,
      };
      if (editId) {
        await updateLink({ id: editId as Id<"helloasso_links">, ...payload });
      } else {
        await addLink(payload);
      }
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: any) => {
    if (
      !window.confirm(
        `Supprimer le lien "${l.label}" ?\n\nAttention : les dossiers, transactions et statuts associés seront aussi supprimés.`
      )
    )
      return;
    try {
      await deleteLink({ id: l._id });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const sorted = [...links].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section className="pay-section">
      <div className="pay-section-head">
        <h2>
          Liens HelloAsso <span className="count">({links.length})</span>
        </h2>
        {!showForm && (
          <button className="pay-btn pay-btn-accent" onClick={openAdd}>
            + Ajouter
          </button>
        )}
      </div>
      <div className="pay-section-body">
        {sorted.length === 0 && !showForm && (
          <p className="pay-muted">Aucun lien configuré.</p>
        )}

        {sorted.map((link) => {
          const respName = responsibles.find(
            (r) => r.id === link.responsible_id
          )?.name;
          const linkGroups = groups.filter((g) =>
            g.link_ids?.includes(link._id)
          );
          return (
            <div className="pay-row" key={link._id}>
              <div style={{ minWidth: 0 }}>
                <div className="pay-dossier-line">
                  <span className="pay-dossier-name">{link.label}</span>
                  <span
                    className={`pay-badge ${link.is_installment ? "pay-badge-3x" : "pay-badge-1x"}`}
                  >
                    {link.is_installment ? "Échéance 3x" : "Principal"}
                  </span>
                  {respName && (
                    <span style={{ fontSize: "0.78rem", color: "#777" }}>
                      👤 {respName}
                    </span>
                  )}
                  {linkGroups.map((g) => (
                    <span
                      key={g._id}
                      className="pay-badge"
                      style={{ background: g.requires_approval ? "#dbeef6" : "#f0f0f0" }}
                      title={g.requires_approval ? `Groupe (approbation) : ${g.name}` : `Groupe : ${g.name}`}
                    >
                      📁 {g.name}
                    </span>
                  ))}
                </div>
                <p
                  style={{
                    marginTop: "0.25rem",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    color: "#999",
                  }}
                  title={link.url}
                >
                  {truncate(link.url)}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                <button className="pay-btn pay-btn-sm" onClick={() => openEdit(link)}>
                  ✎
                </button>
                <button
                  className="pay-btn pay-btn-sm pay-btn-danger"
                  onClick={() => remove(link)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {showForm && (
          <form className="pay-form" onSubmit={submit}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#777",
              }}
            >
              {editId ? "Modifier le lien" : "Nouveau lien"}
            </p>
            <div className="pay-field">
              <label>Label</label>
              <input
                className="pay-input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder='ex: "Tarif 280€" ou "Échéance 2/3"'
              />
            </div>
            <div className="pay-field">
              <label>URL HelloAsso</label>
              <input
                className="pay-input"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://www.helloasso.com/associations/..."
              />
            </div>
            <div className="pay-field">
              <label>Responsable</label>
              <select
                className="pay-select"
                value={form.responsible_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, responsible_id: e.target.value }))
                }
              >
                <option value="">— Aucun responsable —</option>
                {responsibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pay-field">
              <label>Type</label>
              <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                <label className="pay-check">
                  <input
                    type="radio"
                    checked={!form.is_installment}
                    onChange={() =>
                      setForm((f) => ({ ...f, is_installment: false }))
                    }
                  />
                  Lien principal
                </label>
                <label className="pay-check">
                  <input
                    type="radio"
                    checked={form.is_installment}
                    onChange={() =>
                      setForm((f) => ({ ...f, is_installment: true }))
                    }
                  />
                  Échéance 3x
                </label>
              </div>
            </div>
            {error && <p className="pay-error">{error}</p>}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button className="pay-btn pay-btn-dark" type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="pay-btn" type="button" onClick={cancel} disabled={saving}>
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// ─── Groupes ───────────────────────────────────────────────────────────────

function GroupsSection({ groups, links }: { groups: any[]; links: any[] }) {
  const addGroup = useMutation(api.paiements.addGroup);
  const updateGroup = useMutation(api.paiements.updateGroup);
  const deleteGroup = useMutation(api.paiements.deleteGroup);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(EMPTY_GROUP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_GROUP);
    setError(null);
    setShowForm(true);
  };
  const openEdit = (g: any) => {
    setEditId(g._id);
    setForm({
      name: g.name,
      requires_approval: g.requires_approval,
      link_ids: g.link_ids ?? [],
    });
    setError(null);
    setShowForm(true);
  };
  const cancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_GROUP);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du groupe est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const link_ids = form.link_ids as Id<"helloasso_links">[];
      if (editId) {
        await updateGroup({
          id: editId as Id<"groups">,
          name: form.name.trim(),
          requires_approval: form.requires_approval,
          link_ids,
        });
      } else {
        await addGroup({
          name: form.name.trim(),
          requires_approval: form.requires_approval,
          link_ids,
        });
      }
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: any) => {
    if (!window.confirm(`Supprimer le groupe "${g.name}" ?`)) return;
    try {
      await deleteGroup({ id: g._id });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="pay-section">
      <div className="pay-section-head">
        <h2>
          Groupes <span className="count">({groups.length})</span>
        </h2>
        {!showForm && (
          <button className="pay-btn pay-btn-accent" onClick={openAdd}>
            + Ajouter
          </button>
        )}
      </div>
      <div className="pay-section-body">
        {sorted.length === 0 && !showForm && (
          <p className="pay-muted">Aucun groupe configuré.</p>
        )}

        {sorted.map((group) => {
          const groupLinks = links.filter((l) =>
            group.link_ids?.includes(l._id)
          );
          return (
            <div className="pay-row" key={group._id}>
              <div style={{ minWidth: 0 }}>
                <div className="pay-dossier-line">
                  <span className="pay-dossier-name">{group.name}</span>
                  {group.requires_approval && (
                    <span className="pay-badge pay-badge-approved">
                      Appro. moniteur
                    </span>
                  )}
                </div>
                {groupLinks.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                    }}
                  >
                    {groupLinks.map((l) => (
                      <span key={l._id} className="pay-badge" style={{ background: "#f0f0f0" }}>
                        {l.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                <button className="pay-btn pay-btn-sm" onClick={() => openEdit(group)}>
                  ✎
                </button>
                <button
                  className="pay-btn pay-btn-sm pay-btn-danger"
                  onClick={() => remove(group)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {showForm && (
          <form className="pay-form" onSubmit={submit}>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#777",
              }}
            >
              {editId ? "Modifier le groupe" : "Nouveau groupe"}
            </p>
            <div className="pay-field">
              <label>Nom du groupe</label>
              <input
                className="pay-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder='ex: "5-6 ans", "Primaires (débutants)"'
              />
            </div>
            <label className="pay-check">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requires_approval: e.target.checked }))
                }
              />
              Sous approbation du moniteur
            </label>
            <div className="pay-field">
              <label>Liens HelloAsso associés</label>
              {links.length === 0 ? (
                <p className="pay-muted" style={{ padding: 0 }}>
                  Ajoutez d'abord des liens HelloAsso.
                </p>
              ) : (
                <div className="pay-checklist">
                  {links.map((link) => (
                    <label key={link._id} className="pay-check">
                      <input
                        type="checkbox"
                        checked={form.link_ids.includes(link._id)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            link_ids: e.target.checked
                              ? [...f.link_ids, link._id]
                              : f.link_ids.filter((id) => id !== link._id),
                          }))
                        }
                      />
                      {link.label}
                      {link.is_installment && (
                        <span style={{ color: "#999", fontWeight: 400 }}> (3x)</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="pay-error">{error}</p>}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button className="pay-btn pay-btn-dark" type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="pay-btn" type="button" onClick={cancel} disabled={saving}>
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// ─── Zone dangereuse (reset saison) ──────────────────────────────────────────

function DangerZone() {
  const resetSeason = useMutation(api.paiements.resetSeason);

  const handleReset = async () => {
    const confirmation = window.prompt(
      'Tapez "RESET" pour réinitialiser la saison (supprime les dossiers et transactions ; les liens et groupes sont conservés).'
    );
    if (confirmation === "RESET") {
      try {
        await resetSeason({});
        alert("Saison réinitialisée.");
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <section
      className="pay-section"
      style={{ borderColor: "var(--danger)" }}
    >
      <div className="pay-section-head" style={{ background: "var(--danger)" }}>
        <h2>Zone dangereuse</h2>
      </div>
      <div className="pay-section-body" style={{ padding: "1.25rem" }}>
        <p style={{ fontSize: "0.85rem", color: "#555", marginBottom: "1rem" }}>
          Réinitialise les dossiers et l'historique des transactions. Les liens
          et les groupes sont conservés.
        </p>
        <button className="pay-btn pay-btn-danger" onClick={handleReset}>
          Réinitialiser la saison
        </button>
      </div>
    </section>
  );
}
