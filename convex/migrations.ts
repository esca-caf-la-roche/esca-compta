import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authenticatedMutation as mutation } from "./customFunctions";
import { internalMutation } from "./_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations);

export const migrateSaisonsTransactions = migrations.define({
  table: "transactions",
  migrateOne: async (ctx, t) => {
    if (!t.saison) {
      await ctx.db.patch(t._id, { saison: "2025-26" });
    }
  },
});

export const migrateSaisonsPrevisionnels = migrations.define({
  table: "previsionnels",
  migrateOne: async (ctx, p) => {
    if (!p.saison) {
      await ctx.db.patch(p._id, { saison: "2025-26" });
    }
  },
});

export const migrateTypesDocuments = migrations.define({
  table: "transactions",
  migrateOne: async (ctx, t) => {
    if (!t.typeDocumentId && t.typeDocument) {
      const typeName = t.typeDocument.trim();
      
      // Chercher si le type existe déjà
      const existingTypes = await ctx.db.query("typesDocuments").collect();
      const existingType = existingTypes.find(td => td.nom.toLowerCase() === typeName.toLowerCase());

      let newTypeId;
      if (existingType) {
        newTypeId = existingType._id;
      } else {
        // Créer le type s'il n'existe pas
        newTypeId = await ctx.db.insert("typesDocuments", { nom: typeName });
      }

      // Mettre à jour la transaction avec l'ID
      await ctx.db.patch(t._id, {
        typeDocumentId: newTypeId,
      });
    }
  },
});

/**
 * Backfill ponctuel : convertit l'ancien champ `categorie` ("loisir"/"competition")
 * en booléen `competition` (cours + heures supplémentaires des salariés), puis
 * supprime `categorie`. À exécuter une fois entre le déploiement « widen » (schéma
 * avec les deux champs) et le « narrow » (schéma sans `categorie`) :
 *   npx convex run migrations:migrateCompetition --prod
 */
export const migrateCompetition = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cours = 0;
    let lignes = 0;

    for (const c of await ctx.db.query("cours").collect()) {
      if (c.categorie !== undefined) {
        await ctx.db.patch(c._id, {
          competition: c.categorie === "competition",
          categorie: undefined,
        });
        cours++;
      }
    }

    for (const l of await ctx.db.query("salairesSaison").collect()) {
      if (l.heuresSup && l.heuresSup.some((h) => h.categorie !== undefined)) {
        await ctx.db.patch(l._id, {
          heuresSup: l.heuresSup.map((h) => ({
            designation: h.designation,
            nbHeures: h.nbHeures,
            competition: h.competition ?? h.categorie === "competition",
          })),
        });
        lignes++;
      }
    }

    return { cours, lignes };
  },
});

export const seedSaisons = mutation({
  args: {},
  handler: async (ctx) => {
    const defaultSeasons = ["2023-24", "2024-25", "2025-26", "2026-27"];
    const existingSaisons = await ctx.db.query("saisons").collect();
    
    if (existingSaisons.length === 0) {
      for (const nom of defaultSeasons) {
        await ctx.db.insert("saisons", {
          nom,
          isDefault: nom === "2025-26"
        });
      }
      return { success: true, message: "Saisons initialisées avec succès." };
    }
    return { success: true, message: "Saisons déjà existantes." };
  },
});
