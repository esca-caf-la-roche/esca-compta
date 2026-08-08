#!/usr/bin/env node

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
if (!/\bconvex(?:\.cmd)?\s+dev\b/i.test(commande)) process.exit(0);
if (/\s--(?:local|help)\b/i.test(commande) || /#\s*CLOUD-DEV-OK\s*:/i.test(commande)) {
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      "Le DEV cloud consomme le quota Convex de l'équipe. Utilisez `convex dev --local` " +
      "pour un serveur agentique, ou les commandes de validation sans déploiement " +
      "(`npm run check:convex`, tests, lint, build). Si le cloud est indispensable, " +
      "annoncez la cible et relancez avec `# CLOUD-DEV-OK: <raison>`.",
  },
}));
