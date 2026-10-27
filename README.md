# Turnaround — Render + PostgreSQL

Cette archive fournit un socle backend Node.js/Express et une copie du frontend Turnaround adaptée pour appeler les routes `/api/*` sur le même domaine. PostgreSQL conserve les comptes et les données entre les déploiements. La clé vIFF est uniquement lue côté serveur depuis une variable d'environnement.

## Important avant la production

- L'API vIFF n'est **pas activée tant que ses URL et son contrat ne sont pas confirmés**. Le code n'invente pas d'endpoint : renseignez `VIFF_FLIGHT_LOOKUP_URL` et `VIFF_TOBT_SUBMIT_URL` avec les valeurs de la documentation/du fournisseur.
- `667` ne doit pas être mis dans le dépôt ni dans le HTML. Si `667` est bien la clé autorisée, saisissez-la dans Render > Web Service > Environment > `VIFF_API_KEY`.
- Les routes de lecture et d'écriture vIFF nécessitent une authentification Turnaround.
- Le proxy PDF autorise uniquement les hôtes SimBrief ; si les PDF de briefing proviennent d'autres domaines, adaptez la liste d'autorisation avec prudence.
- Les nouveaux comptes exigent un identifiant de 3–32 caractères (`a-z`, chiffres, `.`, `_`, `-`) et un mot de passe de 12 caractères minimum. Les anciens comptes locaux ne sont pas automatiquement migrés : il faut créer des comptes serveur ou préparer une migration explicite.
- La sauvegarde actuelle des données est un instantané JSON par utilisateur. Des signatures et des données opérationnelles y sont stockées : limitez l'accès et sauvegardez la base.

## Fichiers

- `public/index.html` — frontend adapté.
- `src/server.js` — routes API, auth, proxy SimBrief/vIFF.
- `src/db.js` — pool PostgreSQL.
- `src/migrate.js` et `migrations/001_initial.sql` — schéma initial idempotent.
- `.env.example` — noms des variables, sans secrets.

## Déploiement Render

### 1. GitHub

1. Créez un dépôt GitHub privé nommé `turnaround`.
2. Décompressez cette archive et envoyez **le contenu** dans la racine du dépôt (le dossier `public/` doit être à la racine).
3. Ne téléversez jamais un fichier `.env` contenant des secrets.

### 2. PostgreSQL

1. Dans Render, cliquez **New + → PostgreSQL**.
2. Choisissez un nom tel que `turnaround-db`, une région et une offre adaptée.
3. Créez la base et copiez son URL de connexion **interne** pour l'utiliser avec le Web Service dans la même région.
4. Vérifiez les options de sauvegarde/retention proposées par votre offre.

### 3. Web Service

1. Render → **New + → Web Service**.
2. Connectez le dépôt `turnaround`.
3. Runtime : Node.
4. Build Command : `npm install`.
5. Start Command : `npm start`.
6. Ajoutez les variables d'environnement :
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = URL interne PostgreSQL de Render
   - `JWT_SECRET` = chaîne aléatoire longue (au moins 32 caractères ; utilisez un générateur de secrets)
   - `SIMBRIEF_BASE_URL` = `https://www.simbrief.com/api/xml.fetcher.php`
   - `VIFF_API_KEY` = clé fournie par vIFF (à entrer directement dans Render, pas dans GitHub)
   - `VIFF_API_KEY_HEADER` = nom d'en-tête confirmé par vIFF, par défaut `X-API-Key`
   - `VIFF_FLIGHT_LOOKUP_URL` = URL HTTPS exacte fournie par vIFF, avec `{callsign}` à l'endroit du callsign
   - `VIFF_TOBT_SUBMIT_URL` = URL HTTPS exacte de soumission TOBT fournie par vIFF
   - `VIFF_AUTH_SCHEME` = laisser vide sauf si la documentation vIFF demande une auth `Authorization: <scheme> <key>`
7. Créez le service et attendez la fin du déploiement.

Le démarrage exécute une migration idempotente avant de lancer le serveur. Elle ne supprime pas les tables existantes.

### 4. Vérifications

- Ouvrir `https://VOTRE-SERVICE.onrender.com/api/ping` : doit répondre `{"ok":true}`.
- Ouvrir la page d'accueil, créer un compte de test et se connecter.
- Enregistrer un changement, recharger la page, vérifier que les données reviennent.
- Se connecter avec un second compte et vérifier qu'il ne voit pas les données du premier.
- Déployer un changement inoffensif, puis vérifier que les comptes et les données sont toujours là.
- Tester SimBrief avec un nom valide.
- Ne tester vIFF qu'après confirmation des endpoints et formats par vIFF. Une réponse `viff_*_not_configured` indique qu'il manque une variable ; elle ne signifie pas que vIFF est indisponible.

## Mises à jour

Modifiez les fichiers, committez et poussez sur la branche liée au Web Service. Render redéploie le code, tandis que PostgreSQL reste séparé. Ne supprimez pas la base lors d'un déploiement. Faites une sauvegarde avant toute migration de schéma.

## Limitations connues

- La clé API vIFF et les URLs exactes ne peuvent pas être devinées ; la lecture et l'envoi vIFF restent désactivés jusqu'à configuration documentée.
- L'authentification repose sur un bearer token de 12 heures. Après expiration, l'utilisateur doit se reconnecter. Le frontend actuel ne renouvelle pas automatiquement le token.
- Le frontend conserve certains fichiers PDF de briefing dans IndexedDB localement ; ces fichiers ne sont pas synchronisés entre appareils via le backend dans cette première version.
- Les données actuellement uniquement présentes dans `localStorage`/IndexedDB ne sont pas importées automatiquement vers PostgreSQL. Conservez une copie et utilisez un processus de migration dédié si elles doivent être préservées.
- Cette archive est un socle prêt à tester, pas une certification de sécurité ni une validation de l'API vIFF. Faites les tests d'acceptation avant l'usage opérationnel.
