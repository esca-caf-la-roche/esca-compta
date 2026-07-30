#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) — garde-fous du contrôle d'accès.
//
// Bloque (exit 2) si le fichier modifié introduit :
//   A. un endpoint Convex public non sécurisé : `query`/`mutation`/`action`
//      importés bruts de ./_generated/server au lieu des wrappers
//      authenticatedQuery/Mutation/Action (convex/customFunctions.ts).
//      Exception : un commentaire `// PUBLIC: <justification>` dans les
//      3 lignes au-dessus de l'export.
//   B. un passe-droit du rôle admin sur les tuiles : `role === "admin" || ...
//      allowedTiles.includes(...)`. Règle du projet : l'accès aux modules
//      vient UNIQUEMENT des tuiles cochées (userSettings.allowedTiles) ;
//      le rôle admin ne sert qu'à la page Configurations.
//
// Lit l'événement hook sur stdin (JSON), lit le fichier modifié sur disque.

import { readFileSync } from "node:fs";
import path from "node:path";
import { changedFiles } from "./changed-files.mjs";

function lireStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const event = lireStdin();
const projectDir = event.cwd ?? process.cwd();
const erreurs = [];

for (const filePath of changedFiles(event, projectDir)) {
  const rel = path.relative(projectDir, filePath).replaceAll("\\", "/");

  // Hors périmètre : générés, legacy, dépendances, non-TS.
  if (
    !/\.(ts|tsx)$/.test(rel) ||
    rel.startsWith("..") ||
    rel.includes("_generated/") ||
    rel.includes("node_modules/") ||
    rel.startsWith("abo-esca-new/")
  ) {
    continue;
  }

  const contenu = readFileSync(filePath, "utf8");
  const lignes = contenu.split("\n");

  // ── Règle B : pas de bypass admin sur les tuiles ─────────────────────────
  const compact = contenu.replace(/\s+/g, " ");
  const bypassAdmin =
    /role\s*===?\s*["']admin["']\s*\|\|[^;]{0,200}allowedTiles/.test(compact) ||
    /allowedTiles[^;]{0,200}\|\|[^;]{0,80}role\s*===?\s*["']admin["']/.test(compact);
  if (bypassAdmin) {
    erreurs.push(
      `RÈGLE D'ACCÈS VIOLÉE dans ${rel} : le rôle "admin" ne doit JAMAIS donner ` +
        `accès à une tuile/module. L'accès vient de userSettings.allowedTiles. ` +
        `Utilisez requireTile()/requireAdmin() ou RequireAccess.`,
    );
  }

  // ── Règle A : endpoints Convex sécurisés ─────────────────────────────────
  const exclusA = new Set([
    "convex/customFunctions.ts",
    "convex/auth.ts",
    "convex/auth.config.ts",
    "convex/http.ts",
    "convex/crons.ts",
    "convex/convex.config.ts",
  ]);

  if (rel.startsWith("convex/") && !exclusA.has(rel)) {
    const aliasBruts = new Set();
    const reImport = /import\s*\{([^}]*)\}\s*from\s*["'](?:\.{1,2}\/)+_generated\/server["']/g;
    for (const m of contenu.matchAll(reImport)) {
      for (const spec of m[1].split(",")) {
        const [orig, alias] = spec.split(/\s+as\s+/).map((s) => s.trim());
        if (["query", "mutation", "action"].includes(orig)) {
          aliasBruts.add(alias || orig);
        }
      }
    }

    if (aliasBruts.size > 0) {
      const reExport = /^export\s+(?:const|default)\s+(\w+)?\s*=?\s*(\w+)\s*\(/;
      lignes.forEach((ligne, i) => {
        const m = ligne.match(reExport);
        if (!m || !aliasBruts.has(m[2])) return;
        const contexte = lignes.slice(Math.max(0, i - 3), i).join("\n");
        if (!/\/\/\s*PUBLIC:/.test(contexte)) {
          erreurs.push(
            `ENDPOINT NON SÉCURISÉ dans ${rel} ligne ${i + 1} : ` +
              `utilisez les wrappers de convex/customFunctions.ts ou ajoutez ` +
              `\`// PUBLIC: <justification>\`. Voir AGENTS.md.`,
          );
        }
      });
    }
  }
}

if (erreurs.length > 0) {
  console.error(erreurs.join("\n\n"));
  process.exit(2);
}
process.exit(0);
