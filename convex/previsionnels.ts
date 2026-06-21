import { authenticatedQuery as query, authenticatedMutation as mutation } from "./customFunctions";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { paginationOptsValidator } from "convex/server";

export const getStats = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const previsionnels = await ctx.db
      .query("previsionnels")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    let total = 0, recettes = 0, depenses = 0, realise = 0;
    const analytiqueIds = new Set<Id<"analytiques">>();

    for (const p of previsionnels) {
      total += p.montant;
      if (p.montant >= 0) recettes += p.montant;
      else depenses += Math.abs(p.montant);
      if (p.etat) realise += p.montant;
      analytiqueIds.add(p.analytiqueId as Id<"analytiques">);
    }

    const uniqueAnalytiques = await Promise.all(
      Array.from(analytiqueIds).map(async (id) => {
        const a = await ctx.db.get(id);
        return { id, nom: a?.nom || "Inconnu" };
      })
    );

    return {
      stats: { total, recettes, depenses, realise },
      uniqueAnalytiques: uniqueAnalytiques.sort((a, b) => a.nom.localeCompare(b.nom)),
    };
  },
});

export const getTrends = query({
  args: { saison: v.string() },
  handler: async (ctx, args) => {
    const previsionnels = await ctx.db
      .query("previsionnels")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison))
      .collect();

    // Mapping ID -> Nom pour analytique
    const anaMap = new Map<string, string>();
    for (const p of previsionnels) {
      if (!anaMap.has(p.analytiqueId)) {
        const a = await ctx.db.get(p.analytiqueId as Id<"analytiques">);
        anaMap.set(p.analytiqueId, a?.nom || "Inconnu");
      }
    }
    for (const t of transactions) {
      if (!anaMap.has(t.analytiqueId)) {
        const a = await ctx.db.get(t.analytiqueId as Id<"analytiques">);
        anaMap.set(t.analytiqueId, a?.nom || "Inconnu");
      }
    }

    const statsByAna: Record<string, { reel: number; prev: number; allRealized: boolean; hasPrev: boolean }> = {};

    previsionnels.forEach(p => {
      const anaName = anaMap.get(p.analytiqueId) || "Inconnu";
      if (!statsByAna[anaName]) statsByAna[anaName] = { reel: 0, prev: 0, allRealized: true, hasPrev: false };
      statsByAna[anaName].prev += p.montant;
      statsByAna[anaName].hasPrev = true;
      if (!p.etat) {
        statsByAna[anaName].allRealized = false;
      }
    });

    transactions.forEach(t => {
      const anaName = anaMap.get(t.analytiqueId) || "Inconnu";
      if (!statsByAna[anaName]) statsByAna[anaName] = { reel: 0, prev: 0, allRealized: false, hasPrev: false };
      statsByAna[anaName].reel += t.realise;
    });

    return Object.entries(statsByAna).map(([anaName, stats]) => {
      return {
        analytiqueNom: anaName,
        reel: stats.reel,
        prev: stats.prev,
        diff: stats.reel - stats.prev,
        allRealized: stats.hasPrev && stats.allRealized,
      };
    }).sort((a, b) => a.analytiqueNom.localeCompare(b.analytiqueNom));
  },
});

export const get = query({
  args: { 
    saison: v.string(),
    paginationOpts: paginationOptsValidator,
    filterAnalytiqueId: v.optional(v.string()),
    filterEtat: v.optional(v.string()) // "Tous", "Réalisé", "Non Réalisé"
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("previsionnels")
      .withIndex("by_saison", (q) => q.eq("saison", args.saison));

    if (args.filterAnalytiqueId && args.filterAnalytiqueId !== "Tous") {
      q = q.filter((q) => q.eq(q.field("analytiqueId"), args.filterAnalytiqueId));
    }
    if (args.filterEtat && args.filterEtat !== "Tous") {
      const isEtatRealise = args.filterEtat === "Réalisé";
      q = q.filter((q) => q.eq(q.field("etat"), isEtatRealise));
    }

    const results = await q.paginate(args.paginationOpts);
    
    const page = await Promise.all(
      results.page.map(async (prev) => {
        let analytiqueNom = "Inconnu";
        if (prev.analytiqueId) {
          const ana = await ctx.db.get(prev.analytiqueId as Id<"analytiques">);
          if (ana) analytiqueNom = ana.nom;
        }
        return {
          ...prev,
          analytiqueNom,
        };
      })
    );

    return { ...results, page };
  },
});

export const add = mutation({
  args: {
    nom: v.string(),
    montant: v.number(),
    etat: v.boolean(),
    analytiqueId: v.id("analytiques"),
    saison: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("previsionnels", {
      nom: args.nom,
      montant: args.montant,
      etat: args.etat,
      analytiqueId: args.analytiqueId,
      saison: args.saison,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("previsionnels"),
    nom: v.optional(v.string()),
    montant: v.optional(v.number()),
    etat: v.optional(v.boolean()),
    analytiqueId: v.optional(v.id("analytiques")),
    saison: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("previsionnels") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
