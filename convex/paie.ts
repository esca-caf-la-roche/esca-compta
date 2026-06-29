import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { previousSaison } from "./saisonUtils";

const typeContratValidator = v.union(v.literal("CDII"), v.literal("CDI"));

const cotisSalarialeValidator = v.object({
  label: v.string(),
  taux: v.number(),
  base: v.string(),
});
const cotisPatronaleValidator = v.object({
  label: v.string(),
  taux: v.number(),
});

async function requireAdmin(ctx: MutationCtx, userId: Id<"users">) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (settings?.role !== "admin") {
    throw new Error("Seul un administrateur peut effectuer cette action.");
  }
}

// --- Paramètres de paie par défaut (issus de l'onglet « Fiche de Paie ») ---

const DEFAULT_COTIS_SALARIALES = [
  { label: "Assurance vieillesse plafonnée", taux: 6.9, base: "brut" },
  { label: "Assurance vieillesse totalité", taux: 0.4, base: "brut" },
  { label: "Retraite complémentaire plafonnée", taux: 3.15, base: "brut" },
  { label: "Contribution d'équilibre général T1", taux: 0.86, base: "brut" },
  { label: "Régime de base obligatoire", taux: 0.29, base: "brut" },
  { label: "Régime de base obligatoire (micro)", taux: 2.9, base: "micro" },
  { label: "Régime de base obligatoire (micro)", taux: 6.8, base: "micro" },
  { label: "CSG et CRDS", taux: 2.9, base: "csgcrds" },
  { label: "CSG déductible fiscalement", taux: 6.8, base: "csgcrds" },
];

const DEFAULT_COTIS_PATRONALES = [
  { label: "Assurance maladie", taux: 7 },
  { label: "Contribution solidarité", taux: 0.3 },
  { label: "Assurance vieillesse plafonnée", taux: 8.55 },
  { label: "Assurance vieillesse totalité", taux: 1.9 },
  { label: "Allocations familiales", taux: 3.45 },
  { label: "Accident du travail", taux: 0.77 },
  { label: "FNAL", taux: 0.1 },
  { label: "Retraite complémentaire plafonnée", taux: 4.72 },
  { label: "Contribution d'équilibre général T1", taux: 1.29 },
  { label: "Régime de base obligatoire", taux: 0.29 },
  { label: "Chômage totalité", taux: 4.05 },
  { label: "Assedic FNGS", taux: 0.15 },
  { label: "Formation professionnelle", taux: 1.07 },
  { label: "Formation prof. légale", taux: 0.55 },
  { label: "Cotisation CIF dirigeants et paritarisme", taux: 0.06 },
  { label: "Contrib. organisations syndicales", taux: 0.016 },
  { label: "Prévoyance", taux: 0.83 },
];

const DEFAULT_PARAMS = {
  margeSecurite: 1.02,
  indemniteCpPct: 10,
  mutuelleSalarie: 20,
  mutuelleEmployeur: 20,
  primeEquipementAnnuelle: 210,
  fraisBulletin: 14,
  cotisationsSalariales: DEFAULT_COTIS_SALARIALES,
  cotisationsPatronales: DEFAULT_COTIS_PATRONALES,
};

// --- Données historiques réelles (source : Budget_Escalade / Salaire be.csv) ---
// Pour les CDI, nbHeuresAnnuel = heures « budget » saisies ; la conversion en
// heures réelles est faite au calcul (cf. heuresAnnuellesEffectives).

const SEED_MONITEURS: Record<string, { typeContrat: "CDII" | "CDI"; ordre: number }> = {
  "Clémentine": { typeContrat: "CDII", ordre: 0 },
  "David": { typeContrat: "CDII", ordre: 1 },
  "Raphaël": { typeContrat: "CDII", ordre: 2 },
  "Stéphane": { typeContrat: "CDII", ordre: 3 },
  "Nicolas": { typeContrat: "CDII", ordre: 4 },
  "Jérôme": { typeContrat: "CDI", ordre: 5 },
  "Hugo": { typeContrat: "CDI", ordre: 6 },
  "Gael": { typeContrat: "CDI", ordre: 7 },
};

