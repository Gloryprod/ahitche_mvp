// Contrôles de la section B.4, en lecture seule : aucune écriture en base.
// Usage : node src/scripts/controlerDonnees.js [--attendu <fichier JSON des valeurs attendues, hors Git>]
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { controlerDonnees, comparerControles } = require('../services/controleDonneesService');

dotenv.config();

async function controler() {
  const args = process.argv.slice(2);
  const fichier = args.includes('--attendu') ? args[args.indexOf('--attendu') + 1] : null;
  try {
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    const obtenu = await controlerDonnees();
    const attendu = fichier ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : null;
    for (const ligne of comparerControles(obtenu, attendu)) console.log(ligne);
  } catch (error) {
    console.error('❌ Contrôle impossible :', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

controler();
