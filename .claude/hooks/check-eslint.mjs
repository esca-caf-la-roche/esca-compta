#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) — ESLint sur le fichier modifié.
//
// Lint immédiat de chaque fichier .ts/.tsx édité (config eslint.config.js du
// projet). Bloque (exit 2) uniquement sur des ERREURS ESLint, pas sur les
// warnings, et renvoie la sortie à Claude pour correction immédiate.
//
// Hors périmètre : _generated, node_modules, .claude, dist, fichiers non-TS.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function lireStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const event = lireStdin();
const filePath = event?.tool_input?.file_path;
if (!filePath || !existsSync(filePath)) process.exit(0);

const projectDir = event.cwd ?? process.cwd();
const rel = path.relative(projectDir, filePath).replaceAll("\\", "/");

if (
  !/\.(ts|tsx)$/.test(rel) ||
  rel.startsWith("..") ||
  rel.includes("_generated/") ||
  rel.includes("node_modules/") ||
  rel.startsWith(".claude/") ||
  rel.startsWith("dist/")
) {
  process.exit(0);
}

const eslintBin = path.join(projectDir, "node_modules", "eslint", "bin", "eslint.js");
if (!existsSync(eslintBin)) process.exit(0); // deps non installées : silencieux

const res = spawnSync(
  process.execPath,
  [eslintBin, "--no-warn-ignored", "--quiet", filePath],
  { cwd: projectDir, encoding: "utf8", timeout: 60_000 },
);

// --quiet : seules les erreurs comptent ; exit 1 = erreurs présentes.
if (res.status !== 0 && res.status !== null) {
  const sortie = [res.stdout, res.stderr].filter(Boolean).join("\n").trim();
  console.error(
    `ESLint signale des erreurs dans ${rel} — à corriger avant de continuer :\n\n${sortie}`,
  );
  process.exit(2);
}
process.exit(0);
