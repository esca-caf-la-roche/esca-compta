"use node";

import { authenticatedAction as action } from "./customFunctions";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { google } from "googleapis";

export const processTransactionDrive = action({
  args: {
    transactionId: v.id("transactions"),
    saisonDirName: v.string(),
    analytiqueNom: v.string(),
    date: v.string(), // YYYY-MM-DD
    typeDocumentNom: v.string(),
    tiersNom: v.string(),
    commentaires: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // 1. Formater le nouveau nom de la transaction
      const dateObj = new Date(args.date);
      let dateStr = "";
      let monthYearStr = "";
      if (!isNaN(dateObj.getTime())) {
        dateStr = dateObj.toISOString().slice(2, 10); // YY-MM-DD
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        monthYearStr = `${month}-${year}`; // MM-YYYY
      } else {
        dateStr = args.date;
        monthYearStr = "00-0000"; // fallback
      }

      const analytiquePart = args.analytiqueNom.substring(0, 5);
      const typePart = args.typeDocumentNom.replaceAll(" ", "_");
      const tiersPart = args.tiersNom.replaceAll(" ", "_");
      const comPart = (args.commentaires || "").replaceAll(" ", "_");

      const newNom = `${analytiquePart}_${dateStr}_${typePart}_${tiersPart}_${comPart}`;

      // 2. Initialiser l'API Google Drive
      const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      const PARENT_FOLDER_ID = process.env.DRIVE_PARENT_FOLDER_ID;

      if (!email || !privateKey || !PARENT_FOLDER_ID) {
        throw new Error("Les identifiants Google Drive ne sont pas configurés (GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, DRIVE_PARENT_FOLDER_ID).");
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      const drive = google.drive({ version: 'v3', auth });

      // 3. Chercher le répertoire de la Saison (ex: 2026-2027)
      const seasonQuery = `name='${args.saisonDirName}' and mimeType='application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed=false`;
      
      const seasonSearchRes = await drive.files.list({
        q: seasonQuery,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      let seasonFolderId = "";

      if (seasonSearchRes.data.files && seasonSearchRes.data.files.length > 0) {
        seasonFolderId = seasonSearchRes.data.files[0].id!;
      } else {
        // Créer le répertoire Saison
        const createSeasonRes = await drive.files.create({
          requestBody: {
            name: args.saisonDirName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [PARENT_FOLDER_ID],
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        seasonFolderId = createSeasonRes.data.id!;
      }

      // 4. Chercher le répertoire MM-YYYY
      const monthQuery = `name='${monthYearStr}' and mimeType='application/vnd.google-apps.folder' and '${seasonFolderId}' in parents and trashed=false`;
      
      const monthSearchRes = await drive.files.list({
        q: monthQuery,
        fields: 'files(id, webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      let monthFolderId = "";
      let folderLink = "";

      if (monthSearchRes.data.files && monthSearchRes.data.files.length > 0) {
        // Le répertoire existe
        monthFolderId = monthSearchRes.data.files[0].id!;
        folderLink = monthSearchRes.data.files[0].webViewLink!;
      } else {
        // Créer le répertoire MM-YYYY
        const createRes = await drive.files.create({
          requestBody: {
            name: monthYearStr,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [seasonFolderId],
          },
          fields: 'id, webViewLink',
          supportsAllDrives: true,
        });

        monthFolderId = createRes.data.id!;
        folderLink = createRes.data.webViewLink!;
      }

      // 5. Partager avec escalade@caflarochebonneville.fr
      try {
        await drive.permissions.create({
          fileId: monthFolderId,
          requestBody: {
            role: 'reader',
            type: 'user',
            emailAddress: 'escalade@caflarochebonneville.fr',
          },
          supportsAllDrives: true,
          sendNotificationEmail: false, // N'envoie pas de mail (silencieux)
        });
      } catch (permError) {
        console.warn("Impossible de partager le dossier (peut-être déjà partagé):", permError);
      }

      // 6. Mettre à jour la transaction via mutation publique
      await ctx.runMutation(api.transactions.update, {
        id: args.transactionId,
        nom: newNom,
        lienDrive: folderLink,
      });

      return { success: true, newNom, lienDrive: folderLink };

    } catch (error: unknown) {
      console.error("Erreur Drive:", error);
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      throw new Error(`Erreur lors du traitement Google Drive: ${errorMessage}`, { cause: error });
    }
  },
});
