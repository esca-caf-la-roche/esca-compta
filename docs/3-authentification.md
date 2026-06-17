# Authentification OTP

Le choix a été fait de ne pas autoriser d'inscription publique. La sécurité repose sur un système OTP (One-Time Password) géré de manière "custom" via Convex.

## Fonctionnement du processus

1. **Vérification de l'existence** : L'utilisateur entre son adresse email. La mutation `sendOTP` est appelée côté Convex.
2. **Si l'email est inconnu** : La mutation échoue immédiatement et un message d'erreur stipule que le compte n'existe pas. (Un administrateur doit ajouter la ligne manuellement dans le dashboard Convex).
3. **Si l'email est connu** :
   - Convex génère un code aléatoire à 6 chiffres.
   - Ce code est sauvegardé dans la table `otps` (avec l'email de l'utilisateur et une date d'expiration fixée à 10 minutes).
   - *Actuellement* : Le code est affiché dans les logs de la console Convex.
   - *Prochaine étape* : Intégrer un service d'envoi (comme Resend ou SendGrid) pour acheminer le code par email à l'utilisateur.
4. **Vérification** : L'utilisateur saisit le code. La mutation `verifyOTP` cherche le code correspondant à l'email.
   - Si valide et non expiré : le code est supprimé de la BDD, et l'ID de l'utilisateur Convex est renvoyé au frontend.
   - Le frontend stocke cet ID dans le `localStorage` via le `AuthContext`.

## Gestion des accès

Toutes les routes (hormis `/login`) sont encapsulées dans le composant `Layout.tsx`. 
Si le `AuthContext` ne détecte aucun utilisateur actif, il redirige instantanément l'utilisateur vers la page `/login` via un composant `<Navigate />`.
