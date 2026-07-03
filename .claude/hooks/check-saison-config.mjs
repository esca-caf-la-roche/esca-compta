#!/usr/bin/env node
// Hook PostToolUse (Edit|Write) — garde-fous du contrat "saison".
//
// Voir le skill `.claude/skills/tuile-saison/SKILL.md`.
//
// Ne s'active que sur `convex/schema.ts` et `convex/saisons.ts`. Bloque (exit 2)
// et renvoie un message à Claude quand une table saisonnière est mal câblée :
//
//   S1. Une table (hors `abo_*`) déclare un champ `saison: v.…` mais N'A PAS
//       l'index `.index("by_saison", ["saison"])`. Les requêtes saisonnières en
//       dépendent. Échappatoire : commentaire `// SAISON-EXEMPT: <raison>` sur
//       la ligne du champ (donnée nommée "saison" mais non filtrée à l'échelle
//       de l'app, ex. archives).
//
//   S2. Une table saisonnière (index `by_saison`, hors `abo_*`) n'apparaît nulle
//       part dans `convex/saisons.ts` : sa politique de suppression n'est pas
//       déclarée (garde qui refuse, OU cascade `deleteBySaison`). Risque
//       d'orphelins à la suppression d'une saison.
//
// Lit l'événement hook sur stdin (JSON), lit les fichiers sur disque.

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

// N'agit que pour les deux fichiers qui portent le contrat saison.
if (rel !== "convex/schema.ts" && rel !== "convex/saisons.ts") process.exit(0);

const schemaPath = path.join(projectDir, "convex/schema.ts");
const saisonsPath = path.join(projectDir, "convex/saisons.ts");
if (!existsSync(schemaPath)) process.exit(0);

const schema = readFileSync(schemaPath, "utf8");
const saisons = existsSync(saisonsPath) ? readFileSync(saisonsPath, "utf8") : "";
const erreurs = [];

// ── Extraction des tables : `nom: defineTable(...)` + chaîne `.index(...)` ────
// Parcourt le schéma, équilibre les parenthèses pour isoler le texte complet de
// chaque table (objet defineTable + indexes qui suivent, jusqu'à la virgule de
// séparation au niveau racine).
function extraireTables(src) {
  const tables = [];
  const re = /(\w+)\s*:\s*defineTable\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const nom = m[1];
    // Départ = la '(' de defineTable( ; équilibre jusqu'à sa fermeture.
    let i = re.lastIndex - 1; // position de '('
    let depth = 0;
    let defineFin = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          defineFin = i;
          break;
        }
      }
    }
    if (defineFin === -1) continue;
    const objet = src.slice(re.lastIndex, defineFin); // corps de defineTable({...})

    // Consomme la chaîne `.index(...)`/`.searchIndex(...)` qui suit, jusqu'à ','
    // ou '}' de racine.
    let j = defineFin + 1;
    let indexes = "";
    while (j < src.length) {
      const c = src[j];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") {
        j++;
        continue;
      }
      if (c === ".") {
        // consomme un appel .xxx( ... )
        let k = j;
        let d = 0;
        let started = false;
        for (; k < src.length; k++) {
          if (src[k] === "(") {
            d++;
            started = true;
          } else if (src[k] === ")") {
            d--;
            if (d === 0 && started) {
              k++;
              break;
            }
          }
        }
        indexes += src.slice(j, k);
        j = k;
        continue;
      }
      break; // ',' ou autre : fin de la table
    }
    tables.push({ nom, objet, texte: objet + indexes });
  }
  return tables;
}

const tables = extraireTables(schema);
const saisonnieres = []; // tables avec index by_saison (hors abo_)

for (const t of tables) {
  if (t.nom.startsWith("abo_")) continue; // module abonnements : conventions propres
  if (t.nom === "saisons") continue; // la table des saisons elle-même

  const aIndexBySaison = /\.index\(\s*["']by_saison["']/.test(t.texte);
  if (aIndexBySaison) saisonnieres.push(t.nom);

  // Champ `saison: v.…` au niveau de la table (on ignore les commentaires
  // `// SAISON-EXEMPT:` sur la même ligne).
  const lignesObjet = t.objet.split("\n");
  const aChampSaison = lignesObjet.some((l) => {
    if (/\/\/\s*SAISON-EXEMPT:/i.test(l)) return false;
    const sansCommentaire = l.replace(/\/\/.*$/, "");
    return /\bsaison\s*:\s*v\./.test(sansCommentaire);
  });

  // S1 : champ saison sans index by_saison.
  if (aChampSaison && !aIndexBySaison) {
    erreurs.push(
      `CONTRAT SAISON VIOLÉ (S1) — table \`${t.nom}\` dans convex/schema.ts : ` +
        `elle a un champ \`saison\` mais PAS l'index \`.index("by_saison", ["saison"])\`. ` +
        `Les requêtes saisonnières filtrent via cet index (withIndex("by_saison", …)). ` +
        `Ajoutez l'index. Si ce champ "saison" n'est PAS le filtre applicatif ` +
        `(simple donnée, ex. archive), ajoutez un commentaire \`// SAISON-EXEMPT: <raison>\` ` +
        `sur sa ligne. Voir le skill tuile-saison.`,
    );
  }
}

// S2 : chaque table saisonnière doit apparaître dans convex/saisons.ts (garde
// de refus OU cascade deleteBySaison). Sinon : politique de suppression absente.
if (saisons) {
  for (const nom of saisonnieres) {
    const mention = new RegExp(`["'\\b]${nom}["'\\b]`).test(saisons);
    if (!mention) {
      erreurs.push(
        `CONTRAT SAISON VIOLÉ (S2) — table saisonnière \`${nom}\` absente de convex/saisons.ts : ` +
          `sa politique de suppression n'est pas déclarée dans \`remove\`. Choisissez : ` +
          `(a) donnée réelle → ajoutez un garde \`ConvexError\` qui refuse la suppression si la ` +
          `table contient des lignes ; ou (b) donnée dérivée → ajoutez \`${nom}\` au type ` +
          `\`SaisonTable\` et à la cascade \`deleteBySaison(...)\`. Voir le skill tuile-saison.`,
      );
    }
  }
}

if (erreurs.length > 0) {
  console.error(erreurs.join("\n\n"));
  process.exit(2); // bloque et renvoie le message à Claude pour correction
}
process.exit(0);
