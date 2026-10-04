# CLAUDE.md

## Contexte Ahitché
- Service d'approvisionnement et de livraison alimentaire à domicile, à Cotonou et Abomey-Calavi (Bénin).
- Trois packs publics : **AHI Essentiel**, **AHI Équilibré** et **AHI Confort**, avec des prix en FCFA. Les packs AHI Réserve et AHI Fraîcheur existent aussi en base (`back/src/scripts/createFormules.js`).
- Le public est surtout sur mobile, avec des connexions parfois lentes. Il faut privilégier le poids léger, le lazy-loading et peu de requêtes bloquantes.
- Tout le site et tous les messages destinés aux utilisateurs sont en **français**.
- Respecter la charte graphique (couleurs, typo, logo). Les tokens se trouvent dans `front/src/assets/main.css` (`@theme`) :
  - Couleurs : `foret #1A5C38`, `savane #2E7D4F`, `or #F2B705`, `or-deep #D4A003`, `creme #F8F5EF`, `creme2 #F0EBE1`, `noir #111111`, `gris #4A5568`, `gris-lt #9AA5B4`.
  - Polices : `font-display` = Fraunces (titres), `font-body` = Plus Jakarta Sans (texte).
  - Utiliser ces classes Tailwind (`bg-foret`, `text-or`…) plutôt que `gray-*`, `emerald-*` ou des hex en dur.

## Stack
- `front/` : Vue 3 + TypeScript, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), vue-router, Pinia, TanStack Query (admin), vue-toastification, sweetalert2, jsPDF.
- `back/` : Node.js + Express 5 (CommonJS), MongoDB Atlas via Mongoose, JWT dans un cookie HttpOnly, Resend (e-mails), Cloudinary + multer (uploads).
- Production : front sur `https://ahitchebj.com`, API sur `https://api.ahitchebj.com`. En dev, Vite proxifie `/api` vers `http://localhost:5000`.

## Commandes
```bash
# Front (dans front/)
npm run dev          # serveur Vite
npm run build        # type-check + build
npm run lint         # oxlint + eslint (--fix)
npm run test:unit    # vitest
npm run test:e2e     # playwright

# Back (dans back/)
npm run dev          # nodemon index.js
npm start
node src/scripts/createAdmin.js     # crée l'admin (ADMIN_PASSWORD dans .env)
node src/scripts/createFormules.js  # upsert des formules (prix, « Bientôt », cycle de relance)
node src/scripts/migrerDonnees.js   # migration idempotente (téléphone, fournisseurs, zones, statuts, taux, admin principal)
STAFF_PASSWORD=… node src/scripts/createStaff.js <email> "<Nom>" <role>  # compte de l'équipe
```
Les transactions MongoDB (livraison + sortie de stock FIFO) exigent un replica set : c'est le cas sur Atlas ; en local, utiliser `MongoMemoryReplSet` ou un replica set à un nœud.
Variables d'environnement du back : `MONGO_URI`, `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`, `CLOUDINARY_*`, `ADMIN_PASSWORD`, `NODE_ENV`, `PORT`, et `INACTIVITE_MINUTES` (facultative, 60 par défaut : déconnexion de l'équipe après inactivité).

## Structure
- `front/src/views/` : pages (accueil, login, register, reset, blog, dashboards user et admin).
- `front/src/components/sections/` : sections de la page d'accueil (Hero, Formules, Comment ça marche…).
- `front/src/components/admin/` : back-office (commandes, stock, produits, formules, posts) et les sections Gestion : `prestataires/`, `logistique/`, `finances/`, `simulateurs/`, `nutrition/` (chargées à la demande).
- `front/src/components/client/` : blocs de l'espace client (suivi alimentaire).
- `front/src/config/roles.ts` et `back/src/config/roles.js` : rôles (`user`, `admin`, `gestionnaire`, `comptable`, `nutritionniste`) et droits lecture/écriture par section, à garder synchronisés. Le serveur fait foi (middleware `acces()`).
- `front/src/config/commandes.ts` et `back/src/services/commandeService.js` : statuts de commande et passages autorisés.
- `front/src/stores/auth.ts` : état d'authentification (composable, pas un store Pinia ; `user`, `role`… sont des refs/computed, donc à lire avec `.value`). `stores/api.ts` : instance axios avec un intercepteur 401.
- `back/src/routes/` : `auth.js` (client), `admin.js` (back-office, droits par section), `public.js` (blog, zones).
- `back/src/controllers/`, `models/`, `services/` : logique Express et Mongoose. `services/compositionService.js` calcule la composition d'un pack (Formules, Logistique, Simulateurs).
- `back/src/data/zones-livraison.json` : 22 zones (arrondissements de Cotonou et d'Abomey-Calavi) et leurs quartiers.
- `docs/conception-menu-admin.md` : décisions métier du back-office (statuts, paiement, relances, rôles, APDP).

## Conventions
- Le code, les commentaires et les messages sont en français. On garde le style existant (`async function` + `module.exports` côté back, `<script setup lang="ts">` côté front).
- La commande se fait principalement par WhatsApp (`wa.me/22998136635`) avec un message pré-rempli.
- Les prix des packs sont définis à deux endroits : dans `front/src/config/formules.ts` (vitrine : cartes et prix d'appel du hero) et en base (`Formule`, référentiel dans `back/src/scripts/createFormules.js`). Toute modification de prix doit être faite aux deux endroits.
- Prix de vente = `prixCommercial` s'il est fixé par l'admin, sinon `prixActuel`. `GET /api/admin/formulas/:pack` est en lecture seule et renvoie la valeur issue du catalogue dans `prixCalcule`.
- Une commande client est enregistrée par le serveur, qui fixe lui-même le prix et la référence `CMD-xxx` (`orderReferenceService`). Les packs `bientotDisponible` (Réserve, Fraîcheur) sont visibles mais ne peuvent pas être commandés.
- Liste commune : 17 produits de base. L'Essentiel exclut l'huile de palme. Les quantités par pack ne sont pas affichées.
- Commande : En attente → Confirmée → En préparation → En livraison → Livrée (paiement Mobile Money à la livraison, référence obligatoire ; Espèces/Acompte avec note) ou Échec ; Annulée. Livraison > 24 h après le créneau = compensation remise à la commande suivante.
- Finances : toute action sur les dépenses, lignes budgétaires, taux et prix de formule passe par `journaliser()` (journal des modifications). Une dépense payée (justificatif obligatoire) ne se modifie plus.
- Nutrition : aucune donnée de santé ni conviction religieuse sans autorisation préalable de l'APDP (Code du numérique, art. 394).
- Écrans admin : vérifier l'affichage à 375 px ; la Logistique est conçue d'abord pour le téléphone.
- Navigation et session : la déconnexion passe par `useDeconnexion` (retour à l'accueil, cache vidé, session gardée si le serveur ne confirme pas). Toute page affichée sans le menu du site (`hideNavigation`) propose `LienAccueil`. Une page protégée renvoie vers `/login?redirect=…` (et `&session=expiree` sur un 401) ; seuls les chemins internes sont acceptés comme `redirect`.
- Session : `GET /api/auth/session` (toujours 200, `user: null` pour un visiteur) sert à l'affichage (« Mon espace » dans le menu du site). Cookie et jeton passent par `back/src/services/sessionService.js` : 1 jour pour les clients et l'admin principal (`User.adminPrincipal`), 1 h glissante pour le reste de l'équipe, avec déconnexion côté navigateur après 1 h sans activité (`useDeconnexionInactivite`, avertissement 2 min avant, `/login?session=inactivite`).
