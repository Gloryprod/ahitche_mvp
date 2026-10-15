const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Formule = require('../models/formules');
const { lienWhatsAppFormule } = require('../services/formuleService');

dotenv.config();

// Référentiel des 5 formules : référentiel packs v4 (30/06/2026) et structure marketing officielle.
// Décisions D-01 à D-04 : prix affichés du v4 (sous le coût réel, modifiables avec journal) ; depuis le 15/10/2026,
// un pack Essentiel, Équilibré ou Confort couvre un mois (prix, repas et heures par mois, relance à 30 jours),
// Réserve et Fraîcheur « bientôt disponibles », prix de Fraîcheur à définir.
// Le script fait un upsert par slug : il crée les formules manquantes et remet les valeurs du référentiel sur les
// formules existantes, sans toucher à prixCommercial (prix fixé par l'admin). Une valeur absente reste vide.
const formulesData = [
  {
    slug: 'ahi-essentiel', nom: 'AHI ESSENTIEL', emoji: '🌿',
    cible: '1 personne · par mois',
    phraseAccroche: 'Les bases de votre mois déjà organisées.',
    promesse: 'Assurez vos repas essentiels sans stress ni déplacements inutiles.',
    foyersCibles: 'Étudiants, jeunes couples, petits foyers urbains, jeunes actifs',
    logiqueCommande: 'Quantités pour 1 personne et 1 mois',
    changementsMax: 2, variationQuantitePct: 50,
    estimationRepas: { min: 20, max: 30 }, heuresEconomisees: { min: 2, max: 4 },
    prixActuel: 10800, cycleJours: 30, estRecommandee: false, bientotDisponible: false
  },
  {
    slug: 'ahi-equilibre', nom: 'AHI ÉQUILIBRÉ', emoji: '🌾',
    cible: 'Couples et familles actives · par mois',
    phraseAccroche: 'Mieux manger sans compliquer votre quotidien.',
    promesse: 'Une alimentation plus variée et mieux organisée pour les foyers actifs.',
    foyersCibles: 'Couples actifs, familles urbaines, professionnels occupés',
    logiqueCommande: "Quantités d'Essentiel × multiplicateurs, par mois",
    changementsMax: 4, variationQuantitePct: 75,
    estimationRepas: { min: 35, max: 50 }, heuresEconomisees: { min: 4, max: 6 },
    prixActuel: 22500, cycleJours: 30, estRecommandee: true, bientotDisponible: false
  },
  {
    slug: 'ahi-confort', nom: 'AHI CONFORT', emoji: '👑',
    cible: 'Familles établies · par mois',
    phraseAccroche: 'Votre cuisine organisée sans stress.',
    promesse: 'Une expérience de ravitaillement complète pensée pour votre confort.',
    foyersCibles: 'Familles établies, professionnels très occupés, clients premium',
    logiqueCommande: "Quantités d'Essentiel × multiplicateurs, par mois ; personnalisation élevée",
    changementsMax: null, variationQuantitePct: null,
    estimationRepas: { min: 60, max: 90 }, heuresEconomisees: { min: 6, max: 10 },
    prixActuel: 50300, cycleJours: 30, estRecommandee: false, bientotDisponible: false
  },
  {
    slug: 'ahi-reserve', nom: 'AHI RÉSERVE', emoji: '📦',
    cible: 'Foyer · volume mensuel ou bimensuel',
    phraseAccroche: '', promesse: '', foyersCibles: '',
    logiqueCommande: 'Quantités fixes en volume, commande libre (mensuelle ou bimensuelle)',
    changementsMax: null, variationQuantitePct: null,
    estimationRepas: { min: null, max: null }, heuresEconomisees: { min: null, max: null },
    prixActuel: 105000, cycleJours: 30, estRecommandee: false, bientotDisponible: true
  },
  {
    slug: 'ahi-fraicheur', nom: 'AHI FRAÎCHEUR', emoji: '🥗',
    cible: 'Produits frais · chaque semaine',
    phraseAccroche: '', promesse: '', foyersCibles: '',
    logiqueCommande: 'Base minimale modulable, commande hebdomadaire libre au moins 2 jours avant, livraison le samedi',
    changementsMax: null, variationQuantitePct: null,
    estimationRepas: { min: null, max: null }, heuresEconomisees: { min: null, max: null },
    prixActuel: null, cycleJours: 7, estRecommandee: false, bientotDisponible: true // Prix « À définir » dans le v4
  }
];

const seedDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) throw new Error("L'URI de la base de données est introuvable dans le fichier .env");
    await mongoose.connect(mongoURI);
    console.log('⏳ Insertion/Mise à jour des formules en cours...');

    for (const formule of formulesData) {
      await Formule.findOneAndUpdate(
        { slug: formule.slug },
        { $set: { ...formule, lienWhatsApp: lienWhatsAppFormule(formule) }, $unset: { ancienPrix: '' } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      console.log(`  ✔ ${formule.nom} : ${formule.prixActuel === null ? 'prix à définir' : `${formule.prixActuel.toLocaleString('fr-FR')} FCFA`}`);
    }

    console.log("✅ Les 5 formules d'Ahitché ont été enregistrées ou remises aux valeurs du référentiel.");
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors du seeding des formules :', error);
    process.exit(1);
  }
};

seedDB();
