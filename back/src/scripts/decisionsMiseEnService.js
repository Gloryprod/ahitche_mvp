// Décisions du porteur pour la mise en service (07/10/2026), à lancer APRÈS migrerDonnees, createFormules et l'import.
// Usage : node src/scripts/decisionsMiseEnService.js <dossier des CSV> [--appliquer]
//   Sans --appliquer : simulation (transaction annulée) et rapport.
// 1. Prix fixés par l'admin remis à vide : le référentiel v4 s'applique (D-01).
// 2. Lots absents de l'état de stock du 25/09 (fichier 09) archivés ; règles de composition hors référentiel
//    (fichier 02) et inutilisées archivées. Suppression logique : tout reste en base pour l'historique.
// 3. Commandes « En attente » créées avant l'ouverture : annulées (commandes d'essai) ; références manquantes ou en
//    double remplacées par une référence unique, puis index unique sur la référence.
// 4. Compte générique admin@ahitche.bj supprimé ; seul le porteur (admin principal du fichier 11) reste admin principal.
// Chaque action est journalisée.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Formule = require('../models/formules');
const CompositionRule = require('../models/compositionRule');
const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const { LotStockFifo, MouvementStock } = require('../models/stock');
const { lireCsv } = require('../utils/csv');
const { normaliser } = require('../utils/texte');
const { journaliser } = require('../services/journalService');
const { genererReferenceCommande } = require('../services/orderReferenceService');

dotenv.config();

const OUVERTURE = new Date('2026-09-25T23:59:59+01:00'); // État de référence : 0 commande réelle au 25/09/2026
const COMPTE_GENERIQUE = 'admin@ahitche.bj';
const rapport = [];

function lire(dossier, nom) {
  const [entete, ...lignes] = lireCsv(fs.readFileSync(path.join(dossier, nom), 'utf8'));
  return lignes.map(c => Object.fromEntries(entete.map((k, i) => [k.trim(), (c[i] ?? '').trim()])));
}

async function prixAdmin(req, s) {
  const formules = await Formule.find({ prixCommercial: { $ne: null } }).session(s);
  for (const f of formules) {
    const avant = f.prixCommercial;
    f.prixCommercial = null;
    await f.save({ session: s });
    await journaliser(req, { action: 'Modification', entite: 'Prix formule', entiteId: f._id, resume: `${f.nom} : prix fixé par l'admin (${avant} FCFA) retiré, prix du référentiel ${f.prixActuel ?? 'à définir'} (D-01)`, avant: { prixCommercial: avant }, apres: { prixCommercial: null } }, s);
    rapport.push(`Prix : ${f.slug} ${avant} FCFA -> référentiel ${f.prixActuel ?? 'vide'}`);
  }
  if (!formules.length) rapport.push('Prix : aucun prix fixé par l\'admin');
}

async function archiverLots(dossier, req, s) {
  const reference = new Set(lire(dossier, '09_stock_depart.csv').map(l => l.numero_lot).filter(Boolean));
  const lots = await LotStockFifo.find({ deletedAt: null, numeroLot: { $nin: [...reference] }, transformationId: null }).session(s);
  for (const lot of lots) {
    lot.deletedAt = new Date();
    await lot.save({ session: s });
    if (lot.quantiteRestante > 0) {
      await MouvementStock.create([{ product: lot.product, lotId: lot._id, type: 'correction_negative', quantite: lot.quantiteRestante, motif: `Lot ${lot.numeroLot} archivé : absent de l'état de stock du 25/09/2026`, responsable: 'Mise en service' }], { session: s });
    }
    await journaliser(req, { action: 'Suppression', entite: 'Lot de stock', entiteId: lot._id, resume: `Lot ${lot.numeroLot} archivé (absent de l'état de stock du 25/09/2026, reste ${lot.quantiteRestante ?? 'non compté'})` }, s);
    rapport.push(`Lot archivé : ${lot.numeroLot} (reste ${lot.quantiteRestante})`);
  }
  if (!lots.length) rapport.push('Lots : aucun lot hors état de stock');
}

async function archiverRegles(dossier, req, s) {
  const noms = new Set(lire(dossier, '02_regles.csv').map(l => normaliser(l.regle)));
  const regles = await CompositionRule.find({ deletedAt: null }).session(s);
  for (const r of regles.filter(x => !noms.has(normaliser(x.name)))) {
    const utilisee = await Product.exists({ deletedAt: null, compositionRule: r._id }).session(s);
    if (utilisee) { rapport.push(`Règle gardée (encore utilisée) : ${r.name}`); continue; }
    r.deletedAt = new Date();
    await r.save({ session: s });
    await journaliser(req, { action: 'Suppression', entite: 'Règle de composition', entiteId: r._id, resume: `Règle « ${r.name} » archivée (hors référentiel v4, inutilisée)` }, s);
    rapport.push(`Règle archivée : ${r.name}`);
  }
}

