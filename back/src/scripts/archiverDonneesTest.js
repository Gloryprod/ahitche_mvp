// Archivage des données de test du stock, avant la saisie des vraies factures d'achat : bons de commande, lots,
// mouvements, dépenses PRÉVUES créées par ces lots, produits hors référentiel.
// Usage :
//   MONGO_URI=<base> node src/scripts/archiverDonneesTest.js <chemin de 03_produits.csv> [--garder REF,REF] [--archiver-produits REF,REF] [--appliquer [--forcer]]
//   Sans --appliquer : simulation en lecture seule (liste puis compte ce qui serait archivé, sans aucun montant).
//   --appliquer : pose deletedAt sur tout ce qui est listé, en une transaction (tout ou rien), et journalise.
//   --forcer : exigé avec --appliquer dès qu'un bon au format facture ou un lot issu d'une réception est présent
//   (ce sont peut-être de vraies factures, saisies après les données de test).
// Ce qui est archivé :
//   - tous les bons de commande actifs ; tous les lots actifs ; tous les mouvements de stock actifs ;
//   - les dépenses NON effectuées créées par ces lots (lotStockId) : jamais une dépense effectuée, jamais une dépense sans lot ;
//   - les produits actifs dont la référence n'est ni dans le CSV ni dans --garder, plus ceux de --archiver-produits.
// Suppression logique seulement : tout reste en base pour l'historique. Le numéro d'un bon archivé est libéré (l'index
// de numeroBon est global) : il devient « <numéro> (archivé le AAAA-MM-JJ HH:mm:ss) ». Relancé, le script ne trouve plus rien.
// L'adresse de la base se passe dans la commande (MONGO_URI) : ce script ne lit pas le fichier .env.
// Atlas annule une transaction de plus de 60 s : chaque liste est chargée une fois, puis archivée par un seul updateMany ;
// la durée de la transaction est affichée.
const fs = require('fs');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/purchaseOrder');
const Product = require('../models/product');
const Expense = require('../models/expense');
const User = require('../models/user');
const AuditLog = require('../models/auditLog');
const { LotStockFifo, MouvementStock } = require('../models/stock');
const { lireCsv } = require('../utils/csv');
const { journaliser } = require('../services/journalService');

const AIDE = `Archivage des données de test du stock (bons, lots, mouvements, dépenses prévues des lots, produits hors référentiel).

Usage :
  MONGO_URI=<base> node src/scripts/archiverDonneesTest.js <chemin de 03_produits.csv> [options]

Options :
  --garder REF,REF             produits à garder bien qu'absents du CSV (ex. --garder MP01,V20,EMB01)
  --archiver-produits REF,REF  produits à archiver même s'ils figurent dans le CSV ou dans --garder (ex. MP02)
  --appliquer                  écrit en base (sans cette option : simulation en lecture seule)
  --forcer                     avec --appliquer : archive aussi les bons au format facture et les lots issus
                               d'une réception (refusé sans cette option : ce sont peut-être de vraies factures)
  --aide                       affiche cette aide

Sous Windows (cmd) :
  set /p MONGO_URI=URI de la base :
  node src/scripts/archiverDonneesTest.js ..\\docs-internes\\imports\\03_produits.csv --garder MP01
  set MONGO_URI=

Toujours : une sauvegarde avant, la base de recette avant la production.`;

const MAX_LISTE_JOURNAL = 60; // Numéros cités dans une ligne du journal (les identifiants sont tous dans « après »)
const DRAPEAUX = ['--appliquer', '--forcer'];

