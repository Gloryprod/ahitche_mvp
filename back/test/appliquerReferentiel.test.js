// Script appliquerReferentiel.js (changements d'une version du référentiel des packs) : simulation sans écriture,
// échange de références sans perte d'historique, changement d'unité avec conversion du stock, créations, relance
// sans effet, incohérences refusées. Données et prix fictifs.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');

const modele = (nom) => require(path.join(BACK, 'src/models', nom));
const ENTETE = 'reference;produit;type;unite;prix_unitaire_fcfa;quantite_essentiel;quantite_equilibre;quantite_confort;quantite_reserve;quantite_fraicheur;categorie;conversion';
const CHANGEMENTS = [
  ENTETE,
  'P09;Sel;Fixe;sachet de 1 kg;60;1;2;3;—;—;Condiments;',
  'V19;Huile de palme;Variable;litre;120;;;;;;Huiles;',
  'P03;Coquillettes;Fixe;sachet de 200 g;210;3;6;12;25;—;Féculents;5',
  'P01;Riz local;Fixe;kg;470;=;=;=;=;=;Céréales;', // prix seul : quantités gardées
  'V20;Arachide;Variable;kg;345;;;;;;Légumineuses;',
  'V21;Bouillie essai;Variable;unité;;;;;;;Transformés;',
  'V22;Nouilles essai;Variable;unité;130;;;;;;Féculents;',
].join('\n');

let ctx, dossier, Product, LotStockFifo, MouvementStock, ManqueStock, PurchaseOrder;
const P = {};
const col = (nom) => mongoose.connection.collection(nom);
const fichier = (nom, texte) => { const f = path.join(dossier, nom); fs.writeFileSync(f, texte); return f; };
const etat = async () => JSON.stringify(await Promise.all(['products', 'lotstockfifos', 'mouvementstocks', 'manquestocks', 'purchaseorders', 'auditlogs']
  .map((n) => col(n).find({}).sort({ _id: 1 }).toArray())));

before(async () => {
  ctx = await demarrer();
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'referentiel-'));
  Product = modele('product'); PurchaseOrder = modele('purchaseOrder');
  ({ LotStockFifo, MouvementStock, ManqueStock } = modele('stock'));
  const Category = modele('category'), Partner = modele('partner');
  const [feculents] = await Category.create([{ name: 'Féculents' }, { name: 'Légumineuses' }]);
  P.huile = await Product.create({ reference: 'P09', name: 'Huile de palme', type: 'base fixe', unit: 'litre', priceUnit: 111, quantites: { equilibre: 1, confort: 2, reserve: 5 } });
  P.sel = await Product.create({ reference: 'V19', name: 'Sel', type: 'extra', unit: 'sachet de 1 kg', priceUnit: 50, cetteSemaine: true });
  P.coq = await Product.create({ reference: 'P03', name: 'Coquillettes', type: 'base fixe', unit: 'kg', priceUnit: 1100, quantites: { essentiel: 3, equilibre: 6, confort: 12, reserve: 25 }, seuilAlerte: 2, prixVip: 900, category: feculents._id });
  P.riz = await Product.create({ reference: 'P01', name: 'Riz local', type: 'base fixe', unit: 'kg', priceUnit: 710, quantites: { essentiel: 2, equilibre: 4, confort: 10, reserve: 25 } });
  P.arachide = await Product.create({ reference: 'V20', name: 'Arachide', type: 'extra', unit: 'kg', priceUnit: 345 });
  P.tapioca = await Product.create({ reference: 'P07', name: 'Tapioca', type: 'base fixe', unit: 'kg', priceUnit: 650, quantites: { essentiel: 1 } });
  const four = await Partner.create({ nom: 'Grossiste Essai', type: 'Fournisseur' });
  const admin = await ctx.connexion('admin');
  // Stock des coquillettes en kilos : un lot de 3 kg à 1 100 (et son mouvement d'entrée), un manque, une ligne de bon
  const lot = await ctx.appel(admin, 'POST', '/api/admin/stock/lots', { productId: P.coq._id, fournisseurId: four._id, quantiteRecue: 3, prixAchatUnitaire: 1100, creerDepense: false });
  assert.strictEqual(lot.statut, 201, JSON.stringify(lot));
  await col('manquestocks').insertOne({ product: P.coq._id, quantiteInitiale: 1.5, quantiteRestante: 0.5, reference: 'CMD-950', couts: [{ lotId: new mongoose.Types.ObjectId(), quantite: 1, cout: 1100 }], orderId: null, creePar: null, dateComblement: null });
  const bon = await ctx.appel(admin, 'POST', '/api/admin/bons-commande', { numeroBon: 'BC-REF-1', dateEmission: '2026-11-20', fournisseurId: four._id, lignes: [
    { designation: 'Coquillettes 2 kg', productId: P.coq._id, quantite: 2, montantFcfa: 2200 },
    { designation: 'Riz 5 kg', productId: P.riz._id, quantite: 5, montantFcfa: 3550 },
  ] });
  assert.strictEqual(bon.statut, 201, JSON.stringify(bon));
});

