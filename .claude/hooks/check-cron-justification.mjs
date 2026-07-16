#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) — garde-fou "pas de cron de synchro par défaut".
//
// Voir CLAUDE.md § DATABASE I/O et le skill tuile-saison (§3.6).
//
// Ne s'active que sur `convex/crons.ts`. Bloque (exit 2) quand un job cron est
// enregistré (`crons.interval(` / `crons.cron(` / `crons.hourly(` / `.daily(` /
// `.weekly(` / `.monthly(`) SANS justification. Les crons horaires de synchro
// externe (scrap, HelloAsso, imports) sont la principale source de Database I/O
// (ils tournent 24/7 même sans utilisateur) : par défaut, préférer le pattern
// on-demand throttlé de `convex/abo/sync.ts`.
//
// Échappatoire (comme `// PUBLIC:` / `// SAISON-EXEMPT:`) : ajouter un commentaire
// `// CRON-OK: <raison>` dans le bloc de commentaires qui précède le job pour
// attester qu'un cron est réellement nécessaire (donnée à garder fraîche sans
// présence utilisateur, ex. compteur public) — de préférence à cadence lâche.
//
// Lit l'événement hook sur stdin (JSON), lit le fichier sur disque.

import { readFileSync, existsSync } from "node:fs";
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

if (rel !== "convex/crons.ts") process.exit(0);

const src = readFileSync(filePath, "utf8");
const lignes = src.split("\n");
const REGISTRE = /\bcrons\.(interval|cron|hourly|daily|weekly|monthly)\s*\(/;

const nonJustifies = [];
for (let i = 0; i < lignes.length; i++) {
  if (!REGISTRE.test(lignes[i])) continue;
  // Remonte le bloc de commentaires (et lignes vides) juste au-dessus du job ;
  // cherche un marqueur `// CRON-OK:`.
  let justifie = false;
  for (let j = i - 1; j >= 0; j--) {
    const l = lignes[j].trim();
    if (l === "") continue; // saute les lignes vides
    if (l.startsWith("//")) {
      if (/\/\/\s*CRON-OK:/i.test(l)) {
        justifie = true;
        break;
      }
      continue; // autre commentaire : on continue de remonter
    }
    break; // ligne de code : fin du bloc de commentaires
  }
  if (!justifie) nonJustifies.push(i + 1); // n° de ligne 1-indexé
}

if (nonJustifies.length > 0) {
  console.error(
    `CONVENTION DATABASE I/O VIOLÉE — convex/crons.ts : job(s) cron enregistré(s) ` +
      `sans justification (ligne(s) ${nonJustifies.join(", ")}).\n\n` +
      `Les crons de synchro externe tournent 24/7 et sont la principale source de ` +
      `Database I/O. Par défaut, utilisez le pattern ON-DEMAND throttlé de ` +
      `convex/abo/sync.ts (verrou partagé dans abo_app_config, TTL ~1 h) plutôt ` +
      `qu'un cron.\n\n` +
      `Si ce cron est RÉELLEMENT nécessaire (donnée à garder fraîche sans présence ` +
      `utilisateur, ex. compteur public — de préférence à cadence lâche), ajoutez ` +
      `un commentaire \`// CRON-OK: <raison>\` dans le bloc juste au-dessus du job. ` +
      `Voir CLAUDE.md § DATABASE I/O.`,
  );
  process.exit(2);
}
process.exit(0);
