# Conception du menu admin : décisions validées

Ce document réunit les réponses du 2026-10-04 aux 41 questions de conception, complétées le même jour (zones, affichage « par mois », modes de paiement). Il sert de référence pour les routes et les écrans.

**Statut : développé le 2026-10-04**, dans l'ordre prévu (lot 0 puis Prestataires, Logistique, Finances, Simulateurs, Nutrition). La mise en production et les points restants sont décrits à la section 5.

## 1. Règles métier transverses

### Fréquence et relance

| Formule | Cycle de renouvellement | Alerte de relance |
|---|---|---|
| AHI Essentiel | 14 jours après la livraison | J-5, soit 9 jours après la livraison |
| AHI Fraîcheur | 14 jours après la livraison | J-5 |
| AHI Équilibré, AHI Confort, AHI Réserve | 30 jours après la livraison | J-5, soit 25 jours après la livraison |

Les cartes de formules affichent « par mois » (Essentiel, Équilibré, Confort). Le cycle de relance ci-dessus reste celui de 14 ou 30 jours. La relance sert à recontacter le client s'il ne se manifeste pas de lui-même. Elle remplace le calcul unique à +30 jours du tableau de bord actuel. Le cycle est porté par la formule (nouveau champ `cycleJours`), et non codé en dur.

### Paiement

- Le paiement se fait **à la livraison, par Mobile Money**.
- Les modes « Espèces » et « Acompte » sont **conservés pour les cas particuliers**. Proposition : pour ces modes, pas de référence de transaction, mais une note obligatoire qui explique le cas.
- Une commande « Livrée » est une commande payée. La référence de transaction Mobile Money est saisie au moment où l'on marque la commande comme livrée.

### Statuts de commande

```
En attente -> Confirmée -> En préparation -> En livraison -> Livrée (paiement effectué)
                                                         \-> Échec
(à toute étape avant Livrée) -> Annulée
```

- La sortie de stock (FIFO) reste déclenchée au passage en « Livrée ».
- La date de livraison n'est plus écrasée à chaque changement de statut : elle n'est fixée qu'au passage en « Livrée ».

### Garantie

- Le retard est mesuré à **plus de 24 h après le créneau confirmé**.
- La compensation est enregistrée sur la commande en retard et appliquée à la commande suivante du client.

## 2. Sections

### Commandes (correctif, pas de nouvelle section)

- Le lien « Voir tout » du tableau de bord pointe vers `/commandes`. Il doit pointer vers `/dashboard/admin/commandes`.

### Prestataires (`/dashboard/admin/prestataires`)

- **Types :** Fournisseur, Livreur, Autre (nutritionniste, emballage…).
- **Fiche :** nom, type, téléphone/WhatsApp, quartier, IFU/RCCM (facultatif), mode de paiement, notes, actif/inactif.
- **Livreurs :** rémunérés par course, avec un tarif par zone. Ils n'ont pas de compte en v1 et reçoivent leur tournée sur WhatsApp.
- **Migration :** les 3 fournisseurs principaux (`ETS EUROHI & FILS`, `AHOUANDJO DAVID`, `Hananim Distribution`) deviennent des fiches. Les lots de stock et les bons de commande passent d'un texte figé à une référence vers ces fiches.
- **Liens :** bons de commande, entrées de stock, dépenses (`Expense.partenaireId`), affectation des livreurs.

### Logistique (`/dashboard/admin/logistique`), conçue d'abord pour le téléphone

- **Zones :** une zone par arrondissement, soit les 13 arrondissements de Cotonou et les 9 d'Abomey-Calavi, avec 315 quartiers et villages. Le référentiel est dans [back/src/data/zones-livraison.json](../back/src/data/zones-livraison.json) (voir le point 4.1). Le client choisit son quartier dans la liste, ou « Autre quartier » en texte libre. Le tarif livreur et le coût interne sont définis par zone, et l'admin peut regrouper des zones en secteurs de tournée.
- **Frais :** aucun frais de livraison pour le client. Un coût interne par zone est suivi pour les finances.
- **Créneaux :** du lundi au samedi, matin ou après-midi.
- **Localisation :** champ facultatif « lien de localisation », en plus des repères.
- **Documents :** PDF de préparation et de tournée (jsPDF), et message WhatsApp de tournée au livreur.
- **Écrans :** planning par jour et par créneau, tournée par zone et par livreur, changement de statut en un geste, saisie de la référence Mobile Money à la livraison, suivi des retards et des compensations.
- **Liens :** commandes, stock (préparation, sortie FIFO), prestataires (livreurs), clients (adresse), finances (coûts, compensations, encaissements).

