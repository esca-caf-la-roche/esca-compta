"use node";

import { internalAction as action } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

export const sendOTP = action({
  args: { email: v.string(), code: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    try {
      const senderEmail = process.env.EMAIL_SENDER;
      const senderPassword = process.env.EMAIL_PASSWORD;

      if (!senderEmail || !senderPassword) {
        console.warn("[GoogleOTP] Configuration SMTP indisponible.");
        throw new Error("L'envoi du code de connexion est temporairement indisponible. Réessayez plus tard.");
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
      
      console.info("[GoogleOTP] E-mail d'authentification envoyé.");
      return null;
    } catch {
      console.error("[GoogleOTP] Échec de l'envoi SMTP.");
      throw new Error("L'envoi du code de connexion est temporairement indisponible. Réessayez plus tard.");
    }
  }
});

// Envoi générique d'un email du module Abonnements, via une boîte mail DISTINCTE
// de l'OTP compta (abonnementSAE@… du club). Sert à l'OTP abonnés publics et aux
// emails transactionnels (validation, liste d'attente, refus, messagerie).
// Secrets Convex : EMAIL_SENDER_ABO / EMAIL_PASSWORD_ABO (mot de passe d'appli).
export const sendAboEmail = action({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    try {
      const senderEmail = process.env.EMAIL_SENDER_ABO;
      const senderPassword = process.env.EMAIL_PASSWORD_ABO;

      if (!senderEmail || !senderPassword) {
        console.warn("[Abo] Configuration SMTP indisponible.");
        throw new Error("L'envoi de l'e-mail est temporairement indisponible. Réessayez plus tard.");
      }

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: senderEmail, pass: senderPassword },
      });

      await transporter.sendMail({
        from: `Abonnements Escalade CAF <${senderEmail}>`,
        to: args.to,
        subject: args.subject,
        text: args.text,
      });

      console.info("[Abo] E-mail transactionnel envoyé.");
      return null;
    } catch {
      console.error("[Abo] Échec de l'envoi SMTP.");
      throw new Error("L'envoi de l'e-mail est temporairement indisponible. Réessayez plus tard.");
    }
  },
});
