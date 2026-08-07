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
    // true = ligne de compétition (étiquette + filtre). false/absent = loisir.
    competition: v.optional(v.boolean()),
    // true = ligne d'inscription générée automatiquement depuis le planning des cours
    // (1 par analytique). Recalculée à chaque changement de cours, non modifiable à la
    // main. false/absent = ligne saisie manuellement.
    auto: v.optional(v.boolean()),
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
    nbHeuresAnnuel: v.number(), // legacy : heures manuelles, conservées pour les saisons sans planning
    nbMois: v.number(),
    tauxHoraireBrut: v.number(), // taux brut effectif de la saison
    augmentationPct: v.optional(v.number()), // informatif : hausse vs N-1
    actif: v.optional(v.boolean()),
    // Heures supplémentaires déclarées (hors cours) : stages, remplacements… Chacune
    // porte une désignation et un indicateur compétition pour la ventilation.
    heuresSup: v.optional(
      v.array(
        v.object({
          designation: v.string(),
          nbHeures: v.number(),
          // true = heures de compétition, false/absent = loisir.
          competition: v.optional(v.boolean()),
        })
      )
    ),
  })
    .index("by_saison", ["saison"])
    .index("by_salarie", ["salarieId"]),

  // Cours du club (planning) rattachés à un ou plusieurs moniteurs de la masse
  // salariale. Chaque cours contient une ou plusieurs séances hebdomadaires (jour +
  // horaire + durée propre). Plusieurs moniteurs peuvent se répartir l'année : chacun
  // couvre `nbSemaines` séances. Les heures annuelles d'un moniteur sont déduites du
  // planning (Σ durées séances × nbSemaines du moniteur) et comparées aux heures
  // saisies dans la masse salariale.
  cours: defineTable({
    saison: v.string(),
    nom: v.string(),
    tarifAnnuel: v.number(),
    lienPaiementCB: v.optional(v.string()),
    nbElevesMax: v.number(),
    // Indicateur compétition du type de cours (cascade comme le tarif). Détermine la
    // ventilation des heures/coûts en masse salariale loisir vs compétition.
    // true = compétition, false/absent = loisir.
    competition: v.optional(v.boolean()),
    // Analytique rattachée au TYPE de cours (cascade comme le tarif/compétition).
    // Sert à générer automatiquement les lignes d'inscription du prévisionnel : tous
    // les créneaux d'un même type partagent la même analytique. Optionnel.
    analytiqueId: v.optional(v.id("analytiques")),
    // Nombre de semaines du cours (niveau « type de cours »). Partagé par cascade
    // entre tous les créneaux de même nom. Optionnel : à défaut, on retombe sur la
    // somme des semaines des moniteurs.
    nbSemaines: v.optional(v.number()),
    moniteurs: v.array(
      v.object({
        salarieId: v.id("salaries"),
        nbSemaines: v.number(), // semaines couvertes par ce moniteur dans l'année
      })
    ),
    seances: v.array(
      v.object({
        jour: v.number(), // 0 = Lundi … 6 = Dimanche
        heureDebut: v.string(), // "18:30"
        dureeHeures: v.number(), // 1.5
      })
    ),
    ordre: v.optional(v.number()),
  }).index("by_saison", ["saison"]),

  // Effectifs saisis pour la synthèse « coût par membre » du budget prévisionnel.
  // Le nombre de membres loisir (élèves en cours + abonnements) est saisi à la main ;
  // le nombre de membres compétition est calculé depuis les types de cours.
  budgetEffectifs: defineTable({
    saison: v.string(),
    nbMembresLoisir: v.number(),
  }).index("by_saison", ["saison"]),

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
    // Autorisation nominative, réservée à un administrateur général ayant la
    // tuile Abonnements, pour l'opération destructive de fin de campagne.
    // Optionnel pendant la migration : l'absence vaut refus côté serveur.
    canResetAboSeason: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  // SAISON-EXEMPT: préférences globales d'affichage du tableau de bord,
  // communes à tous les membres du staff et indépendantes d'une saison.
  dashboardConfiguration: defineTable({
    cle: v.literal("global"),
    // La position dans le tableau définit l'ordre d'affichage.
    tiles: v.array(
      v.object({
        id: v.union(
          v.literal("compta"),
          v.literal("paiements"),
          v.literal("budget"),
          v.literal("abonnements"),
          v.literal("licences_cours"),
          v.literal("contacts_cours"),
          v.literal("remboursements_eleves"),
        ),
        color: v.union(
          v.literal("bg-info"),
          v.literal("bg-success"),
          v.literal("bg-warning"),
          v.literal("bg-primary"),
          v.literal("bg-danger"),
          v.literal("bg-orange"),
          v.literal("bg-pink"),
          v.literal("bg-purple"),
          v.literal("bg-lime"),
        ),
        // Facultatifs pour conserver les configurations déjà enregistrées.
        // En leur absence, le frontend utilise le libellé/la description métier.
        label: v.optional(v.string()),
        description: v.optional(v.string()),
      }),
    ),
  }).index("by_cle", ["cle"]),

  // --- TABLES POUR SUIVI PAIEMENTS ---
  // Modèle relationnel : un "dossier" = une commande HelloAsso (regroupe les
  // échéances 1x/3x). Les transactions sont les paiements individuels remontés
  // de l'API. Les groupes sont reliés aux liens en many-to-many (group_links).

  helloasso_links: defineTable({
    url: v.string(),
    label: v.string(),
    responsible_id: v.optional(v.id("users")), // responsable assigné (null = aucun)
    is_installment: v.boolean(), // lien de paiement fractionné (3x)
    // Distingue le lien du formulaire abonnements de ceux des cours : la sync
    // partagée (convex/helloasso.ts) traite tous les liens, mais chaque module
    // (paiements cours vs abonnements) ne doit lire/gérer QUE les siens.
    // undefined = cours (valeur historique), "abonnement" = posé par convex/abo/paiements.ts.
    type: v.optional(v.union(v.literal("cours"), v.literal("abonnement"))),
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

  // SAISON-EXEMPT: suivi opérationnel d'une commande du formulaire
  // Abonnements. Il est indépendant de la saison comptable et ne partage
  // jamais les décisions manuelles des paiements cours (`dossiers`).
  abo_paiements_suivi: defineTable({
    dossier_id: v.id("dossiers"),
    statut: v.union(
      v.literal("a_traiter"),
      v.literal("traite"),
      v.literal("rembourse"),
      v.literal("en_attente"),
    ),
    commentaire: v.optional(v.string()),
    updated_by: v.id("users"),
    updated_at: v.string(),
  }).index("by_dossier_id", ["dossier_id"]),

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

  // ===================================================================
  // REMBOURSEMENTS ÉLÈVES
  // Cette tuile suit des demandes transverses jusqu'à leur paiement, puis
  // conserve leurs archives indépendamment des saisons comptables.
  // ===================================================================

  // SAISON-EXEMPT: une demande reste active jusqu'au paiement complet et son
  // archive doit rester consultable sans dépendre de la saison sélectionnée.
  remboursements_demandes: defineTable({
    reference: v.string(),
    typeFormulaire: v.union(
      v.literal("competition"),
      v.literal("stage"),
    ),
    libelle: v.string(),
    dateEvenement: v.optional(v.string()),
    description: v.optional(v.string()),
    calcul: v.union(
      v.object({
        type: v.literal("total_reparti"),
        montantTotalCentimes: v.number(),
      }),
      v.object({
        type: v.literal("prix_fixe_personne"),
        prixParPersonneCentimes: v.number(),
      }),
    ),
    statut: v.union(v.literal("active"), v.literal("archivee")),
    createdAt: v.string(),
    createdBy: v.id("users"),
    updatedAt: v.string(),
    updatedBy: v.id("users"),
    archivedAt: v.optional(v.string()),
    archivedBy: v.optional(v.id("users")),
    annuleeAt: v.optional(v.string()),
    annuleeBy: v.optional(v.id("users")),
    motifAnnulation: v.optional(v.string()),
  })
    .index("by_reference", ["reference"])
    .index("by_statut", ["statut"])
    .index("by_typeFormulaire_and_statut", ["typeFormulaire", "statut"]),

  // SAISON-EXEMPT: le snapshot identitaire fige le bénéficiaire au moment de
  // la demande, même si le snapshot global des élèves change ensuite.
  remboursements_beneficiaires: defineTable({
    demandeId: v.id("remboursements_demandes"),
    sourceEleveId: v.optional(v.id("abo_eleves_en_cours")),
    nom: v.string(),
    prenom: v.string(),
    parent1Nom: v.optional(v.string()),
    parent1Prenom: v.optional(v.string()),
    parent2Nom: v.optional(v.string()),
    parent2Prenom: v.optional(v.string()),
    email: v.optional(v.string()),
    licence: v.optional(v.string()),
    cours: v.optional(v.string()),
    horaire: v.optional(v.string()),
    montantDuCentimes: v.number(),
    createdAt: v.string(),
    createdBy: v.id("users"),
    updatedAt: v.string(),
    updatedBy: v.id("users"),
  })
    .index("by_demandeId", ["demandeId"])
    .index("by_sourceEleveId", ["sourceEleveId"]),

  // SAISON-EXEMPT: cache courant des deux formulaires HelloAsso fixes,
  // synchronisé uniquement à l'ouverture de la tuile.
  remboursements_helloasso_paiements: defineTable({
    typeFormulaire: v.union(
      v.literal("competition"),
      v.literal("stage"),
    ),
    helloassoPaymentId: v.string(),
    payeurNom: v.string(),
    payeurPrenom: v.string(),
    payeurEmail: v.string(),
    participantNom: v.optional(v.string()),
    participantPrenom: v.optional(v.string()),
    participantEmail: v.optional(v.string()),
    amountCentimes: v.number(),
    statut: v.union(
      v.literal("authorized"),
      v.literal("pending"),
      v.literal("refused"),
      v.literal("canceled"),
      v.literal("refunded"),
      v.literal("unknown"),
    ),
    datePaiement: v.string(),
    syncedAt: v.string(),
    archivedAt: v.optional(v.string()),
    archivedBy: v.optional(v.id("users")),
  })
    .index("by_helloassoPaymentId", ["helloassoPaymentId"])
    .index("by_typeFormulaire_and_datePaiement", [
      "typeFormulaire",
      "datePaiement",
    ])
    .index("by_typeFormulaire_and_statut_and_datePaiement", [
      "typeFormulaire",
      "statut",
      "datePaiement",
    ]),

  // SAISON-EXEMPT: rapprochement durable entre une archive métier et le cache
  // HelloAsso transversal. L'unicité d'un paiement est imposée en mutation.
  remboursements_rapprochements: defineTable({
    beneficiaireId: v.id("remboursements_beneficiaires"),
    paiementId: v.id("remboursements_helloasso_paiements"),
    rapprocheAt: v.string(),
    rapprocheBy: v.id("users"),
  })
    .index("by_beneficiaireId", ["beneficiaireId"])
    .index("by_paiementId", ["paiementId"]),

  // SAISON-EXEMPT: journal d'audit des préparations d'e-mails rattaché aux
  // demandes, conservé avec leurs archives indépendamment des saisons.
  remboursements_email_log: defineTable({
    demandeId: v.id("remboursements_demandes"),
    beneficiaireId: v.id("remboursements_beneficiaires"),
    typeEmail: v.union(v.literal("initial"), v.literal("relance")),
    destinataire: v.string(),
    preparedAt: v.string(),
    preparedBy: v.id("users"),
  })
    .index("by_demandeId", ["demandeId"])
    .index("by_demandeId_and_preparedAt", ["demandeId", "preparedAt"])
    .index("by_beneficiaireId", ["beneficiaireId"]),

  // ===================================================================
  // MODULE ABONNEMENTS ESCALADE (portage de abo-esca-new / Supabase)
  // Toutes les tables sont préfixées `abo_` pour éviter la collision avec
  // la table `dossiers` (commandes HelloAsso des cours) déjà présente.
  // Réf. module : docs/5-module-abonnements.md (spec source abo-esca-new supprimée)
  // Pas de RLS/triggers/vues en Convex : la sécurité et la normalisation
  // (nom_prenom_normalise, canonisation licence) sont portées dans les
  // endpoints/mutations (voir convex/abo/*).
  // ===================================================================

  // Profil applicatif d'un abonné public (role toujours "utilisateur").
  // Les admins abo sont des comptes staff avec la tuile "abonnements" cochée
  // (userSettings.allowedTiles) : getAboIdentity() dérive leur rôle côté serveur.
  // Un staff peut aussi avoir un abo_profiles pour déposer sa demande personnelle.
  // Le rôle admin ne donne pas ce droit.
  abo_profiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    role: v.union(v.literal("utilisateur"), v.literal("admin")),
    prenom: v.optional(v.string()),
    nom: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  // Dossier de demande, regroupé par email (1 dossier par compte).
  abo_dossiers: defineTable({
    email: v.string(),
    statut_dossier: v.union(
      v.literal("nouvelle_demande"),
      v.literal("validee"),
      v.literal("liste_attente"),
      v.literal("refusee"),
      v.literal("complete"),
    ),
    date_soumission: v.string(),
    date_validation: v.optional(v.string()),
    commentaire: v.optional(v.string()),
    owner_id: v.id("users"),
  })
    .index("by_owner", ["owner_id"])
    .index("by_email", ["email"]),

  // Personnes rattachées à un dossier ; portent les 8 étapes (CDC §5.1).
  abo_personnes: defineTable({
    dossier_id: v.id("abo_dossiers"),
    nom: v.string(),
    prenom: v.string(),
    nom_prenom_normalise: v.string(),
    age: v.optional(v.number()),
    licence: v.optional(v.string()), // canonique (12 chiffres)
    licence_statut: v.union(
      v.literal("saisie"),
      v.literal("annuaire_auto"),
      v.literal("annuaire_valide"),
      v.literal("inconnu"),
    ),
    etape_demande: v.boolean(),
    etape_validation: v.union(
      v.literal("en_attente"),
      v.literal("validee"),
      v.literal("liste_attente"),
      v.literal("refusee"),
    ),
    etape_licence: v.boolean(),
    // NULL tant que l'âge est inconnu (scrap) ; sinon non_requis/requis/valide.
    etape_test_autonomie: v.optional(
      v.union(
        v.literal("non_requis"),
        v.literal("requis"),
        v.literal("valide"),
      ),
    ),
    etape_inscription_site: v.boolean(),
    etape_photo: v.boolean(),
    etape_paiement: v.boolean(),
    etape_abonnement_valide: v.boolean(),
  })
    .index("by_dossier", ["dossier_id"])
    .index("by_nom_prenom_normalise", ["nom_prenom_normalise"])
    .index("by_licence", ["licence"]),

  // Fil de discussion par dossier (un fil partagé user ↔ admins), temps réel.
  abo_messages: defineTable({
    dossier_id: v.id("abo_dossiers"),
    auteur_id: v.id("users"),
    auteur_role: v.union(v.literal("utilisateur"), v.literal("admin")),
    contenu: v.string(),
    lu_par_admin: v.boolean(),
    lu_par_user: v.boolean(),
  }).index("by_dossier", ["dossier_id"]),

  // Historique des demandes retirées par leur auteur (audit léger).
  abo_demandes_supprimees: defineTable({
    email: v.string(),
    owner_id: v.id("users"),
    personnes: v.optional(v.string()), // « Prénom Nom, … » au moment du retrait
    supprime_le: v.string(),
  }).index("by_owner", ["owner_id"]),

  // Miroir brut de la vraie page club, alimenté par le scrap (cron).
  abo_abonnes_scrap: defineTable({
    licence: v.optional(v.string()), // clé technique d'upsert (canonique)
    nom: v.optional(v.string()),
    prenom: v.optional(v.string()),
    nom_prenom_normalise: v.string(),
    email: v.optional(v.string()),
    age: v.optional(v.number()),
    micro_perf: v.optional(v.string()),
    nb_seances: v.optional(v.string()),
    adhesion: v.optional(v.string()),
    autonomie: v.optional(v.string()),
    photo: v.optional(v.string()),
    paiement: v.optional(v.string()),
    abonnement_valide: v.boolean(),
    last_scrap_at: v.optional(v.string()),
  })
    .index("by_licence", ["licence"])
    .index("by_nom_prenom_normalise", ["nom_prenom_normalise"]),

  // Archive N-1 (écrasée à chaque reset de saison).
  abo_abonnes_archive: defineTable({
    licence: v.optional(v.string()),
    nom: v.optional(v.string()),
    prenom: v.optional(v.string()),
    nom_prenom_normalise: v.string(),
    abonnement_valide: v.boolean(),
    saison: v.string(),
  }).index("by_licence", ["licence"]),

  // Élèves « en cours d'escalade » (passe-droit vague 2), importés de l'Excel.
  // Colonnes mappées 1:1 sur l'export cours-export-xlsx.php du site club
  // (structure stable d'une saison à l'autre).
  abo_eleves_en_cours: defineTable({
    licence: v.optional(v.string()),
    nom: v.optional(v.string()),
    prenom: v.optional(v.string()),
    nom_prenom_normalise: v.string(),
    horaire: v.optional(v.string()),
    // SAISON-EXEMPT: métadonnée de provenance du snapshot courant global, pas un axe de navigation.
    saison: v.optional(v.string()),
    imported_at: v.string(),
    // Colonne "Age".
    age: v.optional(v.string()),
    // Colonne "Cours".
    cours: v.optional(v.string()),
    // Colonne "Date de naissance".
    date_naissance: v.optional(v.string()),
    // Colonne "Encadrant(s)".
    encadrants: v.optional(v.string()),
    // Colonne "Inscription" (date d'inscription au cours).
    date_inscription: v.optional(v.string()),
    // Colonne "Licence <saison>" (ex: "Licence 2026 / 2027" — libellé variable).
    licence_saison: v.optional(v.string()),
    // Colonne "N° Licence saisi" (licence ressaisie manuellement, ≠ licence officielle).
    licence_saisie: v.optional(v.string()),
    // Colonne "Paiement reçu ?".
    paiement_recu: v.optional(v.string()),
    // Colonne "Paiements du dossier".
    paiements_dossier: v.optional(v.string()),
    // Colonne "Saison précédente".
    saison_precedente: v.optional(v.string()),
    // Colonne "Téléphone (Élève)".
    telephone_eleve: v.optional(v.string()),
    // Colonne "Téléphone (Gestion du dossier)".
    telephone_gestion: v.optional(v.string()),
    // Colonne "email (Élève)".
    email_eleve: v.optional(v.string()),
    // Colonne "email (Gestion du dossier)".
    email_gestion: v.optional(v.string()),
  })
    .index("by_licence", ["licence"])
    .index("by_nom_prenom_normalise", ["nom_prenom_normalise"]),

  // Annuaire licence ↔ nom/prénom (résolution des licences des demandes).
  abo_licences: defineTable({
    licence: v.string(),
    nom: v.optional(v.string()),
    prenom: v.optional(v.string()),
    nom_prenom_normalise: v.string(),
    imported_at: v.string(),
  })
    .index("by_licence", ["licence"])
    .index("by_nom_prenom_normalise", ["nom_prenom_normalise"]),

  // Journal des emails envoyés (anti-doublons).
  abo_email_log: defineTable({
    dossier_id: v.id("abo_dossiers"),
    type_email: v.union(
      v.literal("accuse"),
      v.literal("validation"),
      v.literal("liste_attente"),
      v.literal("refus"),
      v.literal("nouveau_message"),
      v.literal("test_annule"),
    ),
    destinataire: v.string(),
    sent_at: v.string(),
  }).index("by_dossier", ["dossier_id"]),

  // Disponibilités proposées par un admin pour le test d'autonomie.
  abo_test_creneaux: defineTable({
    admin_id: v.id("users"),
    date_jour: v.string(), // 'YYYY-MM-DD'
    heure_debut: v.string(), // 'HH:mm'
    heure_fin: v.string(), // 'HH:mm'
  })
    .index("by_admin", ["admin_id"])
    .index("by_date", ["date_jour"]),

  // Réservation d'une tranche horaire de test par une personne (anonyme côté
  // encadrant). Une seule réservation "active" par personne (contrôlé en mutation).
  abo_test_reservations: defineTable({
    personne_id: v.id("abo_personnes"),
    tranche: v.string(), // début de tranche, instant ISO (Europe/Paris)
    tranche_fin: v.optional(v.string()),
    statut: v.union(v.literal("active"), v.literal("annulee")),
    annulee_le: v.optional(v.string()),
    annulee_raison: v.optional(
      v.union(v.literal("candidat"), v.literal("creneau_admin_annule")),
    ),
  })
    .index("by_personne", ["personne_id"])
    .index("by_tranche", ["tranche"]),

  // Configuration applicative clé/valeur (vagues, liens, places_max, helloasso).
  abo_app_config: defineTable({
    cle: v.string(),
    valeur: v.optional(v.string()),
    updated_at: v.optional(v.string()),
  }).index("by_cle", ["cle"]),
});
