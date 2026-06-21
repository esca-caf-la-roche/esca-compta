# Authentification par OTP (Convex Auth)

Le choix a été fait de ne pas autoriser d'inscription publique. La sécurité repose sur la bibliothèque officielle **`@convex-dev/auth`** configurée avec un fournisseur OTP à 6 chiffres (`google-otp`).

## Fonctionnement du processus

1. **Vérification de l'adresse email** :
   - L'utilisateur saisit son adresse email dans le formulaire de connexion.
   - Le frontend appelle la query `api.users.checkEmailExists`. Si l'email n'est pas autorisé (c'est-à-dire absent de la table `users`), l'opération est bloquée directement avec un message d'erreur clair.
   - Si l'email existe, le frontend appelle la méthode `signIn("google-otp", { email })` de `@convex-dev/auth`.

2. **Génération et envoi du code OTP** :
   - Le serveur génère un code OTP aléatoire sécurisé à 6 chiffres avec une validité de 10 minutes.
   - La méthode `sendVerificationRequest` vérifie à nouveau côté serveur la présence de l'email dans la base (sécurité renforcée).
   - L'action Node.js `api.email.sendOTP` est exécutée pour envoyer l'e-mail :
     - **Mode Production / SMTP** : Si les variables d'environnement `EMAIL_SENDER` et `EMAIL_PASSWORD` (mot de passe d'application Google) sont définies, l'e-mail contenant l'OTP est envoyé directement via Gmail.
     - **Mode Développement / Fallback** : Si les variables ne sont pas définies, le code est simplement affiché dans les logs de la console du serveur Convex, permettant un développement local simplifié.

3. **Vérification et Session** :
   - L'utilisateur saisit le code reçu.
   - Le frontend appelle `signIn("google-otp", { email, code })`.
   - La callback `createOrUpdateUser` intercepte l'inscription/connexion pour s'assurer que l'email correspond bien à un utilisateur pré-enregistré dans la table `users`. Si l'utilisateur n'existe pas, l'authentification échoue (interdiction de création de compte à la volée).
   - En cas de succès, `@convex-dev/auth` gère la session utilisateur de manière sécurisée et transparente (via des cookies et tokens gérés par la bibliothèque).

## Gestion des accès

Toutes les routes (hormis `/login`) sont encapsulées dans le composant `Layout.tsx`. 
Le statut de l'authentification est vérifié via `useConvexAuth()` fourni par Convex. Si l'utilisateur n'est pas connecté (`isAuthenticated === false`), il est automatiquement redirigé vers la page `/login` via un composant `<Navigate />`. Les tokens de session et l'état de chargement (`isLoading`) sont gérés de manière native et sécurisée.
