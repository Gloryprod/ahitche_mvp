// Inventaire d'une base (production ou recette) en LECTURE SEULE : aucune écriture, aucun index créé.
// N'affiche que des nombres et des états : ni nom, ni e-mail, ni téléphone, ni montant du budget.
// Usage : MONGO_URI=<utilisateur en lecture seule> node src/scripts/inventaireBase.js
// L'adresse de connexion se passe dans la commande, jamais dans un fichier.
const mongoose = require('mongoose');

async function inventaire() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI manquant (utilisateur en lecture seule).'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, readPreference: 'secondaryPreferred' });
  const db = mongoose.connection.db;
  const existe = async (nom) => (await db.listCollections({ name: nom }).toArray()).length > 0;
  const compter = async (nom, filtre = {}) => (await existe(nom) ? db.collection(nom).countDocuments(filtre) : 'collection absente');
  const grouper = async (nom, champ, filtre = {}) => (await existe(nom)
    ? Object.fromEntries((await db.collection(nom).aggregate([{ $match: filtre }, { $group: { _id: '$' + champ, n: { $sum: 1 } } }]).toArray()).map(g => [String(g._id ?? 'vide'), g.n]))
    : 'collection absente');

  const r = {};
  r.base = db.databaseName;
  r.collections = (await db.listCollections().toArray()).map(c => c.name).sort();
  r.comptesParRole = await grouper('users', 'role');
  r.adminPrincipal = await compter('users', { adminPrincipal: true });
  r.compteAdminGenerique = await compter('users', { email: 'admin@ahitche.bj' }); // Compte créé par createAdmin.js
  r.indexTelephone = (await existe('users')) ? (await db.collection('users').indexes()).map(i => i.name).filter(n => /telephone/.test(n)) : [];
  r.categories = await compter('categories', { deletedAt: null });
  r.reglesComposition = await compter('compositionrules', { deletedAt: null });
  r.produits = {
    actifs: await compter('products', { deletedAt: null }),
    avecReference: await compter('products', { deletedAt: null, reference: { $nin: [null, ''] } }),
    ancienModele: await compter('products', { deletedAt: null, 'quantites.essentiel': { $exists: false } }),
    parType: await grouper('products', 'type', { deletedAt: null })
  };
  r.formules = (await existe('formules'))
    ? (await db.collection('formules').find().project({ _id: 0, slug: 1, statut: 1, prixActuel: 1, prixCommercial: 1, ancienPrix: 1, cycleJours: 1, bientotDisponible: 1 }).toArray())
    : 'collection absente';
  r.commandesParStatut = await grouper('orders', 'statut');
  r.commandesSupprimees = await compter('orders', { deletedAt: { $ne: null } });
  r.clients = await compter('users', { role: 'user' });
  r.prestatairesParType = await grouper('partners', 'type', { deletedAt: null });
  r.prestatairesActifs = await compter('partners', { deletedAt: null, actif: true });
  r.lots = {
    actifs: await compter('lotstockfifos', { deletedAt: null }),
    sansFicheFournisseur: await compter('lotstockfifos', { deletedAt: null, fournisseurId: null }),
    numerosEnDouble: (await existe('lotstockfifos'))
      ? (await db.collection('lotstockfifos').aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$numeroLot', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray()).length
      : 'collection absente'
  };
  r.mouvementsStock = await compter('mouvementstocks');
  r.bonsCommande = await compter('purchaseorders');
  r.lignesBudget = await compter('budgetlines', { deletedAt: null }); // Nombre seulement, aucun montant
  r.depenses = { total: await compter('expenses', { deletedAt: null }), effectuees: await compter('expenses', { deletedAt: null, estEffectue: true }), lienPublicAncien: await compter('expenses', { urlPieceJointe: { $nin: [null, ''] } }) };
  r.zones = { total: await compter('zones'), prioritaires: await compter('zones', { prioritaire: true }), actives: await compter('zones', { actif: true }) };
  r.tauxEnregistres = await compter('exchangerates');
  r.journal = await compter('auditlogs');
  r.parametres = await compter('parametres');
  r.cloturesMois = await compter('cloturemois');
  r.articlesBlog = await compter('posts');
  r.menusOuIdeesRepas = await grouper('menutypes', 'statut');
  r.profilsNutrition = await compter('profilnutritions');

  console.log(JSON.stringify(r, null, 2));
  await mongoose.disconnect();
}

inventaire().catch(async e => { console.error('❌ Inventaire impossible :', e.message); await mongoose.disconnect(); process.exitCode = 1; });
