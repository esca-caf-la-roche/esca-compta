"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { google } from "googleapis";

export const sendOTP = action({
  args: { email: v.string(), code: v.string() },
  handler: async (_ctx, args) => {
    try {
      const serviceEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!serviceEmail || !privateKey) {
        console.log(`[GoogleOTP] Mode dev (pas d'identifiants configurés). Code OTP pour ${args.email} : ${args.code}`);
        return;
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
      });

      const gmail = google.gmail({ version: 'v1', auth });

      const senderEmail = process.env.EMAIL_SENDER || serviceEmail; 

      const subject = "Votre code de connexion Esca-Compta";
      const body = `Bonjour,\n\nVotre code de vérification est : ${args.code}\n\nCe code expirera dans 10 minutes.\n\nL'équipe Esca-Compta.`;
      
      const messageParts = [
        `From: Esca-Compta <${senderEmail}>`,
        `To: ${args.email}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ];
      
      const message = messageParts.join('\n');
      const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });
      
      console.log(`[GoogleOTP] Email envoyé avec succès à ${args.email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      console.error("[GoogleOTP] Erreur lors de l'envoi de l'email via Gmail API:", errorMessage);
      console.log(`[GoogleOTP] Fallback (Affichage Console) - Code pour ${args.email} : ${args.code}`);
    }
  }
});
