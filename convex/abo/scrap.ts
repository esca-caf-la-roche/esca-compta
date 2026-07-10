"use node";
// Scraping du site club (Phase H) — portage de scripts/scrap.js + import-eleves.js
// + _club-auth.js + _parse.js. Le site club n'a PAS d'API : on rejoue le flux
// d'authentification AJAX du navigateur, on récupère le HTML de la liste des
// abonnés (POST AdminMode=Liste) et l'export .xlsx des cours, puis on upsert.
//
// SÉCURITÉ 🔒 :
//   - identifiants club lus depuis l'env Convex (CLUB_BASE_URL/USERNAME/PASSWORD),
//     jamais loggués (seul le host est affiché).
//   - on ne loggue JAMAIS cookies, mot de passe, identifiant (email = donnée
//     perso), ni HTML/licences/noms bruts — uniquement des compteurs.
//   - écritures via internalMutation (matching.ts / compteur.ts) : pas d'API
//     publique exposant le scrap.
//
// Runtime Node (auth par cookies + parsing xlsx). Ce fichier n'exporte QUE des
// actions (les mutations/queries appelées vivent dans matching.ts / compteur.ts).

import * as XLSX from "xlsx";
import { internalAction } from "../_generated/server";
import { authenticatedAction } from "../customFunctions";
import { internal, api } from "../_generated/api";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ACCEPT_HTML =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ACCEPT_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// IDs encadrants de l'export cours (constante du script d'origine ; si la liste
// change de saison le serveur renvoie 0 ligne → alerte). Surchargée par env.
const ENCADRANTS_DEFAUT = "7507,4734,1594,9099,527,929,7233,9100,1007,8457,-9";
const COLUMNS = "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17";

// ── Configuration club (secrets d'environnement) ────────────────────────
function configClub(): { base: string; username: string; password: string } {
  const base = process.env.CLUB_BASE_URL;
  const username = process.env.CLUB_USERNAME;
  const password = process.env.CLUB_PASSWORD;
  if (!base || !username || !password) {
    throw new Error(
      "Site club non configuré (CLUB_BASE_URL / CLUB_USERNAME / CLUB_PASSWORD manquants).",
    );
  }
  // On ne loggue NI le mot de passe NI l'identifiant (email = donnée perso).
  return { base: base.replace(/\/+$/, ""), username, password };
}

// ── Cookie jar minimal (name=value cumulés au fil des réponses) ──────────
function creerJar() {
  const jar = new Map<string, string>();
  return {
    absorber(reponse: Response) {
      const setCookie =
        (reponse.headers as unknown as { getSetCookie?: () => string[] })
          .getSetCookie?.() ?? [];
      for (const sc of setCookie) {
        const paire = sc.split(";", 1)[0];
        const i = paire.indexOf("=");
        if (i > 0) jar.set(paire.slice(0, i).trim(), paire.slice(i + 1).trim());
      }
    },
    entete(): string {
      return Array.from(jar, ([k, val]) => `${k}=${val}`).join("; ");
    },
    get taille() {
      return jar.size;
    },
  };
}

