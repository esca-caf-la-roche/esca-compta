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

/** Répartit les semaines du cours entre ses moniteurs : nbSemaines / nb moniteurs.
 *  La virgule est admise (prévisionnel). Pour un seul moniteur => toutes les semaines. */
function repartirMoniteurs(
  salarieIds: Id<"salaries">[],
  nbSemaines: number
): Array<{ salarieId: Id<"salaries">; nbSemaines: number }> {
  const n = salarieIds.length;
  const part = n > 0 ? nbSemaines / n : 0;
  return salarieIds.map((salarieId) => ({ salarieId, nbSemaines: part }));
}

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

type Seance = { jour: number; heureDebut: string; dureeHeures: number };

/** Aligne les séances d'un créneau « cible » sur un modèle (même nombre de séances
 *  et mêmes durées que `modele`) tout en conservant les jours/horaires propres de la
 *  cible quand ils existent. Sert à la cascade par type de cours. */
function alignerSeances(modele: Seance[], cible: Seance[]): Seance[] {
  return modele.map((m, i) => ({
    jour: cible[i]?.jour ?? m.jour,
    heureDebut: cible[i]?.heureDebut ?? m.heureDebut,
    dureeHeures: m.dureeHeures,
  }));
}

/** Propage les attributs « type de cours » (tarif, élèves max, semaines, gabarit de
 *  séances) à tous les autres créneaux de même nom dans la saison. Chaque créneau
 *  garde ses propres jours/horaires et ses moniteurs. */
