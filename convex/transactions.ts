import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { paginationOptsValidator } from "convex/server";

function normalizeStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Lire les statistiques et filtres uniques pour une saison
export const getStats = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    let recettes = 0;
    let depenses = 0;
    const tiersIds = new Set<Id<"tiers">>();
    const analytiqueIds = new Set<Id<"analytiques">>();

    for (const t of transactions) {
      if (t.realise >= 0) recettes += t.realise;
      else depenses += Math.abs(t.realise);
      tiersIds.add(t.tiersId as Id<"tiers">);
      analytiqueIds.add(t.analytiqueId as Id<"analytiques">);
    }

    const uniqueTiers = await Promise.all(
      Array.from(tiersIds).map(async (id) => {
        const t = await ctx.db.get(id);
        return { id, nom: t?.nom || "Inconnu" };
      })
    );

    const uniqueAnalytiques = await Promise.all(
      Array.from(analytiqueIds).map(async (id) => {
        const a = await ctx.db.get(id);
        return { id, nom: a?.nom || "Inconnu" };
      })
    );

    return {
      stats: { recettes, depenses, soldeNet: recettes - depenses },
      uniqueTiers: uniqueTiers.sort((a, b) => a.nom.localeCompare(b.nom)),
      uniqueAnalytiques: uniqueAnalytiques.sort((a, b) => a.nom.localeCompare(b.nom)),
    };
  },
});

// Lire toutes les transactions en résolvant les relations Tiers et Analytiques
export const get = query({
  args: { 
    saison: v.string(),
    paginationOpts: paginationOptsValidator,
    filterTiersId: v.optional(v.string()),
    filterAnalytiqueId: v.optional(v.string()),
    searchQuery: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("transactions")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .order("desc");

    // Impossible de filtrer le texte avec .filter (pas de includes) ou search index (casse le tri).
    // Les filtres exacts (Tiers, Analytique) peuvent être appliqués en DB :
    if (args.filterTiersId && args.filterTiersId !== "Tous") {
      q = q.filter((q) => q.eq(q.field("tiersId"), args.filterTiersId));
    }
    if (args.filterAnalytiqueId && args.filterAnalytiqueId !== "Tous") {
      q = q.filter((q) => q.eq(q.field("analytiqueId"), args.filterAnalytiqueId));
    }

    let results;

    if (args.searchQuery && args.searchQuery.trim() !== "") {
      const searchStr = normalizeStr(args.searchQuery.trim());
      const all = await q.collect();
      const filtered = all.filter(t => 
        normalizeStr(t.nom).includes(searchStr) || 
        (t.commentaires && normalizeStr(t.commentaires).includes(searchStr))
      );

      const numItems = args.paginationOpts.numItems;
      const cursor = args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor, 10) : 0;
      const start = isNaN(cursor) ? 0 : cursor;
      const end = start + numItems;

      const pageItems = filtered.slice(start, end);
      const isDone = end >= filtered.length;
      const continueCursor = isDone ? "" : end.toString();
      
      results = { page: pageItems, isDone, continueCursor };
    } else {
      results = await q.paginate(args.paginationOpts);
    }

    const page = await Promise.all(
      results.page.map(async (t) => {
        const tiers = await ctx.db.get(t.tiersId as Id<"tiers">);
        const analytique = await ctx.db.get(t.analytiqueId as Id<"analytiques">);
        return {
          ...t,
          tiersNom: tiers ? tiers.nom : "Inconnu",
          analytiqueNom: analytique ? analytique.nom : "Inconnu",
          typeDocumentNom: t.typeDocumentId 
            ? ((await ctx.db.get(t.typeDocumentId as Id<"typesDocuments">))?.nom || "Inconnu")
            : (t.typeDocument || "Inconnu"),
        };
      })
    );

    return { ...results, page };
  },
});

// Ajouter une nouvelle transaction
export const create = mutation({
  args: {
    nom: v.string(),
    date: v.string(),
    realise: v.number(),
    typeDocument: v.optional(v.string()),
    typeDocumentId: v.optional(v.id("typesDocuments")),
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.id("tiers"),
    analytiqueId: v.id("analytiques"),
    saison: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transactions", {
      nom: args.nom,
      date: args.date,
      realise: args.realise,
      typeDocument: args.typeDocument,
      typeDocumentId: args.typeDocumentId,
      commentaires: args.commentaires,
      lienDrive: args.lienDrive,
      tiersId: args.tiersId,
      analytiqueId: args.analytiqueId,
      saison: args.saison,
    });
  },
});

// Modifier une transaction existante
export const update = mutation({
  args: {
    id: v.id("transactions"),
    nom: v.optional(v.string()),
    date: v.optional(v.string()),
    realise: v.optional(v.number()),
    typeDocument: v.optional(v.string()),
    typeDocumentId: v.optional(v.id("typesDocuments")),
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.optional(v.id("tiers")),
    analytiqueId: v.optional(v.id("analytiques")),
    saison: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Convex gère la mise à jour partielle avec patch
    await ctx.db.patch(id, updates);
  },
});

// Supprimer une transaction
export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