const SEED_LIGNES: Array<{
  saison: string;
  nom: string;
  nbHeuresAnnuel: number;
  nbMois: number;
  tauxHoraireBrut: number;
  augmentationPct: number | null;
}> = [
  // Saison 2024-25 (augmentation vs 2023-24)
  { saison: "2024-25", nom: "Clémentine", nbHeuresAnnuel: 740, nbMois: 12, tauxHoraireBrut: 19.665, augmentationPct: 3.5 },
  { saison: "2024-25", nom: "David", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 21.95235, augmentationPct: 3.5 },
  { saison: "2024-25", nom: "Raphaël", nbHeuresAnnuel: 760, nbMois: 10, tauxHoraireBrut: 22.10082, augmentationPct: 4.2 },
  { saison: "2024-25", nom: "Stéphane", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 19.665, augmentationPct: 3.5 },
  { saison: "2024-25", nom: "Nicolas", nbHeuresAnnuel: 180, nbMois: 12, tauxHoraireBrut: 20.7, augmentationPct: 3.5 },
  { saison: "2024-25", nom: "Jérôme", nbHeuresAnnuel: 925, nbMois: 12, tauxHoraireBrut: 19.703, augmentationPct: 3.7 },
  { saison: "2024-25", nom: "Hugo", nbHeuresAnnuel: 931, nbMois: 12, tauxHoraireBrut: 19.703, augmentationPct: 3.7 },
  // Saison 2025-26 (augmentation vs 2024-25 ; Hugo parti, Gael arrivé)
  { saison: "2025-26", nom: "Clémentine", nbHeuresAnnuel: 740, nbMois: 12, tauxHoraireBrut: 20.25, augmentationPct: 3 },
  { saison: "2025-26", nom: "David", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 22.61, augmentationPct: 3 },
  { saison: "2025-26", nom: "Raphaël", nbHeuresAnnuel: 760, nbMois: 10, tauxHoraireBrut: 22.76, augmentationPct: 3 },
  { saison: "2025-26", nom: "Stéphane", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 20.25, augmentationPct: 3 },
  { saison: "2025-26", nom: "Nicolas", nbHeuresAnnuel: 180, nbMois: 12, tauxHoraireBrut: 21.32, augmentationPct: 3 },
  { saison: "2025-26", nom: "Jérôme", nbHeuresAnnuel: 1150, nbMois: 12, tauxHoraireBrut: 21.6, augmentationPct: 9.65 },
  { saison: "2025-26", nom: "Gael", nbHeuresAnnuel: 515, nbMois: 12, tauxHoraireBrut: 21.6, augmentationPct: null },
];

export const getMasseSalariale = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const params = await ctx.db
      .query("parametresPaie")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .first();

    const lignes = await ctx.db
      .query("salairesSaison")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    // Saison précédente (augmentation vs N-1 + comparaison de coût) : lignes + paramètres.
    const prevSaison = previousSaison(args.saison);
    const prevLignes = prevSaison
      ? await ctx.db
          .query("salairesSaison")
          .withIndex("by_saison", (q) => q.eq("saison", prevSaison))
          .collect()
      : [];
    const prevParams = prevSaison
      ? await ctx.db
          .query("parametresPaie")
          .withIndex("by_saison", (q) => q.eq("saison", prevSaison))
          .first()
      : null;

    // Construit une ligne enrichie (avec les infos du salarié) réutilisable.
    const toRow = async (ligne: (typeof lignes)[number]) => {
      const salarie = await ctx.db.get(ligne.salarieId);
      return {
        ligneId: ligne._id,
        salarieId: ligne.salarieId,
        nom: salarie?.nom ?? "Inconnu",
        typeContrat: salarie?.typeContrat ?? "CDII",
        ordre: salarie?.ordre ?? 0,
        nbHeuresAnnuel: ligne.nbHeuresAnnuel,
        nbMois: ligne.nbMois,
        tauxHoraireBrut: ligne.tauxHoraireBrut,
        augmentationPct: ligne.augmentationPct ?? null,
        actif: ligne.actif ?? true,
      };
    };

    const prevSalaries = await Promise.all(prevLignes.map(toRow));
    const prevBySalarie = new Map(prevSalaries.map((p) => [p.salarieId, p]));

    const salaries = (await Promise.all(lignes.map(toRow))).map((row) => ({
      ...row,
      tauxPrecedent: prevBySalarie.get(row.salarieId)?.tauxHoraireBrut ?? null,
    }));

    salaries.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));
    prevSalaries.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));

    return { params, salaries, prevSalaries, prevParams, prevSaison };
  },
});

