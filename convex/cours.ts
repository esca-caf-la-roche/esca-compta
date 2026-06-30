import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { previousSaison } from "./saisonUtils";

const seanceValidator = v.object({
  jour: v.number(), // 0 = Lundi … 6 = Dimanche
  heureDebut: v.string(), // "18:30"
  dureeHeures: v.number(),
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

/** Total d'heures hebdomadaires d'un cours (somme des durées de ses séances). */
function heuresParSemaine(seances: Array<{ dureeHeures: number }>): number {
  return seances.reduce((acc, s) => acc + s.dureeHeures, 0);
}

export const getPlanning = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const coursDocs = await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    // Saison précédente : sert à proposer/déclencher la reprise quand la saison
    // courante est vide (même logique que la masse salariale).
    const prev = previousSaison(args.saison);
    const prevCoursCount = prev
      ? (await ctx.db
          .query("cours")
          .withIndex("by_saison", (q) => q.eq("saison", prev))
          .collect()).length
      : 0;

    // Moniteurs de la saison (jointure salairesSaison → salaries), comme dans
    // paie.getMasseSalariale : sert au <select> moniteur et aux heures de référence.
    const lignes = await ctx.db
      .query("salairesSaison")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    const salaries = await Promise.all(
      lignes.map(async (ligne) => {
        const salarie = await ctx.db.get(ligne.salarieId);
        return {
          salarieId: ligne.salarieId,
          nom: salarie?.nom ?? "Inconnu",
          typeContrat: salarie?.typeContrat ?? "CDII",
          ordre: salarie?.ordre ?? 0,
          nbHeuresAnnuel: ligne.nbHeuresAnnuel,
        };
      })
    );
    salaries.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));

    const nomById = new Map(salaries.map((s) => [s.salarieId, s.nom]));

    const cours = coursDocs.map((c) => ({
      ...c,
      moniteurNom: nomById.get(c.salarieId) ?? "Inconnu",
    }));
    cours.sort(
      (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom)
    );

    // Heures annuelles calculées par moniteur (Σ durées séances × nb semaines),
    // comparées aux heures saisies dans la masse salariale.
    const heuresParMoniteur = salaries.map((s) => {
      const calculees = coursDocs
        .filter((c) => c.salarieId === s.salarieId)
        .reduce((acc, c) => acc + heuresParSemaine(c.seances) * c.nbSemaines, 0);
      return {
        salarieId: s.salarieId,
        nom: s.nom,
        typeContrat: s.typeContrat,
        calculees,
        saisies: s.nbHeuresAnnuel,
      };
    });

    return { cours, salaries, heuresParMoniteur, prevSaison: prev, prevCoursCount };
  },
});

export const addCours = mutation({
  args: {
    saison: v.string(),
    nom: v.string(),
    tarifAnnuel: v.number(),
    lienPaiementCB: v.optional(v.string()),
    nbElevesMax: v.number(),
    nbSemaines: v.number(),
    salarieId: v.id("salaries"),
    seances: v.array(seanceValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const nom = args.nom.trim();
    if (!nom) throw new Error("Le nom du cours est obligatoire.");
    if (args.seances.length === 0) {
      throw new Error("Un cours doit comporter au moins une séance.");
    }

    const count = (await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect()).length;

    return await ctx.db.insert("cours", {
      saison: args.saison,
      nom,
      tarifAnnuel: args.tarifAnnuel,
      lienPaiementCB: args.lienPaiementCB?.trim() || undefined,
      nbElevesMax: args.nbElevesMax,
      nbSemaines: args.nbSemaines,
      salarieId: args.salarieId,
      seances: args.seances,
      ordre: count,
    });
  },
});

export const updateCours = mutation({
  args: {
    coursId: v.id("cours"),
    nom: v.optional(v.string()),
    tarifAnnuel: v.optional(v.number()),
    lienPaiementCB: v.optional(v.string()),
    nbElevesMax: v.optional(v.number()),
    nbSemaines: v.optional(v.number()),
    salarieId: v.optional(v.id("salaries")),
    seances: v.optional(v.array(seanceValidator)),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const cours = await ctx.db.get(args.coursId);
    if (!cours) throw new Error("Cours introuvable.");

    const updates: Record<string, unknown> = {};
    if (args.nom !== undefined) {
      const nom = args.nom.trim();
      if (!nom) throw new Error("Le nom du cours est obligatoire.");
      updates.nom = nom;
    }
    if (args.tarifAnnuel !== undefined) updates.tarifAnnuel = args.tarifAnnuel;
    if (args.lienPaiementCB !== undefined)
      updates.lienPaiementCB = args.lienPaiementCB.trim() || undefined;
    if (args.nbElevesMax !== undefined) updates.nbElevesMax = args.nbElevesMax;
    if (args.nbSemaines !== undefined) updates.nbSemaines = args.nbSemaines;
    if (args.salarieId !== undefined) updates.salarieId = args.salarieId;
    if (args.seances !== undefined) {
      if (args.seances.length === 0) {
        throw new Error("Un cours doit comporter au moins une séance.");
      }
      updates.seances = args.seances;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.coursId, updates);
    }
  },
});

export const removeCours = mutation({
  args: { coursId: v.id("cours") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    await ctx.db.delete(args.coursId);
  },
});

// Reprend (copie) le planning de la saison précédente dans `saison` : mêmes cours,
// mêmes moniteurs, mêmes séances/tarifs. N'agit que si la saison cible est vide.
// Même logique que paie.reprendreSaisonPrecedente pour la masse salariale.
export const reprendrePlanningSaisonPrecedente = mutation({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);

    const prev = previousSaison(args.saison);
    if (!prev) throw new Error("Saison invalide (format attendu : AAAA-AA).");

    const dejaPresent = await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .first();
    if (dejaPresent) {
      return { copiees: 0, message: `Un planning existe déjà pour ${args.saison}.` };
    }

    const prevCours = await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", prev))
      .collect();
    if (prevCours.length === 0) {
      return { copiees: 0, message: `Aucun cours à reprendre pour la saison ${prev}.` };
    }

    for (const c of prevCours) {
      await ctx.db.insert("cours", {
        saison: args.saison,
        nom: c.nom,
        tarifAnnuel: c.tarifAnnuel,
        lienPaiementCB: c.lienPaiementCB,
        nbElevesMax: c.nbElevesMax,
        nbSemaines: c.nbSemaines,
        salarieId: c.salarieId,
        seances: c.seances,
        ordre: c.ordre,
      });
    }
    return { copiees: prevCours.length, message: `${prevCours.length} cours repris de ${prev}.` };
  },
});