// Étapes 1→3 du flux : auth AJAX → page principale → login standard.
async function authentifier(club: {
  base: string;
  username: string;
  password: string;
}) {
  const jar = creerJar();

  const r1 = await fetch(`${club.base}/scripts/ajax_operations.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
    },
    body: new URLSearchParams({
      operation: "user_login",
      email_user: club.username,
      mdp_user: club.password,
    }),
  });
  jar.absorber(r1);

  const r2 = await fetch(`${club.base}/`, {
    headers: { Accept: ACCEPT_HTML, "User-Agent": UA, Cookie: jar.entete() },
  });
  jar.absorber(r2);

  const r3 = await fetch(`${club.base}/login.html`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: ACCEPT_HTML,
      "User-Agent": UA,
      Referer: `${club.base}/login.html`,
      Cookie: jar.entete(),
    },
    body: new URLSearchParams({
      email_user: club.username,
      mdp_user: club.password,
    }),
  });
  jar.absorber(r3);

  if (jar.taille === 0) {
    throw new Error("Aucun cookie de session obtenu (auth club probablement refusée).");
  }
  return jar;
}

// ── Parsing HTML pur du tableau `table.Personnes` ───────────────────────
function decoderEntites(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}
function texteCellule(htmlCell: string): string {
  return decoderEntites(htmlCell.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}
function parserListe(html: string): Record<string, string>[] {
  const m = html.match(
    /<table[^>]*class=["'][^"']*\bPersonnes\b[^"']*["'][\s\S]*?<\/table>/i,
  );
  if (!m) return [];
  const rows = m[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let headers: string[] = [];
  const data: Record<string, string>[] = [];
  for (const row of rows) {
    if (/<th[\s\S]*?>/i.test(row)) {
      headers = (row.match(/<th[\s\S]*?<\/th>/gi) || []).map(texteCellule);
      continue;
    }
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (cells.length === 0) continue;
    const obj: Record<string, string> = {};
    cells.map(texteCellule).forEach((t, i) => {
      obj[headers[i] || `col_${i}`] = t;
    });
    data.push(obj);
  }
  return data;
}

function versEntier(val?: string): number | undefined {
  const n = Number.parseInt(val ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

// ── scraperAbonnes : liste des abonnés → abo_abonnes_scrap → matching ────
export const scraperAbonnes = internalAction({
  args: {},
  handler: async (ctx): Promise<{ upsertees: number; sansLicence: number; maj: number }> => {
    const club = configClub();
    console.log(`→ Scrap club (abonnés) : ${new URL(club.base).host}`);

    const jar = await authentifier(club);
    // GET puis POST AdminMode=Liste → HTML de la liste.
    const g = await fetch(`${club.base}/abonnement-escalade.html`, {
      headers: { Accept: ACCEPT_HTML, "User-Agent": UA, Cookie: jar.entete() },
    });
    jar.absorber(g);
    const r = await fetch(`${club.base}/abonnement-escalade.html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: ACCEPT_HTML,
        "User-Agent": UA,
        Referer: `${club.base}/abonnement-escalade.html`,
        Cookie: jar.entete(),
      },
      body: new URLSearchParams({ AdminMode: "Liste" }),
    });
    if (!r.ok) throw new Error(`POST AdminMode=Liste : HTTP ${r.status}`);
    const html = await r.text();

    const lignes = parserListe(html);
    console.log(`→ ${lignes.length} ligne(s) parsée(s).`);
    // Alerte d'échec : 0 ligne = login KO ou changement du HTML du site club.
    if (lignes.length === 0) {
      throw new Error(
        "0 ligne — échec de connexion ou changement du HTML du site club.",
      );
    }

    const aUpserter = lignes.map((row) => ({
      licence: row["Licence"] || undefined,
      nom: row["Nom"] || undefined,
      prenom: row["Prénom"] || undefined,
      email: row["e-mail"] || undefined,
      age: versEntier(row["Age"]),
      micro_perf: row["Micro-Perf"] || undefined,
      nb_seances: row["Nb Séances"] || undefined,
      adhesion: row["Adhésion"] || undefined,
      autonomie: row["Autonomie"] || undefined,
      photo: row["Photo"] || undefined,
      paiement: row["Paiement"] || undefined,
      abonnement_valide: row["Abonnementvalide ?"] === "Oui",
    }));

    // Upsert par lots (transactions bornées).
    let upsertees = 0;
    let sansLicence = 0;
    for (let i = 0; i < aUpserter.length; i += 200) {
      const lot = aUpserter.slice(i, i + 200);
      const res: { upsertees: number; sansLicence: number } =
        await ctx.runMutation(internal.abo.matching.upsertAbonnesScrapBatch, {
          lignes: lot,
        });
      upsertees += res.upsertees;
      sansLicence += res.sansLicence;
    }

    const maj: number = await ctx.runMutation(
      internal.abo.matching.matcherScrapPersonnes,
      {},
    );
    console.log(
      `→ scrap : ${upsertees} upsertées, ${sansLicence} sans licence ; ${maj} personne(s) mise(s) à jour.`,
    );
    return { upsertees, sansLicence, maj };
  },
});

// ── importerElevesEnCours : export .xlsx des cours → abo_eleves_en_cours ─
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Clé de champ Convex valide (ASCII imprimable uniquement, ex: "N° Licence" →
// "N Licence") ; dédoublonnée si deux en-têtes distincts se réduisent à la même clé.
function cleColonne(entete: string, dejaVues: Set<string>): string {
  let cle = entete
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cle || cle.startsWith("$") || cle.startsWith("_")) cle = `col_${cle}`;
  let unique = cle;
  let n = 2;
  while (dejaVues.has(unique)) {
    unique = `${cle}_${n}`;
    n++;
  }
  dejaVues.add(unique);
  return unique;
}

