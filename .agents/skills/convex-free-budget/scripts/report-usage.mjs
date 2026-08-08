#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "../../../..");
const cli = path.join(racine, "node_modules", "convex", "bin", "main.js");
const quotaGb = Number(process.env.CONVEX_IO_FREE_QUOTA_GB ?? 1);
const seuilJour = Number(process.env.CONVEX_IO_DAILY_WARNING_RATIO ?? 0.05);
const seuilMois = Number(process.env.CONVEX_IO_MONTHLY_WARNING_RATIO ?? 0.7);
const modeCheck = process.argv.includes("--check");
const modeJson = process.argv.includes("--json");

if (!existsSync(cli)) {
  console.error("Convex n'est pas installé. Exécutez npm install avant ce rapport.");
  process.exit(1);
}

function lireUsage(label, args) {
  const resultat = spawnSync(
    process.execPath,
    [cli, "deployment", "usage", ...args, "--json"],
    { cwd: racine, encoding: "utf8", windowsHide: true },
  );
  if (resultat.status !== 0) {
    throw new Error(`${label}: ${resultat.stderr.trim() || "lecture impossible"}`);
  }
  const payload = JSON.parse(resultat.stdout);
  const io = payload.metrics?.databaseIoGb?.usage;
  const appels = payload.metrics?.functionCalls?.usage;
  if (!io || !appels) throw new Error(`${label}: métriques Database I/O absentes`);
  return {
    label,
    dayGb: io.current_day,
    monthGb: io.current_month,
    dayCalls: appels.current_day,
    monthCalls: appels.current_month,
  };
}

function formatMo(gb) {
  return `${(gb * 1000).toFixed(1)} Mo`;
}

try {
  const deployments = [
    lireUsage("PROD", ["--prod"]),
    lireUsage("DEV", ["--deployment", "dev"]),
  ];
  const total = deployments.reduce(
    (acc, item) => ({
      dayGb: acc.dayGb + item.dayGb,
      monthGb: acc.monthGb + item.monthGb,
      dayCalls: acc.dayCalls + item.dayCalls,
      monthCalls: acc.monthCalls + item.monthCalls,
    }),
    { dayGb: 0, monthGb: 0, dayCalls: 0, monthCalls: 0 },
  );
  const rapport = {
    quotaGb,
    deployments,
    projectTotal: total,
    ratios: {
      day: total.dayGb / quotaGb,
      month: total.monthGb / quotaGb,
    },
    note: "Le quota Convex est agrégé par équipe ; les autres projets et previews ne figurent pas dans ce total.",
  };

  if (modeJson) {
    console.log(JSON.stringify(rapport, null, 2));
  } else {
    console.log(`Budget Database I/O Convex — quota gratuit ${quotaGb} Go/mois`);
    for (const item of deployments) {
      console.log(
        `${item.label.padEnd(4)} jour ${formatMo(item.dayGb)} (${item.dayCalls.toLocaleString("fr-FR")} appels)` +
        ` | mois ${formatMo(item.monthGb)} (${item.monthCalls.toLocaleString("fr-FR")} appels)`,
      );
    }
    console.log(
      `TOTAL jour ${formatMo(total.dayGb)} (${(rapport.ratios.day * 100).toFixed(1)} % du quota mensuel)` +
      ` | mois ${formatMo(total.monthGb)} (${(rapport.ratios.month * 100).toFixed(1)} %)`,
    );
    console.log(rapport.note);
  }

  if (modeCheck && (rapport.ratios.day >= seuilJour || rapport.ratios.month >= seuilMois)) {
    console.error(
      `Alerte budget : seuil journalier ${(seuilJour * 100).toFixed(0)} % ou mensuel ${(seuilMois * 100).toFixed(0)} % atteint.`,
    );
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