// Date et heure du Bénin, « AAAA-MM-JJ HH:mm:ss »
const horodatage = (date) => new Date(date).toLocaleString('sv-SE', { timeZone: 'Africa/Porto-Novo' });
const secondes = (ms) => `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;

function lireOptions(args) {
  const valeur = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : undefined);
  const references = (texte) => new Set(String(texte || '').split(',').map(r => r.trim().toUpperCase()).filter(Boolean));
  const optionsAvecValeur = ['--garder', '--archiver-produits'];
  for (const nom of optionsAvecValeur) {
    if (args.includes(nom) && (!valeur(nom) || valeur(nom).startsWith('--'))) throw new Error(`${nom} attend une liste de références (ex. ${nom} MP01,V20).`);
  }
  const inconnues = args.filter((a, i) => a.startsWith('--') && ![...optionsAvecValeur, ...DRAPEAUX].includes(a) && !optionsAvecValeur.includes(args[i - 1]));
  if (inconnues.length) throw new Error(`Option inconnue : ${inconnues.join(', ')}`);
  if (args.includes('--forcer') && !args.includes('--appliquer')) throw new Error('--forcer ne s\'emploie qu\'avec --appliquer.');
  const csv = args.find((a, i) => !a.startsWith('--') && !optionsAvecValeur.includes(args[i - 1]));
  return {
    csv, garder: references(valeur('--garder')), forces: references(valeur('--archiver-produits')),
    appliquer: args.includes('--appliquer'), forcer: args.includes('--forcer')
  };
}

// Références du référentiel : colonne « reference » de 03_produits.csv
function referencesDuCsv(chemin) {
  if (!fs.existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}`);
  const [entete, ...lignes] = lireCsv(fs.readFileSync(chemin, 'utf8'));
  const colonne = (entete || []).map(c => c.trim().toLowerCase()).indexOf('reference');
  if (colonne < 0) throw new Error(`Colonne « reference » absente de ${chemin}`);
  const references = new Set(lignes.map(l => (l[colonne] || '').trim().toUpperCase()).filter(Boolean));
  if (!references.size) throw new Error(`Aucune référence lue dans ${chemin}`);
  return references;
}

// Chaque liste est lue une seule fois (dans la transaction avec --appliquer)
async function charger({ references, garder, forces }, session) {
  const q = (requete) => requete.session(session);
  const bons = await q(PurchaseOrder.find({ deletedAt: null }).select('numeroBon numeroFacture typeCommande statut lignes').lean());
  const lots = await q(LotStockFifo.find({ deletedAt: null }).select('numeroLot product bonCommandeId').lean());
  const mouvements = await q(MouvementStock.find({ deletedAt: null }).select('type').lean());
  const depenses = await q(Expense.find({ deletedAt: null, estEffectue: false, lotStockId: { $in: lots.map(l => l._id) } }).select('libelle numeroPiece').lean());
  const actifs = await q(Product.find({ deletedAt: null }).select('reference name type').lean());
  const ref = (p) => (p.reference || '').toUpperCase();
  const produits = actifs.filter(p => forces.has(ref(p)) || (!references.has(ref(p)) && !garder.has(ref(p))));

  const avertissements = [];
  // Les données de test datent d'avant la saisie des factures : un bon au format facture (lignes) ou un lot issu
  // d'une réception est peut-être une vraie facture. --appliquer exige alors --forcer.
  const bonsFacture = bons.filter(b => b.lignes?.length).length;
  const lotsReception = lots.filter(l => l.bonCommandeId).length;
  if (bonsFacture || lotsReception) {
    avertissements.push(`${bonsFacture} bon(s) au nouveau format et ${lotsReception} lot(s) issu(s) d'une réception : vraies factures saisies ? --appliquer exigera --forcer`);
  }
  const connues = new Set(actifs.map(ref));
  for (const r of garder) if (!connues.has(r)) avertissements.push(`--garder ${r} : aucun produit actif ne porte cette référence`);
  for (const r of forces) {
    if (!connues.has(r)) avertissements.push(`--archiver-produits ${r} : aucun produit actif ne porte cette référence`);
    if (garder.has(r)) avertissements.push(`${r} est à la fois dans --garder et --archiver-produits : il est archivé`);
  }
  return { bons, lots, mouvements, depenses, produits, actifs, avertissements, bonsFacture, lotsReception };
}

