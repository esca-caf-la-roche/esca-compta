import { mutation } from "./_generated/server";

export const migrateSaisons = mutation({
  args: {},
  handler: async (ctx) => {
    let countTrans = 0;
    const transactions = await ctx.db.query("transactions").collect();
    for (const t of transactions) {
      if (!t.saison) {
        await ctx.db.patch(t._id, { saison: "2025-26" });
        countTrans++;
      }
    }

    let countPrev = 0;
    const previsionnels = await ctx.db.query("previsionnels").collect();
    for (const p of previsionnels) {
      if (!p.saison) {
        await ctx.db.patch(p._id, { saison: "2025-26" });
        countPrev++;
      }
    }

    return { transactionsMigrated: countTrans, previsionnelsMigrated: countPrev };
  },
});

export const migrateTypesDocuments = mutation({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").collect();
    let migratedCount = 0;

    for (const t of transactions) {
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
        
        migratedCount++;
      }
    }
    return { success: true, migratedCount };
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
