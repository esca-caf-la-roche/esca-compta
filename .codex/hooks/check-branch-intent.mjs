#!/usr/bin/env node
// Hook Codex PreToolUse (Bash|PowerShell) — cohérence branche / intention.
//
// Empêche deux erreurs coûteuses :
//   - committer une nouvelle feature sur master ou sur une branche sans portée
//     `feat-*` / `feature-*` ;
//   - pousser depuis une branche `fix-*` dont HEAD est un commit `feat(...)`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function lireStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function refuser(raison) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: raison,
      },
    }),
  );
}

const event = lireStdin();
const commande = event?.tool_input?.command ?? "";
if (!/\bgit\s+(commit|push)\b/i.test(commande)) process.exit(0);

const cwd = event?.cwd ?? process.cwd();
const branche = git(["branch", "--show-current"], cwd);
const brancheFeature = /(?:^|\/)(?:feat|feature)(?:[-/]|$)/i.test(branche);
const brancheFix = /(?:^|\/)fix(?:[-/]|$)/i.test(branche);

if (/\bgit\s+commit\b/i.test(commande)) {
  const messageMatch = commande.match(
    /(?:^|\s)(?:-m|--message(?:=|\s+))\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i,
  );
  const message = messageMatch?.[1] ?? messageMatch?.[2] ?? messageMatch?.[3] ?? "";
  if (/^feat(?:\([^)]*\))?:/i.test(message) && !brancheFeature) {
    refuser(
      `Commit de feature refusé sur la branche « ${branche || "(HEAD détachée)"} ». ` +
        "Créer d'abord une branche dédiée `codex/feat-<description>` depuis la " +
        "bonne base, puis recommencer le commit. Ne pas réutiliser une branche " +
        "active dont le nom décrit un autre sujet.",
    );
    process.exit(0);
  }
}

if (/\bgit\s+push\b/i.test(commande) && brancheFix) {
  const sujet = git(["log", "-1", "--format=%s"], cwd);
  if (/^feat(?:\([^)]*\))?:/i.test(sujet)) {
    refuser(
      `Push refusé : la branche de correction « ${branche} » pointe sur le commit ` +
        `de feature « ${sujet} ». Déplacer ce commit sur une branche ` +
        "`codex/feat-<description>` avant de pousser.",
    );
  }
}

process.exit(0);