### Finances (`/dashboard/admin/finances`), conçues d'abord pour l'ordinateur

Deux onglets :

1. **Budget Next Impact :**
   - lignes budgétaires importées par CSV/Excel (code, libellé, montant prévu) ;
   - dépenses prévues et réelles en USD et en FCFA ;
   - justificatif obligatoire pour passer une dépense en « effectuée » (PDF ou JPG, 10 Mo maximum, Cloudinary) ;
   - indicateur « valide pour l'audit ».
2. **Exploitation :**
   - encaissements (commandes livrées, avec leur référence Mobile Money) ;
   - achats (chaque entrée de stock crée automatiquement une dépense rattachée au fournisseur) ;
   - coûts logistiques et marges.

- **Taux USD/FCFA :** 571 par défaut, soit le taux de la Convention N°171 sur lequel la subvention a été accordée. Il est affiché sur le tableau de bord (« · convention » quand il s'applique) et reste modifiable par l'admin et le comptable, depuis le tableau de bord (un clic sur le taux) ou dans Finances > Taux & journal. Chaque changement est historisé (`ExchangeRate`) et inscrit au journal, et un bouton permet de revenir au taux de la convention en un clic. Le taux appliqué est figé sur chaque dépense au moment de sa saisie.
- **Devises :** tout en FCFA, sauf le budget de la subvention, en USD et en FCFA.
- **Exports :** CSV des dépenses et synthèse PDF pour l'audit.
- **Historique :** journal « qui a modifié quoi, et quand » sur les finances et les prix.

### Simulateurs (`/dashboard/admin/simulateurs`), en lecture seule

- (a) coût et marge d'un pack ; (b) prévision d'achats pour N commandes ; (c) seuil de rentabilité et objectif de chiffre d'affaires.
- **Logique :** celle du calcul de pack existant (`getPackDetails`), le fichier « v4 » n'étant pas fourni.
- **Base de coût :** prix catalogue et prix d'achat réel (lots FIFO), affichés côte à côte.
- **Frais :** livraison, emballage et commission Mobile Money en paramètres, à 0 par défaut.
- **Pas d'écriture :** aucun prix n'est appliqué depuis un simulateur, le prix se fixe dans « Formules ». Pas d'enregistrement de scénario en v1, export PDF seulement.

### Nutrition (`/dashboard/admin/nutrition`)

- **Suivi :** assuré par un(e) nutritionniste, avec un rôle dédié limité à cette section et les clients en lecture seule.
- **Données par foyer, toutes facultatives :** composition du foyer par tranches d'âge, objectifs, allergies, préférences et interdits alimentaires. Voir le point 4.2 avant d'activer les données sensibles.
- **Côté client :** un questionnaire et ses recommandations dans son espace, aussi envoyés sur WhatsApp.
- **Menus :** bibliothèque de menus hebdomadaires par formule, modifiable par l'admin.
- **Rythme :** un point mensuel, avec un journal dans la fiche client.
- **Packs :** une recommandation ne modifie pas un pack. L'admin la valide en ajoutant des produits à la commande.

## 3. Rôles, ordre et migrations

**Rôles**, vérifiés route par route avec `checkRole` :

| Rôle | Accès |
|---|---|
| admin | tout |
| gestionnaire | commandes, stock, logistique, prestataires |
| comptable | finances ; le reste en lecture seule |
| nutritionniste | nutrition ; les clients en lecture seule |

**Sections pas encore prêtes :** badge « Bientôt » et pas de lien.

**Ordre de développement :**
- 0) correctifs rapides : lien `/commandes`, contrôle d'accès du routeur, icônes `Search` et `Layers` ;
- 1) Prestataires ;
- 2) Logistique ;
- 3) Finances ;
- 4) Simulateurs ;
- 5) Nutrition.

