import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { previousSaison } from "./saisonUtils";

const seanceValidator = v.object({
  jour: v.number(), // 0 = Lundi … 6 = Dimanche
  heureDebut: v.string(), // "18:30"
  dureeHeures: v.number(),
});

const moniteurValidator = v.object({
  salarieId: v.id("salaries"),
  nbSemaines: v.number(), // semaines couvertes par ce moniteur dans l'année
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
      moniteurs: c.moniteurs.map((m) => ({
        ...m,
        nom: nomById.get(m.salarieId) ?? "Inconnu",
      })),
    }));
    cours.sort(
      (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom)
    );

    // Heures annuelles calculées par moniteur : Σ (durée hebdo du cours × semaines
    // couvertes par ce moniteur), comparées aux heures saisies dans la masse salariale.
    const heuresParMoniteur = salaries.map((s) => {
      let calculees = 0;
      for (const c of coursDocs) {
        const part = c.moniteurs.find((m) => m.salarieId === s.salarieId);
        if (part) calculees += heuresParSemaine(c.seances) * part.nbSemaines;
      }
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
    moniteurs: v.array(moniteurValidator),
    seances: v.array(seanceValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const nom = args.nom.trim();
    if (!nom) throw new Error("Le nom du cours est obligatoire.");
    if (args.seances.length === 0) {
      throw new Error("Un cours doit comporter au moins une séance.");
    }
    if (args.moniteurs.length === 0) {
      throw new Error("Un cours doit avoir au moins un moniteur.");
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
      moniteurs: args.moniteurs,
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
    moniteurs: v.optional(v.array(moniteurValidator)),
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
    if (args.moniteurs !== undefined) {
      if (args.moniteurs.length === 0) {
        throw new Error("Un cours doit avoir au moins un moniteur.");
      }
      updates.moniteurs = args.moniteurs;
    }
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
        moniteurs: c.moniteurs,
        seances: c.seances,
        ordre: c.ordre,
      });
    }
    return { copiees: prevCours.length, message: `${prevCours.length} cours repris de ${prev}.` };
  },
});

/** Normalise un nom pour le rapprochement (sans accents, minuscule, trim). */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Import en lot du planning (réservé CLI). Les moniteurs sont fournis par prénom et
// rapprochés des `salaries` existants (rapprochement insensible aux accents/casse).
// `npx convex run cours:importPlanning '{"replace":true,"cours":[...]}'`
// Si `saison` est omis, la saison par défaut (table saisons) est utilisée.
export const importPlanning = internalMutation({
  args: {
    saison: v.optional(v.string()),
    replace: v.boolean(),
    cours: v.array(
      v.object({
        nom: v.string(),
        tarifAnnuel: v.number(),
        lienPaiementCB: v.optional(v.string()),
        nbElevesMax: v.number(),
        seances: v.array(seanceValidator),
        moniteurs: v.array(
          v.object({ prenom: v.string(), nbSemaines: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Saison cible : argument explicite ou saison par défaut.
    let saison = args.saison;
    if (!saison) {
      const def = (await ctx.db.query("saisons").collect()).find((s) => s.isDefault);
      if (!def) throw new Error("Aucune saison par défaut définie.");
      saison = def.nom;
    }

    // Index prénom normalisé → salarieId.
    const salaries = await ctx.db.query("salaries").collect();
    const idByName = new Map<string, Id<"salaries">>(
      salaries.map((s) => [normalizeName(s.nom), s._id])
    );
    const resolve = (prenom: string): Id<"salaries"> => {
      const id = idByName.get(normalizeName(prenom));
      if (!id) throw new Error(`Moniteur introuvable dans la masse salariale : "${prenom}".`);
      return id;
    };

    if (args.replace) {
      const existing = await ctx.db
        .query("cours")
        .withIndex("by_saison", (q) => q.eq("saison", saison))
        .collect();
      for (const c of existing) await ctx.db.delete(c._id);
    }

    const baseOrdre = args.replace
      ? 0
      : (await ctx.db
          .query("cours")
          .withIndex("by_saison", (q) => q.eq("saison", saison))
          .collect()).length;

    let created = 0;
    for (const [i, c] of args.cours.entries()) {
      await ctx.db.insert("cours", {
        saison,
        nom: c.nom,
        tarifAnnuel: c.tarifAnnuel,
        lienPaiementCB: c.lienPaiementCB,
        nbElevesMax: c.nbElevesMax,
        moniteurs: c.moniteurs.map((m) => ({
          salarieId: resolve(m.prenom),
          nbSemaines: m.nbSemaines,
        })),
        seances: c.seances,
        ordre: baseOrdre + i,
      });
      created++;
    }
    return { saison, created };
  },
});
