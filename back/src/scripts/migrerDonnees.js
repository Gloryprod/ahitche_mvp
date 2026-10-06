// Migration des données existantes vers le modèle du back-office (docs/conception-menu-admin.md, point 39).
// Idempotent : chaque étape vérifie l'état de la base et peut être relancée sans risque.
// Usage : node src/scripts/migrerDonnees.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');
const Product = require('../models/product');
require('../models/compositionRule'); // Pour peupler la règle des anciens produits
const Partner = require('../models/partner');
const PurchaseOrder = require('../models/purchaseOrder');
const { LotStockFifo } = require('../models/stock');
const Zone = require('../models/zone');
const Order = require('../models/order');
const ExchangeRate = require('../models/exchangeRate');
const { TAUX_CONVENTION } = require('../services/journalService');
const { normaliser } = require('../utils/texte');

dotenv.config();

// Étape 1 : l'ancien index unique sur le téléphone bloquait tous les comptes sans téléphone
async function migrerIndexTelephone() {
  const index = await User.collection.indexes();
  const ancien = index.find(i => i.name === 'telephone_1');
  if (ancien) {
    await User.collection.dropIndex('telephone_1');
    console.log("  ✔ Ancien index unique 'telephone_1' supprimé");
  }
  // Les comptes enregistrés avec un téléphone vide ne doivent pas compter comme un numéro
  const vides = await User.updateMany({ telephone: '' }, { $unset: { telephone: 1 } });
  if (vides.modifiedCount) console.log(`  ✔ ${vides.modifiedCount} téléphone(s) vide(s) retiré(s)`);
  await User.syncIndexes();
  console.log('  ✔ Index du téléphone : unique seulement quand il est renseigné');
}

// Étape 2 : les fournisseurs saisis en texte sur les lots de stock et les bons de commande deviennent des
// fiches Prestataires, et ces lots et bons sont reliés à leur fiche. Aucun nom n'est écrit dans le code :
// ils sont lus dans la base (les noms de fournisseurs sont confidentiels).
const SANS_FICHE = ['', 'Autre', 'Production interne'];

async function migrerFournisseurs() {
  const noms = new Set([
    ...await LotStockFifo.distinct('fournisseur', { fournisseurId: null, deletedAt: null }),
    ...await PurchaseOrder.distinct('fournisseur', { fournisseurId: null, deletedAt: null }),
  ].map(n => String(n || '').trim()).filter(n => !SANS_FICHE.includes(n)));

  for (const nom of noms) {
    let fiche = await Partner.findOne({ nom, type: 'Fournisseur', deletedAt: null });
    if (!fiche) {
      fiche = await Partner.create({ nom, type: 'Fournisseur', notes: 'Créé par la migration (fournisseur saisi en texte).' });
      console.log('  ✔ Fiche fournisseur créée');
    }
    const lots = await LotStockFifo.updateMany({ fournisseur: nom, fournisseurId: null }, { $set: { fournisseurId: fiche._id } });
    const bons = await PurchaseOrder.updateMany({ fournisseur: nom, fournisseurId: null }, { $set: { fournisseurId: fiche._id } });
    if (lots.modifiedCount || bons.modifiedCount) {
      console.log(`  ✔ ${lots.modifiedCount} lot(s) et ${bons.modifiedCount} bon(s) de commande reliés à leur fiche`);
    }
  }
  if (!noms.size) console.log('  ✔ Aucun fournisseur en texte à rattacher');
  const sansFiche = await LotStockFifo.countDocuments({ fournisseurId: null, deletedAt: null, fournisseur: { $nin: ['Production interne'] } });
  if (sansFiche) console.log(`  ⚠ ${sansFiche} lot(s) sans fiche fournisseur : à rattacher à la main si besoin`);
}

