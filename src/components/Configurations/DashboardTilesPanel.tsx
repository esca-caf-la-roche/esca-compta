import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  resolveDashboardTiles,
  TILE_COLOR_OPTIONS,
  type DashboardTile,
  type DashboardTileInput,
  type TileColorClass,
  type TileId,
} from "../../config/tiles";

const defaultTiles = (): DashboardTile[] => resolveDashboardTiles();

function errorMessage(error: unknown): string {
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string" && data) return data;
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message
    ? message
    : "Impossible d’enregistrer la configuration.";
}

function DashboardTilesEditor({
  initialTiles,
}: {
  initialTiles: DashboardTile[];
}) {
  const saveConfiguration = useMutation(api.users.updateDashboardConfiguration);
  const [tiles, setTiles] = useState<DashboardTile[]>(initialTiles);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveTile = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= tiles.length) return;
    setTiles((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const updateTile = (
    id: TileId,
    changes: Partial<Pick<DashboardTile, "color" | "label" | "description">>,
  ) => {
    setTiles((current) =>
      current.map((tile) => (tile.id === id ? { ...tile, ...changes } : tile)),
    );
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await saveConfiguration({ tiles });
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="tab-content fade-in">
      <div className="card glass-card dashboard-tiles-panel">
        <h2>Tableau de bord</h2>
        <p className="dashboard-tiles-panel__intro">
          Définissez l’ordre, la couleur et les textes des tuiles du tableau de
          bord. Les accès de chaque utilisateur restent inchangés.
        </p>

        <div className="dashboard-tiles-panel__list">
          {tiles.map((tile, index) => (
            <article className="dashboard-tiles-panel__row" key={tile.id}>
              <span
                className={`dashboard-tiles-panel__preview ${tile.color}`}
                aria-hidden="true"
              />
              <div className="dashboard-tiles-panel__fields">
                <label>
                  <span>Nom de la tuile</span>
                  <input
                    className="input-field"
                    value={tile.label}
                    maxLength={80}
                    disabled={isSaving}
                    onChange={(event) =>
                      updateTile(tile.id, { label: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    className="input-field"
                    value={tile.description}
                    maxLength={240}
                    rows={2}
                    disabled={isSaving}
                    onChange={(event) =>
                      updateTile(tile.id, { description: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="dashboard-tiles-panel__controls">
                <label>
                  <span className="sr-only">Couleur de {tile.label}</span>
                  <select
                    className="input-field"
                    value={tile.color}
                    disabled={isSaving}
                    onChange={(event) =>
                      updateTile(tile.id, {
                        color: event.target.value as TileColorClass,
                      })
                    }
                  >
                    {TILE_COLOR_OPTIONS.map((color) => (
                      <option key={color.value} value={color.value}>
                        {color.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-icon"
                  title="Monter la tuile"
                  aria-label={`Monter ${tile.label}`}
                  disabled={isSaving || index === 0}
                  onClick={() => moveTile(index, -1)}
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Descendre la tuile"
                  aria-label={`Descendre ${tile.label}`}
                  disabled={isSaving || index === tiles.length - 1}
                  onClick={() => moveTile(index, 1)}
                >
                  <ArrowDown size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>

        {error && (
          <p className="dashboard-tiles-panel__error" role="alert">
            {error}
          </p>
        )}
        <div className="dashboard-tiles-panel__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setTiles(defaultTiles())}
            disabled={isSaving}
          >
            <RotateCcw size={16} /> Rétablir les valeurs par défaut
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTilesPanel() {
  const configuration = useQuery(api.users.getDashboardConfiguration);
  const initialTiles = resolveDashboardTiles(
    configuration?.tiles as DashboardTileInput[] | undefined,
  );

  if (configuration === undefined) {
    return <div role="status">Chargement de la configuration...</div>;
  }

  return (
    <DashboardTilesEditor
      key={JSON.stringify(initialTiles)}
      initialTiles={initialTiles}
    />
  );
}
