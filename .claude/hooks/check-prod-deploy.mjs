#!/usr/bin/env node
// Hook PreToolUse (Bash|PowerShell) — garde-fou production Convex.
//
// Le projet a deux déploiements Convex : DEV (npx convex dev) et PROD
// (déployé normalement par le CI au push sur master). Ce hook intercepte
// toute commande shell qui toucherait la PROD directement :
//   - `convex deploy` (avec ou sans npx)
//   - toute commande `convex … --prod` MUTANTE (run, import, env set/remove,
//     data delete, …)
// et force une confirmation explicite de l'utilisateur (permissionDecision
// "ask"). Les lectures prod (logs, env list/get, data en lecture) passent.
//
// Lit l'événement hook sur stdin (JSON), répond sur stdout (JSON).

import { readFileSync } from "node:fs";

function lireStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const event = lireStdin();
const commande = event?.tool_input?.command ?? "";
if (!commande || !/\bconvex\b/i.test(commande)) process.exit(0);

let raison = null;

if (/\bconvex\s+deploy\b/i.test(commande)) {
  raison =
    "`convex deploy` publie le backend en PRODUCTION. C'est normalement le rôle " +
    "du CI (push sur master → .github/workflows/deploy.yml). Confirmer uniquement " +
    "si un déploiement manuel est réellement voulu.";
} else if (/--prod\b/i.test(commande)) {
  // Lectures prod tolérées sans confirmation.
  const lectureSeule =
    /\bconvex\s+(logs|dashboard|function-spec)\b/i.test(commande) ||
    /\bconvex\s+env\s+(list|get)\b/i.test(commande) ||
    (/\bconvex\s+data\b/i.test(commande) && !/\bdelete\b/i.test(commande)) ||
    /\bconvex\s+export\b/i.test(commande);
  if (!lectureSeule) {
    raison =
      "Cette commande Convex cible la PRODUCTION (--prod) et peut modifier des " +
      "données réelles du club. Vérifier qu'elle a été testée sur DEV d'abord " +
      "(mémoire projet : migrations toujours dev puis prod).";
  }
}

if (raison) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: raison,
      },
    }),
  );
}
process.exit(0);