function afficher(d) {
  const referenceProduit = new Map(d.actifs.map(p => [String(p._id), p.reference || p.name]));
  const lotsParProduit = new Map();
  for (const l of d.lots) lotsParProduit.set(String(l.product), (lotsParProduit.get(String(l.product)) || 0) + 1);
  const parType = {};
  for (const m of d.mouvements) parType[m.type] = (parType[m.type] || 0) + 1;

  console.log(`\nBons de commande actifs (${d.bons.length}) :`);
  for (const b of d.bons) {
    const format = b.lignes?.length ? `${b.typeCommande || 'Bon de commande'}, ${b.lignes.length} ligne(s)` : 'ancien format';
    console.log(`  ${b.numeroBon}${b.numeroFacture ? ` · facture ${b.numeroFacture}` : ''} (${format}, ${b.statut})`);
  }
  console.log(`\nLots actifs (${d.lots.length}) :`);
  for (const l of d.lots) console.log(`  ${l.numeroLot} (${referenceProduit.get(String(l.product)) || 'produit archivé'})${l.bonCommandeId ? ' · issu d\'une réception' : ''}`);
  console.log(`\nMouvements de stock actifs (${d.mouvements.length}) : ${Object.entries(parType).map(([t, n]) => `${t} ${n}`).join(', ') || 'aucun'}`);
  console.log(`\nDépenses prévues (non effectuées) créées par ces lots (${d.depenses.length}) :`);
  for (const e of d.depenses) console.log(`  ${e.numeroPiece ? `pièce ${e.numeroPiece}` : '(sans pièce)'} · ${e.libelle}`);
  console.log(`\nProduits à archiver (${d.produits.length}) :`);
  for (const p of d.produits) {
    const n = lotsParProduit.get(String(p._id)) || 0;
    console.log(`  ${p.reference || '(sans référence)'} · ${p.name} (${p.type}) : ${n ? `${n} lot(s) actif(s), archivés avec le reste` : 'aucun lot actif'}`);
  }
  if (d.avertissements.length) {
    console.log('\nAvertissements :');
    for (const a of d.avertissements) console.log(`  ⚠ ${a}`);
  }
  console.log(`\nTotal : ${d.bons.length} bon(s), ${d.lots.length} lot(s), ${d.mouvements.length} mouvement(s), ${d.depenses.length} dépense(s) prévue(s), ${d.produits.length} produit(s).`);
}

const citer = (liste) => (liste.length > MAX_LISTE_JOURNAL ? `${liste.slice(0, MAX_LISTE_JOURNAL).join(', ')}… et ${liste.length - MAX_LISTE_JOURNAL} autre(s)` : liste.join(', '));

async function archiver(d, req, session) {
  const maintenant = new Date();
  const suffixe = ` (archivé le ${horodatage(maintenant)})`;
  const ids = (liste) => liste.map(x => x._id);
  const poser = async (Modele, liste, filtre = {}) => (liste.length
    ? (await Modele.updateMany({ _id: { $in: ids(liste) }, deletedAt: null, ...filtre }, { $set: { deletedAt: maintenant } }, { session })).modifiedCount
    : 0);

  const resultat = {
    // Bons : le numéro est libéré en un seul updateMany (pipeline) : « <numéro> (archivé le …) »
    bons: d.bons.length
      ? (await PurchaseOrder.updateMany(
        { _id: { $in: ids(d.bons) }, deletedAt: null },
        [{ $set: { deletedAt: maintenant, numeroBon: { $concat: [{ $ifNull: ['$numeroBon', ''] }, suffixe] } } }],
        { session, updatePipeline: true }
      )).modifiedCount
      : 0,
    lots: await poser(LotStockFifo, d.lots),
    mouvements: await poser(MouvementStock, d.mouvements),
    // Garde-fou : jamais une dépense effectuée, jamais une dépense sans lot
    depenses: await poser(Expense, d.depenses, { estEffectue: false, lotStockId: { $ne: null } }),
    produits: await poser(Product, d.produits)
  };

  // Une ligne de journal par famille : les numéros dans le résumé, tous les identifiants dans « après »
  const entrees = [
    ['Bon de commande', d.bons, `${resultat.bons} bon(s) de commande archivé(s), numéros libérés (suffixe «${suffixe} »)`, d.bons.map(b => b.numeroBon)],
    ['Lot de stock', d.lots, `${resultat.lots} lot(s) archivé(s)`, d.lots.map(l => l.numeroLot)],
    ['Mouvement de stock', d.mouvements, `${resultat.mouvements} mouvement(s) de stock archivé(s)`, []],
    ['Dépense', d.depenses, `${resultat.depenses} dépense(s) prévue(s) créée(s) par ces lots archivée(s)`, d.depenses.map(e => e.numeroPiece || e.libelle)],
    ['Produit', d.produits, `${resultat.produits} produit(s) hors référentiel archivé(s)`, d.produits.map(p => [p.reference, p.name].filter(Boolean).join(' · '))]
  ];
  for (const [entite, liste, resume, numeros] of entrees) {
    if (!liste.length) continue;
    await journaliser(req, {
      action: 'Suppression', entite,
      resume: `Archivage des données de test : ${resume}${numeros.length ? ` (${citer(numeros)})` : ''}`,
      apres: { ids: ids(liste).map(String) }
    }, session);
  }
  return resultat;
}