async function cascadeTypeCours(
  ctx: MutationCtx,
  saison: string,
  nom: string,
  exclureId: Id<"cours">,
  shared: { tarifAnnuel: number; nbElevesMax: number; nbSemaines: number; seances: Seance[]; competition: boolean }
): Promise<number> {
  const siblings = (await ctx.db
    .query("cours")
    .withIndex("by_saison", (q) => q.eq("saison", saison))
    .collect()).filter((c) => c._id !== exclureId && c.nom === nom);

  for (const sib of siblings) {
    await ctx.db.patch(sib._id, {
      tarifAnnuel: shared.tarifAnnuel,
      nbElevesMax: shared.nbElevesMax,
      nbSemaines: shared.nbSemaines,
      competition: shared.competition,
      seances: alignerSeances(shared.seances, sib.seances),
      // Le nb de semaines a pu changer => on redistribue entre les moniteurs du créneau.
      moniteurs: repartirMoniteurs(sib.moniteurs.map((m) => m.salarieId), shared.nbSemaines),
    });
  }
  return siblings.length;
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
      // nb semaines effectif : champ « type de cours » sinon somme des moniteurs.
      nbSemaines: c.nbSemaines ?? c.moniteurs.reduce((a, m) => a + m.nbSemaines, 0),
      competition: c.competition ?? false,
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
    nbSemaines: v.number(),
    competition: v.optional(v.boolean()),
    moniteurs: v.array(v.id("salaries")), // liste de moniteurs ; semaines réparties auto
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

    const tousCours = await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    // Cascade « type de cours » : si un créneau de même nom existe déjà, le nouveau
    // hérite de son gabarit (tarif, élèves max, semaines, durées/nombre de séances)
    // pour garantir des valeurs « toujours identiques ». Jours/horaires/moniteurs
    // restent ceux saisis.
    const modele = tousCours.find((c) => c.nom === nom);
    const tarifAnnuel = modele ? modele.tarifAnnuel : args.tarifAnnuel;
    const nbElevesMax = modele ? modele.nbElevesMax : args.nbElevesMax;
    const nbSemaines = modele ? (modele.nbSemaines ?? args.nbSemaines) : args.nbSemaines;
    const competition = modele ? (modele.competition ?? false) : (args.competition ?? false);
    const seances = modele ? alignerSeances(modele.seances, args.seances) : args.seances;

    return await ctx.db.insert("cours", {
      saison: args.saison,
      nom,
      tarifAnnuel,
      lienPaiementCB: args.lienPaiementCB?.trim() || undefined,
      nbElevesMax,
      nbSemaines,
      competition,
      moniteurs: repartirMoniteurs(args.moniteurs, nbSemaines),
      seances,
      ordre: tousCours.length,
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
    competition: v.optional(v.boolean()),
    moniteurs: v.optional(v.array(v.id("salaries"))),
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
    if (args.competition !== undefined) updates.competition = args.competition;
    if (args.seances !== undefined) {
      if (args.seances.length === 0) {
        throw new Error("Un cours doit comporter au moins une séance.");
      }
      updates.seances = args.seances;
    }

    // Moniteurs : nouvelle liste fournie, ou liste existante si seul le nb de semaines
    // change. Dans les deux cas on redistribue les semaines (auto).
    const nbSemainesFinal =
      args.nbSemaines ?? cours.nbSemaines ?? cours.moniteurs.reduce((a, m) => a + m.nbSemaines, 0);
    const salarieIds =
      args.moniteurs !== undefined ? args.moniteurs : cours.moniteurs.map((m) => m.salarieId);
    if (args.moniteurs !== undefined && args.moniteurs.length === 0) {
      throw new Error("Un cours doit avoir au moins un moniteur.");
    }
    if (args.moniteurs !== undefined || args.nbSemaines !== undefined) {
      updates.moniteurs = repartirMoniteurs(salarieIds, nbSemainesFinal);
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.coursId, updates);
    }

    // Cascade « type de cours » : les autres créneaux de même nom adoptent le tarif,
    // les élèves max, les semaines et le gabarit de séances (durées + nombre), en
    // conservant leurs propres jours/horaires et moniteurs.
    const nomFinal = (updates.nom as string | undefined) ?? cours.nom;
    const finalCours = await ctx.db.get(args.coursId);
    if (finalCours) {
      await cascadeTypeCours(ctx, finalCours.saison, nomFinal, args.coursId, {
        tarifAnnuel: finalCours.tarifAnnuel,
        nbElevesMax: finalCours.nbElevesMax,
        nbSemaines: finalCours.nbSemaines ?? finalCours.moniteurs.reduce((a, m) => a + m.nbSemaines, 0),
        competition: finalCours.competition ?? false,
        seances: finalCours.seances,
      });
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

// Modifie les attributs d'un TYPE de cours (tous les créneaux de même nom dans la
// saison) : tarif, élèves max, nb semaines. Le nb de semaines est redistribué entre
// les moniteurs de chaque créneau. C'est le « vrai » système de cascade du tableau
// par type de cours.
export const updateTypeCours = mutation({
  args: {
    saison: v.string(),
    nom: v.string(),
    tarifAnnuel: v.number(),
    nbElevesMax: v.number(),
    nbSemaines: v.number(),
    competition: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const creneaux = (await ctx.db
      .query("cours")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect()).filter((c) => c.nom === args.nom);

    for (const c of creneaux) {
      await ctx.db.patch(c._id, {
        tarifAnnuel: args.tarifAnnuel,
        nbElevesMax: args.nbElevesMax,
        nbSemaines: args.nbSemaines,
        ...(args.competition !== undefined ? { competition: args.competition } : {}),
        moniteurs: repartirMoniteurs(c.moniteurs.map((m) => m.salarieId), args.nbSemaines),
      });
    }
    return { modifies: creneaux.length };
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
        competition: c.competition,
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
        nbSemaines: v.number(),
        competition: v.optional(v.boolean()),
        seances: v.array(seanceValidator),
        // Liste de prénoms ; les semaines sont réparties automatiquement.
        moniteurs: v.array(v.object({ prenom: v.string() })),
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
        nbSemaines: c.nbSemaines,
        competition: c.competition ?? false,
        moniteurs: repartirMoniteurs(
          c.moniteurs.map((m) => resolve(m.prenom)),
          c.nbSemaines
        ),
        seances: c.seances,
        ordre: baseOrdre + i,
      });
      created++;
    }
    return { saison, created };
  },
});
