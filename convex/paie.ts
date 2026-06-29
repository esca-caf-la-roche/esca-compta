import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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

// Salariés issus de l'Excel (valeurs vérifiées) pour l'initialisation.
const SEED_SALARIES: Array<{
  nom: string;
  typeContrat: "CDII" | "CDI";
  nbHeuresAnnuel: number;
  nbMois: number;
  tauxHoraireBrut: number;
  augmentationPct: number;
}> = [
  { nom: "Clémentine", typeContrat: "CDII", nbHeuresAnnuel: 740, nbMois: 12, tauxHoraireBrut: 20.25, augmentationPct: 3 },
  { nom: "David", typeContrat: "CDII", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 22.61, augmentationPct: 3 },
  { nom: "Raphaël", typeContrat: "CDII", nbHeuresAnnuel: 760, nbMois: 10, tauxHoraireBrut: 22.76, augmentationPct: 3 },
  { nom: "Stéphane", typeContrat: "CDII", nbHeuresAnnuel: 280, nbMois: 12, tauxHoraireBrut: 20.25, augmentationPct: 3 },
  { nom: "Nicolas", typeContrat: "CDII", nbHeuresAnnuel: 180, nbMois: 12, tauxHoraireBrut: 21.32, augmentationPct: 3 },
  { nom: "Jérôme", typeContrat: "CDI", nbHeuresAnnuel: 1426.58, nbMois: 12, tauxHoraireBrut: 21.6, augmentationPct: 9.65 },
  { nom: "Gael", typeContrat: "CDI", nbHeuresAnnuel: 1071.09, nbMois: 12, tauxHoraireBrut: 21.6, augmentationPct: 0 },
];

/** Saison précédente au format "YYYY-YY" (ex: "2025-26" -> "2024-25"). */
function previousSaison(saison: string): string | null {
  const m = saison.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const start = parseInt(m[1], 10) - 1;
  const end = (start + 1) % 100;
  return `${start}-${end.toString().padStart(2, "0")}`;
}

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

    // Lignes de la saison précédente (pour calculer l'augmentation vs N-1).
    const prevSaison = previousSaison(args.saison);
    const prevLignes = prevSaison
      ? await ctx.db
          .query("salairesSaison")
          .withIndex("by_saison", (q) => q.eq("saison", prevSaison))
          .collect()
      : [];
    const prevTauxBySalarie = new Map<string, number>();
    for (const l of prevLignes) prevTauxBySalarie.set(l.salarieId, l.tauxHoraireBrut);

    const salaries = await Promise.all(
      lignes.map(async (ligne) => {
        const salarie = await ctx.db.get(ligne.salarieId);
        const tauxPrecedent = prevTauxBySalarie.get(ligne.salarieId) ?? null;
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
          tauxPrecedent,
        };
      })
    );

    salaries.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));

    return { params, salaries, prevSaison };
  },
});

export const seedMasseSalariale = mutation({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    // Paramètres : créés seulement s'ils n'existent pas pour la saison.
    const existingParams = await ctx.db
      .query("parametresPaie")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .first();
    if (!existingParams) {
      await ctx.db.insert("parametresPaie", { saison: args.saison, ...DEFAULT_PARAMS });
    }

    // Salariés + lignes de saison : on ne crée que ceux qui manquent.
    const existingLignes = await ctx.db
      .query("salairesSaison")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();
    if (existingLignes.length > 0) {
      return { created: 0, message: "Données déjà présentes pour cette saison." };
    }

    const allSalaries = await ctx.db.query("salaries").collect();
    let created = 0;
    for (let i = 0; i < SEED_SALARIES.length; i++) {
      const s = SEED_SALARIES[i];
      let salarie = allSalaries.find((x) => x.nom === s.nom);
      let salarieId: Id<"salaries">;
      if (salarie) {
        salarieId = salarie._id;
      } else {
        salarieId = await ctx.db.insert("salaries", {
          nom: s.nom,
          typeContrat: s.typeContrat,
          ordre: i,
        });
      }
      await ctx.db.insert("salairesSaison", {
        salarieId,
        saison: args.saison,
        nbHeuresAnnuel: s.nbHeuresAnnuel,
        nbMois: s.nbMois,
        tauxHoraireBrut: s.tauxHoraireBrut,
        augmentationPct: s.augmentationPct,
        actif: true,
      });
      created++;
    }
    return { created, message: `${created} salariés initialisés.` };
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