**Migrations**, par un script qu'on peut relancer sans risque :
- fournisseurs en texte → Prestataires ;
- quartiers en texte → zones ;
- statuts de commande « En attente » et « Livré » → nouveaux statuts ;
- taux 571 codé en dur → `ExchangeRate` ;
- budget et dépenses existants importés par CSV.

## 4. Points à confirmer avant de coder

### 4.1 Zones et quartiers (question 20) : décidé

- **Source :** relevé du 2026-10-04 sur toutbenin.com (Localisation 229). Les comptes sont cohérents avec les chiffres officiels : 149 villages et quartiers pour Abomey-Calavi, et 143 quartiers pour Cotonou, auxquels s'ajoutent quelques sous-quartiers.
- **Découpage :** une zone par arrondissement. C'est le découpage officiel, donc fiable, et l'admin pourra ensuite regrouper des zones en secteurs de tournée.

| Commune | Zones (nombre de quartiers ou villages) |
|---|---|
| Cotonou | 1er (13), 2e (13), 3e (13), 4e (12), 5e (15), 6e (19), 7e (11), 8e (8), 9e (6), 10e (9), 11e (13), 12e (19), 13e (14) |
| Abomey-Calavi | Abomey-Calavi centre (21, **prioritaire**), Akassato (14), Godomey (49), Glo-Djigbé (14), Hêvié (9), Kpanroun (9), Ouèdo (8), Togba (11), Zinvié (15) |

