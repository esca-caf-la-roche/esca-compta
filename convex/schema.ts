import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    nom: v.optional(v.string()),
  }).index("by_email", ["email"]),

  otps: defineTable({
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  }).index("by_email", ["email"]),

  tiers: defineTable({
    nom: v.string(),
  }),

  analytiques: defineTable({
    nom: v.string(),
    description: v.optional(v.string()),
  }),

  typesDocuments: defineTable({
    nom: v.string(),
  }),

  saisons: defineTable({
    nom: v.string(), // "2025-26"
    isDefault: v.boolean(),
  }),

  previsionnels: defineTable({
    nom: v.string(),
    montant: v.number(),
    etat: v.boolean(),
    analytiqueId: v.id("analytiques"),
    saison: v.string(),
  }).index("by_saison", ["saison"]),

  transactions: defineTable({
    nom: v.string(),
    date: v.string(), // ISO format (ex: '2025-08-19')
    realise: v.number(),
    typeDocument: v.optional(v.string()), // Ancien champ texte (deprecated)
    typeDocumentId: v.optional(v.id("typesDocuments")), // Nouveau champ relationnel
    commentaires: v.optional(v.string()),
    lienDrive: v.optional(v.string()),
    tiersId: v.id("tiers"),
    analytiqueId: v.id("analytiques"),
    saison: v.string(),
  }).index("by_saison", ["saison"]),
});