// Étape 3 : zones de livraison (référentiel data/zones-livraison.json), puis rattachement
// des quartiers saisis en texte libre par les clients. Le tarif de course et l'activation
// réglés dans l'admin ne sont jamais écrasés.
async function migrerZones() {
  const { zones } = require('../data/zones-livraison.json');
  for (const z of zones) {
    const res = await Zone.updateOne(
      { code: z.id },
      { $set: { commune: z.commune, nom: z.nom, quartiers: z.quartiers }, $setOnInsert: { prioritaire: z.prioritaire } },
      { upsert: true }
    );
    if (res.upsertedCount) console.log(`  ✔ Zone créée : ${z.nom} (${z.commune})`);
  }

  // Index quartier normalisé -> [{ code de zone, nom officiel du quartier }]
  // (un même nom peut exister dans deux arrondissements)
  const index = new Map();
  for (const z of await Zone.find()) {
    for (const q of z.quartiers) {
      // « Kpota (Calavi Kpota) » se retrouve aussi sous « Kpota » et « Calavi Kpota »
      const variantes = new Set([q, q.replace(/\s*\(.*\)\s*$/, ''), (/\((.*)\)/.exec(q) || [])[1]].filter(Boolean).map(normaliser));
      for (const cle of variantes) {
        const trouves = index.get(cle) || [];
        if (!trouves.some(t => t.code === z.code)) index.set(cle, [...trouves, { code: z.code, quartier: q }]);
      }
    }
  }

  let rattaches = 0, ambigus = 0, inconnus = 0;
  const clients = await User.find({ role: 'user', zone: null, quartier: { $nin: [null, ''] } });
  for (const client of clients) {
    const trouves = index.get(normaliser(client.quartier)) || [];
    if (trouves.length === 1) {
      // Nom officiel du quartier : il correspond ainsi à une option du formulaire d'adresse
      client.zone = trouves[0].code;
      client.quartier = trouves[0].quartier;
      await client.save();
      rattaches++;
    } else if (trouves.length > 1) ambigus++;
    else inconnus++;
  }
  console.log(`  ✔ Clients : ${rattaches} rattaché(s) à une zone, ${ambigus} quartier(s) présent(s) dans plusieurs zones, ${inconnus} quartier(s) hors liste`);
  if (ambigus || inconnus) console.log('  ⚠ Ces clients restent en « Autre quartier » : leur zone se choisit à la prochaine mise à jour de leur adresse');
}

// Étape 4 : anciens statuts de commande -> nouveaux statuts (passage par la collection : l'ancienne
// valeur « Livré » n'est plus acceptée par le modèle)
async function migrerStatutsCommandes() {
  const commandes = Order.collection;
  // Avant ce suivi, une commande livrée était considérée comme payée : la référence n'était pas saisie
  const livrees = await commandes.updateMany(
    { statut: 'Livré' },
    { $set: { statut: 'Livrée', 'paiement.statut': 'Payé', 'paiement.note': 'Livrée avant le suivi des paiements (référence non saisie).' } }
  );
  const annulees = await commandes.updateMany(
    { deletedAt: { $ne: null }, statut: { $nin: ['Annulée', 'Livrée'] } },
    { $set: { statut: 'Annulée' } }
  );
  console.log(`  ✔ ${livrees.modifiedCount} commande(s) « Livré » -> « Livrée », ${annulees.modifiedCount} commande(s) supprimée(s) -> « Annulée »`);
}

// Étape 5 : le taux USD/FCFA 571 (Convention N°171), codé en dur jusqu'ici, devient le premier taux enregistré
async function migrerTaux() {
  if (await ExchangeRate.exists({})) {
    console.log('  ✔ Un taux USD/FCFA est déjà enregistré');
    return;
  }
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    console.log('  ⚠ Aucun compte admin : taux non enregistré (571 reste utilisé par défaut)');
    return;
  }
  await ExchangeRate.create({ tauxUsdFcfa: TAUX_CONVENTION, creePar: admin._id });
  console.log(`  ✔ Taux de la convention enregistré : 1 USD = ${TAUX_CONVENTION} FCFA`);
}