async function executer() {
  const debut = Date.now();
  const args = process.argv.slice(2);
  if (args.some(a => ['--aide', '--help', '-h'].includes(a))) { console.log(AIDE); return; }

  let options;
  try {
    options = lireOptions(args);
    if (!options.csv) throw new Error('Indiquez le chemin de 03_produits.csv.');
    options.references = referencesDuCsv(options.csv);
  } catch (error) {
    console.error(`❌ ${error.message}\n\n${AIDE}`);
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI manquant : passez l\'adresse de la base dans la commande (jamais dans un fichier).');
    process.exitCode = 1;
    return;
  }

  let session = null;
  let debutTransaction = null;
  let dureeTransaction = null;
  const finTransaction = () => { if (debutTransaction && dureeTransaction === null) dureeTransaction = Date.now() - debutTransaction; };
  try {
    try {
      await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
    } catch (error) {
      // Message court, sans l'adresse complète (elle peut contenir le mot de passe)
      throw new Error(`connexion à la base impossible (${String(error.message).replace(/mongodb(\+srv)?:\/\/\S+/g, '<adresse masquée>')}).`);
    }
    console.log(`Base : ${mongoose.connection.name} (hôte ${mongoose.connection.host})`);
    console.log(`Référentiel : ${options.references.size} référence(s) dans le CSV${options.garder.size ? ` ; gardés : ${[...options.garder].join(', ')}` : ''}${options.forces.size ? ` ; à archiver d'office : ${[...options.forces].join(', ')}` : ''}`);

    if (!options.appliquer) {
      const donnees = await charger(options, null);
      console.log('🔎 SIMULATION (lecture seule, rien n\'est enregistré)');
      afficher(donnees);
      return;
    }

    // Journal : au nom de l'admin principal (à défaut, du premier admin), comme les autres scripts de mise en service
    const admin = await User.findOne({ role: 'admin' }).sort({ adminPrincipal: -1, createdAt: 1 }).select('_id');
    if (!admin) throw new Error("Aucun compte admin : le journal ne peut pas être alimenté.");
    const req = { user: { id: admin._id, role: 'admin' } };
    await AuditLog.createCollection(); // Hors transaction : collection créée vide si elle manque

    session = await mongoose.startSession();
    debutTransaction = Date.now();
    session.startTransaction();
    const donnees = await charger(options, session);
    afficher(donnees);

    // Vraies factures possibles : jamais archivées sans --forcer
    if ((donnees.bonsFacture || donnees.lotsReception) && !options.forcer) {
      await session.abortTransaction();
      finTransaction();
      console.error(`\n❌ Refus, rien n'a été archivé : ${donnees.bonsFacture} bon(s) au format facture et ${donnees.lotsReception} lot(s) issu(s) d'une réception.`);
      console.error('   Ce sont peut-être de vraies factures, saisies après les données de test (outil saisirFacture.js ou réception d\'un bon).');
      console.error('   Vérifiez la liste ci-dessus ; s\'il s\'agit bien de données de test, relancez avec --appliquer --forcer.');
      process.exitCode = 1;
      return;
    }
    const total = donnees.bons.length + donnees.lots.length + donnees.mouvements.length + donnees.depenses.length + donnees.produits.length;
    if (!total) {
      await session.abortTransaction();
      finTransaction();
      console.log('\nRien à archiver : aucune écriture.');
      return;
    }
    const resultat = await archiver(donnees, req, session);
    await session.commitTransaction();
    finTransaction();
    console.log(`\n✅ ARCHIVAGE APPLIQUÉ : ${resultat.bons} bon(s), ${resultat.lots} lot(s), ${resultat.mouvements} mouvement(s), ${resultat.depenses} dépense(s), ${resultat.produits} produit(s).`);
  } catch (error) {
    if (session?.inTransaction()) {
      try { await session.abortTransaction(); } catch { /* déjà annulée */ }
    }
    finTransaction();
    console.error('❌ Arrêt, rien n\'a été enregistré :', error.message);
    process.exitCode = 1;
  } finally {
    if (session) session.endSession();
    await mongoose.disconnect();
    // Durée : Atlas annule une transaction de plus de 60 s
    console.log(`Durée : ${secondes(Date.now() - debut)}${dureeTransaction !== null ? ` (dont transaction : ${secondes(dureeTransaction)})` : ''}`);
  }
}

executer();
