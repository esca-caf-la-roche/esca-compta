"use node";

import { internalAction as action } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

export const sendOTP = action({
  args: { email: v.string(), code: v.string() },
  handler: async (_ctx, args) => {
    try {
      const senderEmail = process.env.EMAIL_SENDER;
      const senderPassword = process.env.EMAIL_PASSWORD;

      // Si l'e-mail ou le mot de passe d'application de l'expéditeur ne sont pas configurés,
      // on fait un fallback propre en mode dev (affichage console).
      if (!senderEmail || !senderPassword) {
        console.warn("[GoogleOTP] Mode dev ou configuration d'EMAIL_SENDER / EMAIL_PASSWORD incomplète. L'e-mail ne sera pas envoyé via SMTP.");
        console.log(`[GoogleOTP] Code OTP pour ${args.email} : ${args.code}`);
        return;
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderEmail,
          pass: senderPassword,
        },
      });

      const subject = `${args.code} : votre code de connexion au portail escalade`;
      const body = `Bonjour,\n\nVotre code de vérification est : ${args.code}\n\nCe code expirera dans 10 minutes.\n\nL'équipe Esca-Compta.`;

      await transporter.sendMail({
        from: `Esca-Compta <${senderEmail}>`,
        to: args.email,
        subject: subject,
        text: body,
      });
      
      console.log(`[GoogleOTP] Email envoyé avec succès à ${args.email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      console.error("[GoogleOTP] Erreur lors de l'envoi de l'email via SMTP:", errorMessage);
      console.log(`[GoogleOTP] Fallback (Affichage Console) - Code pour ${args.email} : ${args.code}`);
    }
  }
});