after(async () => {
  await ctx?.arreter();
  if (dossier) fs.rmSync(dossier, { recursive: true, force: true });
});

test('simulation : rapport des changements, rien n’est écrit', async () => {
  const avant = await etat();
  const r = await ctx.script('appliquerReferentiel.js', [fichier('changements.csv', CHANGEMENTS)]);
  assert.strictEqual(r.code, 0, r.sortie);
  for (const attendu of [
    'SIMULATION',
    'P09 « Sel » : référence V19 → P09 ; type extra → base fixe ; prix 50 → 60 ; quantités Ess — · Équ — · Conf — · Rés — · Fra — → Ess 1 · Équ 2 · Conf 3 · Rés — · Fra — ; retiré de « Disponible cette semaine »',
    'V19 « Huile de palme » : référence P09 → V19 ; type base fixe → extra ; prix 111 → 120 ; quantités Ess — · Équ 1 · Conf 2 · Rés 5 · Fra — → Ess — · Équ — · Conf — · Rés — · Fra —',
    'P03 « Coquillettes » : unité kg → sachet de 200 g (×5) ; prix 1100 → 210 ; seuil d\'alerte 2 → 10 ; prix VIP : 900 → 180 ; 1 lot(s), 1 mouvement(s), 1 manque(s), 1 bon(s) convertis',
    'P01 « Riz local » : prix 710 → 470',
    'V21 « Bouillie essai » : créé (extra, unité, prix à renseigner) ; catégorie « Transformés » introuvable, laissée vide',
    'V22 « Nouilles essai » : créé (extra, unité, prix 130, catégorie Féculents)',
  ]) assert.ok(r.sortie.includes(attendu), `attendu : ${attendu}\n--- sortie ---\n${r.sortie}`);
  assert.ok(!r.sortie.includes('Arachide'), 'Arachide déjà à jour : rien à signaler');
  assert.strictEqual(await etat(), avant, 'la simulation n’a rien écrit');
});

