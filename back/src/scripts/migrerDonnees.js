// Migration des données existantes vers le modèle du back-office (docs/conception-menu-admin.md, point 39).
// Idempotent : chaque étape vérifie l'état de la base et peut être relancée sans risque.
// Usage : node src/scripts/migrerDonnees.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');

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

const ETAPES = [
  ['Index du téléphone', migrerIndexTelephone],
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
