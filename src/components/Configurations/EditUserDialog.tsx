import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { TILE_OPTIONS, unknownTileIds } from "../../config/tiles";

type ListedUser = FunctionReturnType<typeof api.users.listUsers>[number];

interface EditUserDialogProps {
  user: ListedUser | null;
  onSave: (draft: {
    userId: ListedUser["_id"];
    name: string;
    role: string;
    allowedTiles: string[];
  }) => Promise<void>;
  onDismiss: () => void;
}

function errorMessage(error: unknown): string {
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Impossible d'enregistrer les modifications.";
}

export default function EditUserDialog({
  user,
  onSave,
  onDismiss,
}: EditUserDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [allowedTiles, setAllowedTiles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !user) return;

    setName(user.name || "");
    setRole(user.settings?.role || "user");
    setAllowedTiles(user.settings?.allowedTiles || []);
    setError("");
    setIsSaving(false);
    if (!dialog.open) dialog.showModal();
  }, [user]);

  const unknownTiles = unknownTileIds(allowedTiles);

  const toggleTile = (tileId: string) => {
    setAllowedTiles((current) =>
      current.includes(tileId)
        ? current.filter((id) => id !== tileId)
        : [...current, tileId],
    );
  };

  const setKnownTiles = (enabled: boolean) => {
    setAllowedTiles([
      ...unknownTiles,
      ...(enabled ? TILE_OPTIONS.map(({ id }) => id) : []),
    ]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Le nom est obligatoire.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await onSave({
        userId: user._id,
        name: trimmedName,
        role,
        allowedTiles,
      });
      dialogRef.current?.close();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setIsSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="user-edit-dialog"
      aria-labelledby="user-edit-title"
      onCancel={(event) => {
        if (isSaving) event.preventDefault();
      }}
      onClose={onDismiss}
    >
      {user && (
        <form className="user-edit-form" onSubmit={handleSubmit}>
          <header className="user-edit-header">
            <div>
              <span className="user-edit-kicker">
                <ShieldCheck aria-hidden="true" size={18} />
                Panneau d'accès
              </span>
              <h2 id="user-edit-title">Modifier l'utilisateur</h2>
            </div>
            <button
              type="button"
              className="user-dialog-close"
              aria-label={`Annuler la modification de ${user.name || user.email}`}
              disabled={isSaving}
              onClick={() => dialogRef.current?.close()}
            >
              <X aria-hidden="true" size={22} />
            </button>
          </header>

          <div className="user-edit-fields">
            <div>
              <label className="form-label" htmlFor="edit-user-email">
                Email
              </label>
              <input
                id="edit-user-email"
                className="input-field"
                type="email"
                value={user.email || ""}
                readOnly
              />
            </div>
            <div>
              <label className="form-label" htmlFor="edit-user-name">
                Nom
              </label>
              <input
                id="edit-user-name"
                className="input-field"
                type="text"
                value={name}
                disabled={isSaving}
                required
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="edit-user-role">
                Rôle
              </label>
              <select
                id="edit-user-role"
                className="input-field"
                value={role}
                disabled={isSaving}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
          </div>

          <p className="user-role-warning">
            Le rôle administrateur n'accorde pas automatiquement l'accès aux
            tuiles.
          </p>

          <fieldset className="user-permissions-fieldset" disabled={isSaving}>
            <legend>Accès aux modules</legend>
            <div className="user-permission-tools">
              <button
                type="button"
                className="user-tool-button"
                onClick={() => setKnownTiles(true)}
              >
                Tout autoriser
              </button>
              <button
                type="button"
                className="user-tool-button"
                onClick={() => setKnownTiles(false)}
              >
                Retirer les six modules
              </button>
            </div>
            <div className="user-permission-editor">
              {TILE_OPTIONS.map((tile, index) => {
                const checked = allowedTiles.includes(tile.id);
                return (
                  <label
                    className={`user-permission-option${checked ? " is-allowed" : ""}`}
                    key={tile.id}
                  >
                    <span className="user-permission-route" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTile(tile.id)}
                    />
                    <span>
                      <strong>{tile.label}</strong>
                      <small>{checked ? "Autorisé" : "Non autorisé"}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {unknownTiles.length > 0 && (
            <aside className="user-unknown-tiles">
              <strong>Accès inconnus conservés</strong>
              <p>
                Ces identifiants ne correspondent pas aux six modules actuels et
                seront conservés à l'enregistrement.
              </p>
              <ul>
                {unknownTiles.map((tileId) => (
                  <li key={tileId}>{tileId}</li>
                ))}
              </ul>
            </aside>
          )}

          {error && (
            <p className="user-edit-error" role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          <footer className="user-edit-actions">
            <button
              type="button"
              className="user-cancel-button"
              disabled={isSaving}
              onClick={() => dialogRef.current?.close()}
            >
              Annuler
            </button>
            <button type="submit" className="user-save-button" disabled={isSaving}>
              <Check aria-hidden="true" size={19} />
              {isSaving ? "Enregistrement…" : "Enregistrer les accès"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