async function commandesEssai(req, admin, s) {
  const essais = await Order.find({ statut: 'En attente', deletedAt: null, createdAt: { $lte: OUVERTURE } }).session(s);
  for (const o of essais) {
    o.statut = 'Annulée';
    o.deletedAt = new Date();
    o.notes = [o.notes, 'Annulée à la mise en service : commande d\'essai avant l\'ouverture'].filter(Boolean).join(' ; ');
    o.historique.push({ statut: 'Annulée', date: new Date(), par: admin._id });
    await o.save({ session: s, validateBeforeSave: false });
    await journaliser(req, { action: 'Modification', entite: 'Commande', entiteId: o._id, resume: `Commande ${o.reference || '(sans référence)'} annulée : essai avant l'ouverture` }, s);
    rapport.push(`Commande annulée : ${o.reference || '(sans référence)'} du ${o.createdAt.toISOString().slice(0, 10)}`);
  }
  // Références manquantes ou en double : une référence unique, dans l'ordre de création
  const toutes = await Order.find().sort({ createdAt: 1 }).session(s);
  const vues = new Set();
  for (const o of toutes) {
    if (o.reference && /^CMD-\d+$/.test(o.reference) && !vues.has(o.reference)) { vues.add(o.reference); continue; }
    const avant = o.reference || '(sans référence)';
    o.reference = await genererReferenceCommande(s);
    vues.add(o.reference);
    await o.save({ session: s, validateBeforeSave: false });
    await journaliser(req, { action: 'Modification', entite: 'Commande', entiteId: o._id, resume: `Référence ${avant} remplacée par ${o.reference} (manquante ou en double)` }, s);
    rapport.push(`Référence : ${avant} -> ${o.reference}`);
  }
}

async function compteGenerique(dossier, s) {
  const porteur = lire(dossier, '11_equipe.csv').find(l => normaliser(l.admin_principal) === 'oui');
  const compte = porteur && await User.findOne({ email: porteur.email.toLowerCase(), role: 'admin' }).session(s);
  if (!compte) throw new Error("Compte du porteur introuvable : lancer l'import (11_equipe.csv) avant ces décisions.");
  await User.updateMany({ _id: { $ne: compte._id }, adminPrincipal: true }, { $set: { adminPrincipal: false } }, { session: s });
  await User.updateOne({ _id: compte._id }, { $set: { adminPrincipal: true } }, { session: s });
  const generique = await User.findOne({ email: COMPTE_GENERIQUE }).session(s);
  if (generique) {
    await User.deleteOne({ _id: generique._id }, { session: s });
    await journaliser({ user: { id: compte._id, role: 'admin' } }, { action: 'Suppression', entite: 'Compte', entiteId: generique._id, resume: `Compte générique ${COMPTE_GENERIQUE} supprimé ; admin principal : le porteur` }, s);
    rapport.push(`Compte supprimé : ${COMPTE_GENERIQUE}`);
  } else rapport.push(`Compte générique ${COMPTE_GENERIQUE} : absent`);
  rapport.push('Admin principal : le porteur, seul');
  return compte;
}

async function executer() {
  const dossier = process.argv.slice(2).find(a => !a.startsWith('--'));
  const appliquer = process.argv.includes('--appliquer');
  if (!dossier) { console.error('Usage : node src/scripts/decisionsMiseEnService.js <dossier des CSV> [--appliquer]'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const session = await mongoose.startSession();
  let reussi = false;
  try {
    session.startTransaction();
    const porteur = await compteGenerique(dossier, session);
    const req = { user: { id: porteur._id, role: 'admin' } };
    await prixAdmin(req, session);
    await archiverLots(dossier, req, session);
    await archiverRegles(dossier, req, session);
    await commandesEssai(req, porteur, session);
    if (appliquer) await session.commitTransaction(); else await session.abortTransaction();
    reussi = true;
    // Index unique sur la référence, une fois les doublons corrigés (hors transaction)
    if (appliquer) { await Order.createIndexes(); rapport.push('Index unique des références de commande : en place'); }
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error('❌ Arrêt, rien n\'a été enregistré :', error.message);
    process.exitCode = 1;
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
  if (!reussi) return;
  console.log(appliquer ? '✅ DÉCISIONS APPLIQUÉES' : '🔎 SIMULATION (rien n\'a été enregistré)');
  rapport.forEach(r => console.log('  ' + r));
}

executer();
