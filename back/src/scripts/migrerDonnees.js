// Migration des données existantes vers le modèle du back-office (docs/conception-menu-admin.md, point 39).
// Idempotent : chaque étape vérifie l'état de la base et peut être relancée sans risque.
// Usage : node src/scripts/migrerDonnees.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');
const Partner = require('../models/partner');
const PurchaseOrder = require('../models/purchaseOrder');
const { LotStockFifo } = require('../models/stock');

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

// Étape 2 : les 3 fournisseurs de la liste figée deviennent des fiches Prestataires,
// et les lots de stock et bons de commande existants sont reliés à leur fiche
const FOURNISSEURS_HISTORIQUES = ['ETS EUROHI & FILS', 'AHOUANDJO DAVID', 'Hananim Distribution'];

async function migrerFournisseurs() {
  for (const nom of FOURNISSEURS_HISTORIQUES) {
    let fiche = await Partner.findOne({ nom, type: 'Fournisseur', deletedAt: null });
    if (!fiche) {
      fiche = await Partner.create({ nom, type: 'Fournisseur', notes: 'Créé par la migration (ancienne liste de fournisseurs).' });
      console.log(`  ✔ Fiche créée : ${nom}`);
    }
    const lots = await LotStockFifo.updateMany({ fournisseur: nom, fournisseurId: null }, { $set: { fournisseurId: fiche._id } });
    const bons = await PurchaseOrder.updateMany({ fournisseur: nom, fournisseurId: null }, { $set: { fournisseurId: fiche._id } });
    if (lots.modifiedCount || bons.modifiedCount) {
      console.log(`  ✔ ${nom} : ${lots.modifiedCount} lot(s) et ${bons.modifiedCount} bon(s) de commande reliés`);
    }
  }
  const sansFiche = await LotStockFifo.countDocuments({ fournisseurId: null, deletedAt: null });
  if (sansFiche) console.log(`  ⚠ ${sansFiche} lot(s) « Autre » sans fiche : à rattacher à la main si besoin`);
}

const ETAPES = [
  ['Index du téléphone', migrerIndexTelephone],
  ['Fournisseurs vers Prestataires', migrerFournisseurs],
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