// Étape 6 : un admin principal, seul compte de l'équipe sans déconnexion après 1 h d'inactivité
async function migrerAdminPrincipal() {
  const principal = await User.findOne({ role: 'admin', adminPrincipal: true });
  if (principal) {
    console.log(`  ✔ Admin principal déjà désigné : ${principal.email}`);
    return;
  }
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    console.log('  ⚠ Aucun compte admin : admin principal non désigné');
    return;
  }
  await User.updateOne({ _id: admin._id }, { $set: { adminPrincipal: true } });
  console.log(`  ✔ Admin principal désigné (plus ancien compte admin) : ${admin.email}`);
}

// Étape 7 : catalogue à quantités explicites par pack (décision D-14). Les produits de l'ancien catalogue
// (sans quantités) reçoivent celles que donnait l'ancienne règle, marquées « à vérifier » ; le catalogue du
// référentiel v4 les remplacera à l'import.
async function migrerQuantitesProduits() {
  const anciens = await Product.find({ deletedAt: null, 'quantites.essentiel': null, 'quantites.equilibre': null, 'quantites.confort': null, baseQuantity: { $gt: 0 } }).populate('compositionRule');
  for (const p of anciens) {
    const base = p.baseQuantity;
    p.quantites = {
      essentiel: base,
      equilibre: base * (p.compositionRule?.multiplierEquilibre ?? 2), // Valeurs par défaut de l'ancien calcul
      confort: base * (p.compositionRule?.multiplierConfort ?? 5),
      reserve: null,
      fraicheur: null
    };
    p.commentaire = [p.commentaire, 'Quantités reprises de l\'ancienne règle : à vérifier'].filter(Boolean).join(' ; ');
    await p.save();
  }
  console.log(anciens.length ? `  ⚠ ${anciens.length} produit(s) de l'ancien catalogue : quantités reprises de l'ancienne règle, à vérifier` : '  ✔ Aucun produit sans quantités par pack');
}

// Étape 8 : l'index unique des numéros de lot était mal déclaré et n'a jamais protégé contre les doublons.
// Les doublons éventuels sont signalés (jamais renommés) ; l'index n'est créé que s'il n'y en a aucun.
async function migrerIndexLots() {
  const doublons = await LotStockFifo.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$numeroLot', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);
  if (doublons.length) {
    console.log(`  ⚠ ${doublons.length} numéro(s) de lot en double, à corriger à la main avant l'index : ${doublons.map(d => d._id).join(', ')}`);
    return;
  }
  await LotStockFifo.createIndexes();
  console.log('  ✔ Numéros de lot uniques (index en place)');
}

// Étape 9 : idées de repas (D-18) : un ancien menu sans statut attend la validation du porteur (jamais publié d'office)
async function migrerIdeesRepas() {
  const { MenuType } = require('../models/nutrition');
  const res = await MenuType.updateMany({ statut: { $exists: false } }, { $set: { statut: 'À valider' } });
  console.log(res.modifiedCount ? `  ⚠ ${res.modifiedCount} ancien(s) menu(s) passé(s) « à valider » : plus visibles des clients avant validation` : '  ✔ Aucun ancien menu à reprendre');
}

const ETAPES = [
  ['Index du téléphone', migrerIndexTelephone],
  ['Fournisseurs vers Prestataires', migrerFournisseurs],
  ['Zones de livraison', migrerZones],
  ['Statuts des commandes', migrerStatutsCommandes],
  ['Taux USD/FCFA', migrerTaux],
  ['Admin principal', migrerAdminPrincipal],
  ['Quantités des produits par pack', migrerQuantitesProduits],
  ['Numéros de lot uniques', migrerIndexLots],
  ['Idées de repas', migrerIdeesRepas],
];

async function migrer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    for (const [nom, etape] of ETAPES) {
      console.log(`⏳ ${nom}`);
      await etape();
    }
    console.log('✅ Migration terminée.');
  } catch (error) {
    console.error('❌ Erreur pendant la migration :', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrer();
