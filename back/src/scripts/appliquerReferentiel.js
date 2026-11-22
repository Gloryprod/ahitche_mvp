// Applique au catalogue les changements d'une version du référentiel des packs, à partir d'un fichier CSV rangé dans
// docs-internes/ (jamais dans le code). Même traitement que l'import du référentiel de l'écran Produits de l'admin :
// règles et colonnes dans services/referentielService.js.
// Usage : node src/scripts/appliquerReferentiel.js <fichier.csv> [--appliquer]
//   Sans --appliquer : simulation (transaction annulée) et rapport des changements.
// Une ligne en erreur arrête tout : rien n'est écrit. Journal au nom de l'admin principal.
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/user');
const { importerReferentiel } = require('../services/referentielService');

dotenv.config();

async function executer() {
  const fichier = process.argv.slice(2).find(a => !a.startsWith('--'));
  const enregistrer = process.argv.includes('--appliquer');
  if (!fichier) { console.error('Usage : node src/scripts/appliquerReferentiel.js <fichier.csv> [--appliquer]'); process.exit(1); }
  const texte = fs.readFileSync(fichier, 'utf8');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const session = await mongoose.startSession();
  let resultat = null;
  try {
    const porteur = await User.findOne({ adminPrincipal: true });
    if (!porteur) throw new Error('aucun admin principal en base (journal impossible)');
    resultat = await importerReferentiel({ user: { id: porteur._id, role: 'admin' } }, texte, enregistrer, session);
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error(`❌ Arrêt, rien n'a été enregistré : ${error.message}`);
    process.exitCode = 1;
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
  if (!resultat) return;
  const { corps } = resultat;
  if (!corps.lignes) { console.error(`❌ ${corps.message}`); process.exitCode = 1; return; }
  const etiquette = (l) => `${l.reference} « ${l.produit} »`;
  if (corps.resume.erreurs) {
    console.error(`❌ Arrêt : ${corps.message}`);
    for (const l of corps.lignes.filter(x => x.statut === 'erreur')) console.error(`  Ligne ${l.ligne}, ${etiquette(l)} : ${l.messages.join(' ; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(enregistrer ? '✅ RÉFÉRENTIEL APPLIQUÉ' : '🔎 SIMULATION (rien n\'a été enregistré)');
  const changes = corps.lignes.filter(l => l.statut === 'creation' || l.statut === 'modification');
  console.log(changes.length ? changes.map(l => `  ${etiquette(l)} : ${l.changements.join(' ; ')}`).join('\n') : '  Aucun changement : le catalogue suit déjà le fichier.');
}

executer();
