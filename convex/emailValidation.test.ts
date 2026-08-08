/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  ajouterAvertissementReponseEmailAbo,
  AVERTISSEMENT_REPONSE_EMAIL_ABO,
} from "./email";
import { canoniserEmailUnique } from "./emailValidation";

const modules = import.meta.glob("./**/*.ts");

describe("validation des destinataires email", () => {
  test("canonise une adresse unique valide", () => {
    expect(canoniserEmailUnique("  Alice.Exemple+Club@Example.TEST  ")).toBe(
      "alice.exemple+club@example.test",
    );
  });

  test.each([
    "",
    "a@example.test,b@example.test",
    "a@example.test;b@example.test",
    "a@example.test\r\nBcc: b@example.test",
    "Alice <alice@example.test>",
    "deux@@example.test",
    ".alice@example.test",
    "alice..test@example.test",
    "alice@-example.test",
  ])("refuse le destinataire invalide %j", (email) => {
    expect(() => canoniserEmailUnique(email)).toThrow("Adresse email invalide");
  });

  test("les sinks SMTP refusent avant de lire la configuration ou d'ouvrir le réseau", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(internal.email.sendOTP, {
      email: "victime@example.test,autre@example.test",
      code: "123456",
    })).rejects.toThrow("Adresse email invalide");
    await expect(t.action(internal.email.sendAboEmail, {
      to: "Nom <victime@example.test>",
      subject: "Test",
      text: "Test",
    })).rejects.toThrow("Adresse email invalide");
  });
});

describe("corps des emails Abonnements", () => {
  test("indique de ne pas répondre et renvoie vers la messagerie du site", () => {
    expect(ajouterAvertissementReponseEmailAbo("Bonjour.\n")).toBe(
      `Bonjour.\n\n${AVERTISSEMENT_REPONSE_EMAIL_ABO}`,
    );
  });

  test("n'ajoute pas deux fois l'avertissement", () => {
    const texte = `Bonjour.\n\n${AVERTISSEMENT_REPONSE_EMAIL_ABO}`;
    expect(ajouterAvertissementReponseEmailAbo(texte)).toBe(texte);
  });
});