// Saison sportive courante (démarre vers septembre). Surchargée par IMPORT_SAISON.
function saisonCourante(d = new Date()): string {
  if (process.env.IMPORT_SAISON) return process.env.IMPORT_SAISON;
  const y = d.getFullYear();
  return d.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

interface LigneEleve {
  licence?: string;
  nom?: string;
  prenom?: string;
  horaire?: string;
  colonnes: Record<string, string>;
}

function parserExport(buf: Buffer): LigneEleve[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const grille = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const iHead = grille.findIndex((row) =>
    row.some((c) => normHeader(c).includes("licence")),
  );
  if (iHead < 0) return [];
  const head = grille[iHead].map(normHeader);
  const col = {
    licence: head.findIndex((h) => h.includes("licence")),
    prenom: head.findIndex((h) => h === "prenom"),
    nom: head.findIndex((h) => h === "nom"),
    horaire: head.findIndex((h) => h.includes("horaire")),
  };
  // Clés de colonnes assainies (ASCII valide), calculées une fois pour toutes
  // les lignes à partir de la ligne d'en-tête.
  const dejaVues = new Set<string>();
  const clesColonnes = grille[iHead].map((entete) => {
    const brut = String(entete ?? "").trim();
    return brut ? cleColonne(brut, dejaVues) : null;
  });

  const out: LigneEleve[] = [];
  for (const row of grille.slice(iHead + 1)) {
    const cell = (i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
    const nom = cell(col.nom);
    const prenom = cell(col.prenom);
    if (!nom && !prenom) continue;
    // Toutes les colonnes brutes (en-tête d'origine → valeur), pas seulement
    // celles exploitées par le matching (licence/nom/prenom/horaire).
    const colonnes: Record<string, string> = {};
    clesColonnes.forEach((cle, i) => {
      if (cle) colonnes[cle] = cell(i);
    });
    out.push({
      licence: cell(col.licence) || undefined,
      nom: nom || undefined,
      prenom: prenom || undefined,
      horaire: cell(col.horaire) || undefined,
      colonnes,
    });
  }
  return out;
}

export const importerElevesEnCours = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ avecLicence: number; sansLicence: number; enAttente: number }> => {
    const club = configClub();
    const saison = saisonCourante();
    console.log(`→ Import élèves en cours : ${new URL(club.base).host} (saison ${saison})`);

    const jar = await authentifier(club);
    const g = await fetch(`${club.base}/cours.html`, {
      headers: { Accept: ACCEPT_HTML, "User-Agent": UA, Cookie: jar.entete() },
    });
    jar.absorber(g);
    const p = await fetch(`${club.base}/cours.html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: ACCEPT_HTML,
        "User-Agent": UA,
        Referer: `${club.base}/cours.html`,
        Cookie: jar.entete(),
      },
      body: new URLSearchParams({ Menu_Cours: " Cours " }),
    });
    jar.absorber(p);

    // Le serveur prépare l'export (présent dans le flux d'origine).
    await sleep(3000);

    const encadrants = process.env.CLUB_ENCADRANTS || ENCADRANTS_DEFAUT;
    // Query construite à la main pour préserver les virgules (≠ %2C) comme l'export.
    const url =
      `${club.base}/pages/cours-export-xlsx.php` +
      `?Onglet=Unique&Encadrants=${encadrants}&ListeAttente=&Columns=${COLUMNS}`;
    const x = await fetch(url, {
      headers: {
        Accept: ACCEPT_XLSX,
        "User-Agent": UA,
        Referer: `${club.base}/cours.html`,
        Cookie: jar.entete(),
      },
    });
    if (!x.ok) throw new Error(`GET cours-export-xlsx.php : HTTP ${x.status}`);
    const buf = Buffer.from(await x.arrayBuffer());

    const lignes = parserExport(buf);
    // On EXCLUT les élèves en liste d'attente (pas encore admis → pas de passe-droit).
    const enAttente = lignes.filter(
      (l) => normHeader(l.horaire) === "liste d'attente",
    );
    const gardees = lignes.filter(
      (l) => normHeader(l.horaire) !== "liste d'attente",
    );
    console.log(
      `→ export : ${lignes.length} ligne(s), ${gardees.length} gardée(s), ${enAttente.length} en attente.`,
    );
    if (gardees.length === 0) {
      throw new Error(
        "0 élève exploitable — échec de connexion, liste Encadrants périmée ou format d'export modifié.",
      );
    }

    const res: { avecLicence: number; sansLicence: number } =
      await ctx.runMutation(internal.abo.compteur.remplacerElevesEnCours, {
        saison,
        lignes: gardees,
      });
    return { ...res, enAttente: enAttente.length };
  },
});

// ── synchroniserClub : bouton admin « Synchroniser maintenant » ─────────
// Gate rôle abo explicite (les actions internes n'ont pas de garde d'auth).
// Enchaîne : scrap abonnés (+ matching) puis import des élèves en cours.
export const synchroniserClub = authenticatedAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    abonnes: { upsertees: number; sansLicence: number; maj: number };
    eleves: { avecLicence: number; sansLicence: number; enAttente: number };
  }> => {
    const me = await ctx.runQuery(api.abo.identity.me, {});
    if (!me || me.aboRole !== "admin") {
      throw new Error("Réservé aux administrateurs.");
    }
    const abonnes = await ctx.runAction(internal.abo.scrap.scraperAbonnes, {});
    const eleves = await ctx.runAction(internal.abo.scrap.importerElevesEnCours, {});
    return { abonnes, eleves };
  },
});
