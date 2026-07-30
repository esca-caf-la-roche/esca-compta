import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Retourne les fichiers encore présents après une édition.
 *
 * Codex fournit le patch complet dans `tool_input.command` pour `apply_patch`.
 * `tool_input.file_path` reste accepté pour faciliter les tests directs.
 */
export function changedFiles(event, projectDir) {
  const candidates = new Set();
  const directPath = event?.tool_input?.file_path;
  if (typeof directPath === "string" && directPath.trim()) {
    candidates.add(directPath.trim());
  }

  const patch = event?.tool_input?.command;
  if (typeof patch === "string") {
    const header = /^\*\*\* (?:Add|Update|Delete) File: (.+)\r?$/gm;
    for (const match of patch.matchAll(header)) {
      candidates.add(match[1].trim());
    }
  }

  return [...candidates]
    .map((candidate) =>
      path.isAbsolute(candidate)
        ? path.normalize(candidate)
        : path.resolve(projectDir, candidate),
    )
    .filter((candidate) => existsSync(candidate));
}

export function relativeProjectPath(projectDir, filePath) {
  return path.relative(projectDir, filePath).replaceAll("\\", "/");
}