**À vérifier dans le fichier :**
- « Calavi Kpota », la zone prioritaire du site, n'apparaît pas sous ce nom dans la liste officielle. Je l'ai ajouté comme « Kpota (Calavi Kpota) » dans Abomey-Calavi centre : le rattachement est à confirmer.
- Certains noms existent dans deux arrondissements (Nouveau Pont, Missité, Gbénonkpo, Fandji, Finafa, Tankpè). Le sélecteur affichera donc « Quartier (arrondissement) ».
- L'orthographe vient de la source et n'a pas été corrigée (par exemple « Cité de l'expériece », « Topka hoho », « Donaten »). Une relecture locale est conseillée.

### 4.2 Données de nutrition et réglementation béninoise (question 30)

Recherche en ligne du 2026-10-04 (à faire valider par un juriste ou par l'APDP) :

- Au Bénin, les données de santé sont des **données sensibles** (Code du numérique, loi n° 2017-20, article 394). Leur traitement est interdit sauf exceptions, dont le **consentement exprès** de la personne : explicite, libre, spécifique, éclairé, de préférence écrit, et retirable à tout moment.
- Le traitement de données sensibles demande une **autorisation préalable de l'APDP**. Les données personnelles ordinaires relèvent d'une déclaration.
- Les allergies et les objectifs de santé (diabète, hypertension) sont des données de santé. Les interdits alimentaires religieux peuvent révéler des convictions religieuses, elles aussi sensibles.
- La base (MongoDB Atlas) et les fichiers (Cloudinary) sont hébergés hors du Bénin : les règles de transfert à l'étranger sont à vérifier.

**Proposition :** la Nutrition arrive en dernier, ce qui laisse le temps de faire la demande d'autorisation. En attendant, la v1 ne collecte que des données non sensibles : composition du foyer, préférences et goûts. Les champs santé et convictions ne seraient activés qu'après l'autorisation de l'APDP, avec une case de consentement exprès, un droit de suppression, et un avis de l'APDP sur le régime applicable aux données que vous gérez déjà.

Sources :
- [Code du numérique du Bénin (loi 2017-20), texte intégral](http://kalieu-elongo.com/wp-content/uploads/2018/03/code-du-numrique-B%C3%A9nin.pdf)
- [Le médecin face aux exigences du livre 5ème du Code du numérique (360 Conseils)](https://360conseils.com/le-medecin-face-aux-exigences-du-livre-5eme-du-code-du-numerique/)
- [APDP : fiche pratique de mise en conformité](https://archive.apdp.bj/wp-content/uploads/2021/11/Fiche.Pratique.Mise-en-conformite_Pt_OK_Validee.pdf)
- [APDP : présentation des régimes de traitement](https://archive.apdp.bj/wp-content/uploads/2021/11/PRESENTATION_REGIMES_TRAITEMENT_AmbroiseZINSOU_2.pdf)

### 4.3 Cohérences à régler côté site

- **Fait (commit dc1bcbf) :** les cartes d'Essentiel, Équilibré et Confort affichent « par mois ». Restent à trancher :
  - l'Essentiel est relancé à 14 jours mais affiché « par mois » : est-ce voulu (un pack couvrant environ deux semaines, deux livraisons par mois) ?
  - les chiffres « repas possibles » et « heures économisées » (par exemple 20–30 repas et 2–4 h pour l'Essentiel) étaient pensés pour une semaine : faut-il les recalculer pour un mois ?
  - Fraîcheur affiche encore « Par semaine » et Réserve « Mensuel / Bi-mensuel ».
- **Décidé :** les modes « Espèces » et « Acompte » sont conservés pour les cas particuliers (voir la section Paiement).
- Le délai de la garantie est maintenant fixé (24 h après le créneau confirmé). Le texte du site (« livrée avec plus de 24h de retard ») peut le préciser.

## 5. Mise en production et suite

### 5.1 Étapes de déploiement (dans cet ordre)

1. **Back** : `npm install` (ajout de `helmet`), puis vérifier les variables d'environnement : `NODE_ENV=production` (cookie `Secure`), `MONGO_URI`, `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL` et `CLOUDINARY_*` (aussi utilisées pour les justificatifs des Finances).
2. **Migration des données**, à lancer une fois, et relançable sans risque : `node src/scripts/migrerDonnees.js`. Elle :
   - remplace l'index unique du téléphone (les comptes sans téléphone ne se bloquent plus) ;
   - crée les fiches des 3 fournisseurs et y relie les lots et bons de commande ;
   - crée les 22 zones et rattache les clients dont le quartier est reconnu ;
   - convertit « Livré » en « Livrée » et les commandes supprimées en « Annulée » ;
   - enregistre le taux USD/FCFA 571.
3. **Référentiel des formules** : `node src/scripts/createFormules.js`. Il restaure les prix officiels, l'état « Bientôt » de Réserve et Fraîcheur, le cycle de relance (14 ou 30 jours) et l'affichage « par mois ».
4. **Comptes de l'équipe** : `STAFF_PASSWORD=… node src/scripts/createStaff.js <email> "<Nom>" <gestionnaire|comptable|nutritionniste|admin>`.
5. **Front** : déployer après le back (le front envoie désormais `fournisseurId`, `zone`, etc.).
6. **Saisies de départ** dans le back-office :
   - livreurs dans Prestataires ;
   - tarifs de course par zone dans Logistique > Zones ;
   - budget de la convention par import CSV dans Finances.

### 5.2 Points restants

- **APDP** : la Nutrition ne collecte aucune donnée de santé. Il reste à vérifier auprès de l'APDP la formalité applicable aux données ordinaires déjà traitées (déclaration), et à demander l'autorisation avant d'ajouter allergies, objectifs de santé ou interdits religieux.
- **Quartiers** : confirmer le rattachement de « Calavi Kpota » et relire l'orthographe de la liste (point 4.1).
- **Lots de stock antérieurs** : ils n'ont pas de dépense d'achat associée. Il faut les saisir à la main dans Finances > Exploitation si besoin.
- **Écrans existants en lecture seule** : en dehors des nouvelles sections et de Commandes, les écrans existants (stock, données de base) affichent encore leurs boutons d'écriture au comptable. Le serveur refuse l'action (403) avec un message, mais il faudrait masquer ces boutons.
- **Hors périmètre de ce développement** (voir l'audit) :
  - images de 11 Mo ;
  - bundle principal de 1,2 Mo ;
  - accessibilité 🟠 (`lang`, contrastes, labels) ;
  - polices de la charte ;
  - SEO local ;
  - limitation des tentatives de connexion ;
  - nom complet unique, qui bloque les homonymes à l'inscription ;
  - texte « x / 16 produits » de l'écran Formules ;
  - cycle de 14 jours de l'Essentiel alors que l'offre est affichée « par mois ».
