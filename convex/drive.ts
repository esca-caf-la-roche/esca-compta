"use node";

import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { google } from "googleapis";

// Mutation interne pour mettre à jour la transaction une fois le traitement Drive terminé
export const updateTransactionDriveInfo = internalMutation({
  args: {
    id: v.id("transactions"),
    nom: v.string(),
    lienDrive: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      nom: args.nom,
      lienDrive: args.lienDrive,
    });
  },
});

export const processTransactionDrive = action({
  args: {
    transactionId: v.id("transactions"),
    analytiqueNom: v.string(),
    date: v.string(), // YYYY-MM-DD
    typeDocument: v.string(),
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
      const typePart = args.typeDocument.replaceAll(" ", "_");
      const tiersPart = args.tiersNom.replaceAll(" ", "_");
      const comPart = (args.commentaires || "").replaceAll(" ", "_");

      const newNom = `${analytiquePart}_${dateStr}_${typePart}_${tiersPart}_${comPart}`;

      // 2. Initialiser l'API Google Drive
      const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!email || !privateKey) {
        throw new Error("Les identifiants Google Drive ne sont pas configurés (GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY).");
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      const drive = google.drive({ version: 'v3', auth });

      const PARENT_FOLDER_ID = "1Vj8CcRR6gSN4gLlB6DAxYs9zXzVTK4Ha";

      // 3. Chercher le répertoire MM-YYYY
      const query = `name='${monthYearStr}' and mimeType='application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed=false`;
      
      const searchRes = await drive.files.list({
        q: query,
        fields: 'files(id, webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      let folderId = "";
      let folderLink = "";

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        // Le répertoire existe
        folderId = searchRes.data.files[0].id!;
        folderLink = searchRes.data.files[0].webViewLink!;
      } else {
        // 4. Créer le répertoire MM-YYYY
        const createRes = await drive.files.create({
          requestBody: {
            name: monthYearStr,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [PARENT_FOLDER_ID],
          },
          fields: 'id, webViewLink',
          supportsAllDrives: true,
        });

        folderId = createRes.data.id!;
        folderLink = createRes.data.webViewLink!;
      }

      // 5. Partager avec j.duheron@caflarochebonneville.fr
      try {
        await drive.permissions.create({
          fileId: folderId,
          requestBody: {
            role: 'reader',
            type: 'user',
            emailAddress: 'j.duheron@caflarochebonneville.fr',
          },
          supportsAllDrives: true,
          sendNotificationEmail: false,
        });
      } catch (permError) {
        console.warn("Impossible de partager le dossier (peut-être déjà partagé):", permError);
      }

      // 6. Mettre à jour la transaction via mutation interne
      await ctx.runMutation(internal.drive.updateTransactionDriveInfo, {
        id: args.transactionId,
        nom: newNom,
        lienDrive: folderLink,
      });

      return { success: true, newNom, lienDrive: folderLink };

    } catch (error: any) {
      console.error("Erreur Drive:", error);
      throw new Error(`Erreur lors du traitement Google Drive: ${error.message}`);
    }
  },
});