// Amorçage one-shot des données historiques réelles (2024-25 et 2025-26).
// À lancer une fois via la CLI : `npx convex run paie:seedHistorique`
// Idempotent : ne recrée pas une ligne déjà présente pour une saison donnée.
export const seedHistorique = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: string[] = [];
    const saisons = [...new Set(SEED_LIGNES.map((l) => l.saison))];

    // Paramètres de paie par défaut, par saison (si absents).
    for (const saison of saisons) {
      const existingParams = await ctx.db
        .query("parametresPaie")
        .withIndex("by_saison", (q) => q.eq("saison", saison))
        .first();
      if (!existingParams) {
        await ctx.db.insert("parametresPaie", { saison, ...DEFAULT_PARAMS });
        results.push(`Paramètres créés : ${saison}`);
      }
    }

    // Salariés (identité unique) + lignes de saison.
    const allSalaries = await ctx.db.query("salaries").collect();
    const salarieIdByNom = new Map<string, Id<"salaries">>(
      allSalaries.map((s) => [s.nom, s._id])
    );

    for (const [nom, info] of Object.entries(SEED_MONITEURS)) {
      if (!salarieIdByNom.has(nom)) {
        const id = await ctx.db.insert("salaries", {
          nom,
          typeContrat: info.typeContrat,
          ordre: info.ordre,
        });
        salarieIdByNom.set(nom, id);
      }
    }

    let created = 0;
    for (const l of SEED_LIGNES) {
      const salarieId = salarieIdByNom.get(l.nom)!;
      const exists = await ctx.db
        .query("salairesSaison")
        .withIndex("by_saison", (q) => q.eq("saison", l.saison))
        .filter((q) => q.eq(q.field("salarieId"), salarieId))
        .first();
      if (exists) continue;
      await ctx.db.insert("salairesSaison", {
        salarieId,
        saison: l.saison,
        nbHeuresAnnuel: l.nbHeuresAnnuel,
        nbMois: l.nbMois,
        tauxHoraireBrut: l.tauxHoraireBrut,
        augmentationPct: l.augmentationPct ?? undefined,
        actif: true,
      });
      created++;
    }
    results.push(`${created} lignes de salaire créées.`);
    return results;
  },
});

export const addSalarie = mutation({
  args: {
    nom: v.string(),
    typeContrat: typeContratValidator,
    saison: v.string(),
    nbHeuresAnnuel: v.number(),
    nbMois: v.number(),
    tauxHoraireBrut: v.number(),
    augmentationPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const nom = args.nom.trim();
    if (!nom) throw new Error("Le nom est obligatoire.");

    const count = (await ctx.db.query("salaries").collect()).length;
    const salarieId = await ctx.db.insert("salaries", {
      nom,
      typeContrat: args.typeContrat,
      ordre: count,
    });
    await ctx.db.insert("salairesSaison", {
      salarieId,
      saison: args.saison,
      nbHeuresAnnuel: args.nbHeuresAnnuel,
      nbMois: args.nbMois,
      tauxHoraireBrut: args.tauxHoraireBrut,
      augmentationPct: args.augmentationPct,
      actif: true,
    });
    return salarieId;
  },
});

export const updateSalarie = mutation({
  args: {
    salarieId: v.id("salaries"),
    ligneId: v.id("salairesSaison"),
    nom: v.optional(v.string()),
    typeContrat: v.optional(typeContratValidator),
    nbHeuresAnnuel: v.optional(v.number()),
    nbMois: v.optional(v.number()),
    tauxHoraireBrut: v.optional(v.number()),
    augmentationPct: v.optional(v.number()),
    actif: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    const salarieUpdates: Record<string, unknown> = {};
    if (args.nom !== undefined) {
      const nom = args.nom.trim();
      if (!nom) throw new Error("Le nom est obligatoire.");
      salarieUpdates.nom = nom;
    }
    if (args.typeContrat !== undefined) salarieUpdates.typeContrat = args.typeContrat;
    if (Object.keys(salarieUpdates).length > 0) {
      await ctx.db.patch(args.salarieId, salarieUpdates);
    }

    const ligneUpdates: Record<string, unknown> = {};
    if (args.nbHeuresAnnuel !== undefined) ligneUpdates.nbHeuresAnnuel = args.nbHeuresAnnuel;
    if (args.nbMois !== undefined) ligneUpdates.nbMois = args.nbMois;
    if (args.tauxHoraireBrut !== undefined) ligneUpdates.tauxHoraireBrut = args.tauxHoraireBrut;
    if (args.augmentationPct !== undefined) ligneUpdates.augmentationPct = args.augmentationPct;
    if (args.actif !== undefined) ligneUpdates.actif = args.actif;
    if (Object.keys(ligneUpdates).length > 0) {
      await ctx.db.patch(args.ligneId, ligneUpdates);
    }
  },
});

export const removeSalarie = mutation({
  args: { salarieId: v.id("salaries") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    // Supprime toutes les lignes de saison liées + l'identité.
    const lignes = await ctx.db
      .query("salairesSaison")
      .withIndex("by_salarie", (q) => q.eq("salarieId", args.salarieId))
      .collect();
    for (const l of lignes) await ctx.db.delete(l._id);
    await ctx.db.delete(args.salarieId);
  },
});

export const updateParametres = mutation({
  args: {
    saison: v.string(),
    margeSecurite: v.number(),
    indemniteCpPct: v.number(),
    mutuelleSalarie: v.number(),
    mutuelleEmployeur: v.number(),
    primeEquipementAnnuelle: v.number(),
    fraisBulletin: v.number(),
    cotisationsSalariales: v.array(cotisSalarialeValidator),
    cotisationsPatronales: v.array(cotisPatronaleValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const { saison, ...rest } = args;
    const existing = await ctx.db
      .query("parametresPaie")
      .withIndex("by_saison", (q) => q.eq("saison", saison))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, rest);
    } else {
      await ctx.db.insert("parametresPaie", { saison, ...rest });
    }
  },
});