test('application : références échangées sans perte d’historique, stock converti, produits créés', async () => {
  const journalAvant = await col('auditlogs').countDocuments();
  const r = await ctx.script('appliquerReferentiel.js', [fichier('changements.csv', CHANGEMENTS), '--appliquer']);
  assert.strictEqual(r.code, 0, r.sortie);
  assert.ok(r.sortie.includes('RÉFÉRENTIEL APPLIQUÉ'), r.sortie);

  const sel = await Product.findById(P.sel._id).lean(), huile = await Product.findById(P.huile._id).lean();
  assert.deepStrictEqual([sel.reference, sel.type, sel.cetteSemaine, sel.quantites.essentiel, sel.quantites.confort], ['P09', 'base fixe', false, 1, 3]);
  assert.deepStrictEqual([huile.reference, huile.type, huile.priceUnit, huile.quantites.equilibre, huile.quantites.reserve], ['V19', 'extra', 120, null, null]);

  const coq = await Product.findById(P.coq._id).lean();
  assert.deepStrictEqual([coq.unit, coq.priceUnit, coq.seuilAlerte, coq.prixVip, coq.quantites.essentiel], ['sachet de 200 g', 210, 10, 180, 3]);
  const lot = await LotStockFifo.findOne({ product: P.coq._id }).lean();
  assert.deepStrictEqual([lot.quantiteInitiale, lot.quantiteRestante, lot.prixAchatUnitaire, lot.valeurFcfa], [15, 15, 220, 3300]);
  assert.strictEqual((await MouvementStock.findOne({ product: P.coq._id }).lean()).quantite, 15);
  const manque = await ManqueStock.findOne({ product: P.coq._id }).lean();
  assert.deepStrictEqual([manque.quantiteInitiale, manque.quantiteRestante, manque.couts[0].quantite, manque.couts[0].cout], [7.5, 2.5, 5, 1100]);
  const bon = await PurchaseOrder.findOne({ numeroBon: 'BC-REF-1' }).lean();
  assert.deepStrictEqual(bon.lignes.map((l) => l.quantite), [10, 5], 'seule la ligne des coquillettes est convertie');

  // L'inventaire suit : 15 sachets en lot, 2,5 en manque
  const inventaire = await ctx.appel(await ctx.connexion('admin'), 'GET', '/api/admin/inventory/global');
  assert.strictEqual(inventaire.json.find((i) => i.nom === 'Coquillettes').stockTotal, 12.5, JSON.stringify(inventaire.json));

  const riz = await Product.findById(P.riz._id).lean();
  assert.deepStrictEqual([riz.priceUnit, riz.quantites.essentiel, riz.quantites.reserve], [470, 2, 25], '« = » garde les quantités');
  assert.strictEqual((await Product.findById(P.tapioca._id).lean()).reference, 'P07', 'produit absent du fichier : intact');
  const aklui = await Product.findOne({ reference: 'V21' }).lean(), nouilles = await Product.findOne({ reference: 'V22' }).lean();
  assert.deepStrictEqual([aklui.name, aklui.type, aklui.priceUnit, aklui.category], ['Bouillie essai', 'extra', null, null]);
  assert.ok(nouilles.category, 'catégorie Féculents retrouvée');

  const journal = await col('auditlogs').find({}).sort({ _id: 1 }).skip(journalAvant).toArray();
  assert.strictEqual(journal.length, 6, journal.map((j) => j.resume).join('\n'));
  assert.ok(journal.every((j) => j.entite === 'Produit' && String(j.utilisateur) === String(ctx.comptes.admin._id)));
  assert.ok(journal.some((j) => j.resume.startsWith('Produit P09 · Sel (référentiel) : référence V19 → P09')));
});

test('relance : aucun changement, le stock n’est pas reconverti', async () => {
  const avant = await etat();
  const r = await ctx.script('appliquerReferentiel.js', [fichier('changements.csv', CHANGEMENTS), '--appliquer']);
  assert.strictEqual(r.code, 0, r.sortie);
  assert.ok(r.sortie.includes('Aucun changement'), r.sortie);
  assert.strictEqual(await etat(), avant);
});

test('incohérences : tout est refusé, rien n’est écrit', async () => {
  const avant = await etat();
  const r = await ctx.script('appliquerReferentiel.js', [fichier('incoherent.csv', [
    ENTETE,
    'P07;Riz local;Fixe;kg;470;2;4;10;25;;;',            // référence prise par Tapioca, absent du fichier
    'V22;Nouilles essai;Variable;sac;130;;;;;;;',         // unité changée sans conversion
    'P03;Coquillettes fines;Fixe;sachet de 200 g;210;3;;;;;;', // la référence P03 porte un autre nom
  ].join('\n'))]);
  assert.strictEqual(r.code, 1, r.sortie);
  for (const attendu of [
    "rien n'a été enregistré",
    'P07 « Riz local » : référence P07 déjà prise par « Tapioca », absent du fichier',
    'V22 « Nouilles essai » : unité « unité » en base, « sac » dans le fichier, sans conversion',
    'P03 « Coquillettes fines » : la référence P03 est « Coquillettes » en base',
  ]) assert.ok(r.sortie.includes(attendu), `attendu : ${attendu}\n--- sortie ---\n${r.sortie}`);
  assert.strictEqual(await etat(), avant);

  const illisible = await ctx.script('appliquerReferentiel.js', [fichier('illisible.csv', `${ENTETE}\nP99;Produit;Variable;kg;abc;;;;;;;`)]);
  assert.strictEqual(illisible.code, 1, illisible.sortie);
  assert.ok(illisible.sortie.includes('Fichier à corriger') && illisible.sortie.includes('ne correspond pas au type') && illisible.sortie.includes('prix illisible'), illisible.sortie);
  assert.strictEqual(await etat(), avant);
});
