import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tiers: defineTable({
    nom: v.string(),
  }),

  analytiques: defineTable({
    nom: v.string(),
    description: v.optional(v.string()),
  }),

  previsionnels: defineTable({
    nom: v.string(),
    montant: v.number(),
    etat: v.boolean(),
    analytiqueId: v.id("analytiques"),
  }),

  transactions: defineTable({
    nom: v.string(),
    date: v.string(), // ISO format (ex: '2025-08-19')
    realise: v.number(),
    typeDocument: v.string(), // 'Facture', 'Note de Frais', etc.
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.id("tiers"),
    analytiqueId: v.id("analytiques"),
  }),
});
