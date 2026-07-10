import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authenticatedMutation as mutation } from "./customFunctions";

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
