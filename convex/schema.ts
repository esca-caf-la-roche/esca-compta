import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

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

  userSettings: defineTable({
    userId: v.id("users"),
    allowedTiles: v.array(v.string()), // ex: ["compta", "paiements"]
    role: v.string(), // "admin" ou "user"
  }).index("by_userId", ["userId"]),

  // --- TABLES POUR SUIVI PAIEMENTS ---

  helloasso_links: defineTable({
    url: v.string(),
    label: v.string(),
    responsible_id: v.id("users"),
    parent_link_id: v.optional(v.id("helloasso_links")),
    is_installment: v.boolean(),
  }),

  groups: defineTable({
    name: v.string(),
    link_id: v.id("helloasso_links"),
  }),

  registrants: defineTable({
    helloasso_payment_id: v.string(),
    helloasso_link_id: v.id("helloasso_links"),
    first_name: v.string(),
    last_name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    payer_first_name: v.string(),
    payer_last_name: v.string(),
    payer_email: v.string(),
    payment_date: v.string(), // ISO format
    amount: v.number(),
    helloasso_status: v.string(),
    synced_at: v.string(), // ISO format
  }).index("by_helloasso_payment_id", ["helloasso_payment_id"]),

  payments_status: defineTable({
    helloasso_payment_id: v.string(), // On l'utilise comme référence mais c'est une string
    dossier_key: v.string(),
    status: v.string(),
    comment: v.optional(v.string()),
    updated_by: v.id("users"),
    updated_at: v.string(), // ISO format
  })
    .index("by_dossier_key", ["dossier_key"])
    .index("by_helloasso_payment_id", ["helloasso_payment_id"]),

  payments_status_history: defineTable({
    helloasso_payment_id: v.string(),
    old_status: v.optional(v.string()),
    new_status: v.string(),
    comment: v.optional(v.string()),
    updated_by: v.id("users"),
    updated_at: v.string(), // ISO format
  }).index("by_helloasso_payment_id", ["helloasso_payment_id"]),

  season_resets: defineTable({
    reset_at: v.string(),
    reset_by: v.id("users"),
  }),
});
