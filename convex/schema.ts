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

  // --- BUDGET PRÉVISIONNEL : MASSE SALARIALE ---
  // Identité d'un salarié (indépendante de la saison).
  salaries: defineTable({
    nom: v.string(),
    typeContrat: v.union(v.literal("CDII"), v.literal("CDI")),
    ordre: v.optional(v.number()),
  }),

  // Paramètres de paie d'un salarié pour une saison donnée.
  salairesSaison: defineTable({
    salarieId: v.id("salaries"),
    saison: v.string(),
    nbHeuresAnnuel: v.number(),
    nbMois: v.number(),
    tauxHoraireBrut: v.number(), // taux brut effectif de la saison
    augmentationPct: v.optional(v.number()), // informatif : hausse vs N-1
    actif: v.optional(v.boolean()),
  })
    .index("by_saison", ["saison"])
    .index("by_salarie", ["salarieId"]),

  // Cours du club (planning) rattachés à un moniteur de la masse salariale.
  // Chaque cours contient une ou plusieurs séances hebdomadaires (jour + horaire +
  // durée propre). Les heures annuelles d'un moniteur sont déduites du planning
  // (Σ durées × nb semaines) et comparées aux heures saisies dans la masse salariale.
  cours: defineTable({
    saison: v.string(),
    nom: v.string(),
    tarifAnnuel: v.number(),
    lienPaiementCB: v.optional(v.string()),
    nbElevesMax: v.number(),
    nbSemaines: v.number(),
    salarieId: v.id("salaries"), // moniteur (masse salariale)
    seances: v.array(
      v.object({
        jour: v.number(), // 0 = Lundi … 6 = Dimanche
        heureDebut: v.string(), // "18:30"
        dureeHeures: v.number(), // 1.5
      })
    ),
    ordre: v.optional(v.number()),
  })
    .index("by_saison", ["saison"])
    .index("by_salarie", ["salarieId"]),

  // Paramètres globaux de paie (cotisations, marges…) par saison.
  parametresPaie: defineTable({
    saison: v.string(),
    margeSecurite: v.number(), // 1.02
    indemniteCpPct: v.number(), // 10 (CDII uniquement)
    mutuelleSalarie: v.number(), // 20
    mutuelleEmployeur: v.number(), // 20
    primeEquipementAnnuelle: v.number(), // 210
    fraisBulletin: v.number(), // 14
    cotisationsSalariales: v.array(
      v.object({ label: v.string(), taux: v.number(), base: v.string() })
    ),
    cotisationsPatronales: v.array(
      v.object({ label: v.string(), taux: v.number() })
    ),
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
  // Modèle relationnel : un "dossier" = une commande HelloAsso (regroupe les
  // échéances 1x/3x). Les transactions sont les paiements individuels remontés
  // de l'API. Les groupes sont reliés aux liens en many-to-many (group_links).

  helloasso_links: defineTable({
    url: v.string(),
    label: v.string(),
    responsible_id: v.optional(v.id("users")), // responsable assigné (null = aucun)
    is_installment: v.boolean(), // lien de paiement fractionné (3x)
  }),

  groups: defineTable({
    name: v.string(),
    requires_approval: v.boolean(), // groupe "sous approbation du moniteur"
  }),

  // Liaison many-to-many entre groupes et liens HelloAsso
  group_links: defineTable({
    group_id: v.id("groups"),
    link_id: v.id("helloasso_links"),
  })
    .index("by_group", ["group_id"])
    .index("by_link", ["link_id"]),

  // Un dossier = une commande HelloAsso (clé naturelle = dossier_id = order.id)
  dossiers: defineTable({
    dossier_id: v.string(), // identifiant de commande HelloAsso (clé naturelle)
    helloasso_link_id: v.id("helloasso_links"),
    first_name: v.string(), // inscrit
    last_name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    payer_first_name: v.string(), // payeur
    payer_last_name: v.string(),
    payer_email: v.string(),
    total_amount: v.number(),
    // --- statut local (décision de l'encadrant) ---
    local_status: v.optional(v.string()), // null/undefined = "À traiter"
    comment: v.optional(v.string()),
    updated_by: v.optional(v.id("users")),
    updated_at: v.optional(v.string()), // ISO format
  })
    .index("by_dossier_id", ["dossier_id"])
    .index("by_link", ["helloasso_link_id"]),

  // Transactions HelloAsso individuelles (échéances + remboursements)
  helloasso_transactions: defineTable({
    helloasso_payment_id: v.string(), // clé naturelle (id paiement ou refund-<id>)
    dossier_id: v.string(), // → dossiers.dossier_id
    amount: v.number(),
    payment_date: v.string(), // ISO format
    helloasso_status: v.string(), // "Authorized" | "Refunded" | …
    synced_at: v.string(), // ISO format
    payment_receipt_url: v.optional(v.string()),
    fiscal_receipt_url: v.optional(v.string()),
  })
    .index("by_payment_id", ["helloasso_payment_id"])
    .index("by_dossier", ["dossier_id"]),

  // Élèves autorisés à s'inscrire dans les groupes "sous approbation"
  approved_students: defineTable({
    first_name: v.string(),
    last_name: v.string(),
    email: v.string(),
    group_id: v.id("groups"),
  }).index("by_group", ["group_id"]),

  // Liste d'attente générale (détection par e-mail sur la page validation)
  waiting_students: defineTable({
    first_name: v.string(),
    last_name: v.string(),
    email: v.string(),
  }),

  season_resets: defineTable({
    reset_at: v.string(),
    reset_by: v.id("users"),
  }),
});
