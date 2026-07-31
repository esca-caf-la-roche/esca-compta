import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  TILE_COLOR_OPTIONS,
  TILE_OPTIONS,
  type TileColorClass,
  type TileId,
} from "../../config/tiles";

type DashboardTile = { id: TileId; color: TileColorClass };

const defaultTiles = (): DashboardTile[] =>
  TILE_OPTIONS.map(({ id, defaultColor }) => ({ id, color: defaultColor }));

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

  const setColor = (id: TileId, color: TileColorClass) => {
    setTiles((current) => current.map((tile) => tile.id === id ? { ...tile, color } : tile));
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
          Définissez l’ordre et la couleur des tuiles affichées sur le tableau de bord.
          Les accès de chaque utilisateur restent inchangés.
        </p>

        <div className="dashboard-tiles-panel__list">
          {tiles.map((tile, index) => {
            const option = TILE_OPTIONS.find(({ id }) => id === tile.id);
            return (
              <div className="dashboard-tiles-panel__row" key={tile.id}>
                <span className={`dashboard-tiles-panel__preview ${tile.color}`} aria-hidden="true" />
                <strong>{option?.label ?? tile.id}</strong>
                <div className="dashboard-tiles-panel__controls">
                  <label>
                    <span className="sr-only">Couleur de {option?.label ?? tile.id}</span>
                    <select
                      className="input-field"
                      value={tile.color}
                      onChange={(event) => setColor(tile.id, event.target.value as TileColorClass)}
                    >
                      {TILE_COLOR_OPTIONS.map((color) => (
                        <option key={color.value} value={color.value}>{color.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Monter la tuile"
                    aria-label={`Monter ${option?.label ?? tile.id}`}
                    disabled={index === 0}
                    onClick={() => moveTile(index, -1)}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Descendre la tuile"
                    aria-label={`Descendre ${option?.label ?? tile.id}`}
                    disabled={index === tiles.length - 1}
                    onClick={() => moveTile(index, 1)}
                  >
                    <ArrowDown size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="dashboard-tiles-panel__error" role="alert">{error}</p>}
        <div className="dashboard-tiles-panel__actions">
          <button type="button" className="btn-secondary" onClick={() => setTiles(defaultTiles())} disabled={isSaving}>
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

  if (configuration === undefined) {
    return <div>Chargement de la configuration...</div>;
  }

  return (
    <DashboardTilesEditor
      key={JSON.stringify(configuration?.tiles ?? defaultTiles())}
      initialTiles={(configuration?.tiles ?? defaultTiles()) as DashboardTile[]}
    />
  );
}
