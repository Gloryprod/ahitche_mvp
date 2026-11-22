// Import du référentiel depuis l'admin (POST /api/admin/products/referentiel/import) : admin seulement, envois
// invalides, erreurs de fichier, aperçu ligne par ligne (création, modification, inchangé, erreur), tout ou rien,
// en-têtes d'Excel acceptés, relance sans effet. Données et prix fictifs.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');

const ROUTE = '/api/admin/products/referentiel/import';
let ctx, admin, Product;
const col = (nom) => mongoose.connection.collection(nom);
const imp = (cookie, texte, appliquer = false) => ctx.appel(cookie, 'POST', ROUTE, { texte, appliquer });
const etat = async () => JSON.stringify(await Promise.all(['products', 'auditlogs'].map((n) => col(n).find({}).sort({ _id: 1 }).toArray())));
const ENTETE = 'reference;produit;type;unite;prix_unitaire_fcfa;quantite_essentiel;quantite_equilibre;quantite_confort;quantite_reserve;quantite_fraicheur;categorie;conversion';

before(async () => {
  ctx = await demarrer();
  Product = require(path.join(BACK, 'src/models/product'));
  await require(path.join(BACK, 'src/models/category')).create({ name: 'Épicerie test' });
  await Product.create([
    { reference: 'P01', name: 'Riz test', type: 'base fixe', unit: 'kg', priceUnit: 110, quantites: { essentiel: 2, equilibre: 4 } },
    { reference: 'P02', name: 'Haricots test', type: 'base fixe', unit: 'kg', priceUnit: 220, quantites: { essentiel: 1 } },
    { reference: 'V05', name: 'Poisson test', type: 'extra', unit: 'kg', priceUnit: 330 },
  ]);
  admin = await ctx.connexion('admin');
});

after(async () => { await ctx?.arreter(); });

test('droits : admin seulement', async () => {
  for (const role of ['gestionnaire', 'comptable', 'coordinateur', 'user']) {
    const r = await imp(await ctx.connexion(role), `${ENTETE}\nP01;Riz test;Fixe;kg;111;;;;;;;`);
    assert.strictEqual(r.statut, 403, `${role} : ${JSON.stringify(r)}`);
  }
  assert.strictEqual((await ctx.appel(null, 'POST', ROUTE, { texte: 'x', appliquer: false })).statut, 401);
});

test('envois invalides et erreurs de fichier : 400 sans aperçu', async () => {
  for (const [corps, motif] of [
    [{ appliquer: false }, /Collez/], [{ texte: { $gt: '' }, appliquer: false }, /Collez/], [{ texte: '  ', appliquer: false }, /Collez/],
    [{ texte: ENTETE, appliquer: 'true' }, /appliquer/], [{ texte: 'é'.repeat(52000), appliquer: false }, /100 Ko/],
  ]) {
    const r = await ctx.appel(admin, 'POST', ROUTE, corps);
    assert.ok(r.statut === 400 && motif.test(r.json?.message), JSON.stringify(r).slice(0, 200));
  }
  for (const [texte, motif] of [
    [`${ENTETE};couleur\nP01;Riz test;;;;;;;;;;;x`, /colonne inconnue « couleur »/],
    ['produit;prix\nRiz test;1', /obligatoires absentes : reference/],
    [ENTETE, /Aucune ligne/],
    [[ENTETE, ...Array(201).fill('P01;Riz test;;;;;;;;;;')].join('\n'), /200 lignes au plus/],
  ]) {
    const r = await imp(admin, texte);
    assert.ok(r.statut === 400 && motif.test(r.json?.message) && !r.json.lignes, JSON.stringify(r).slice(0, 200));
  }
});

const MELANGE = [
  ENTETE,
  'P01;Riz test;Fixe;kg;115;=;=;=;=;=;;',        // 2 : prix seul
  'P02;Haricots test;Fixe;kg;220;1;;;;;;',        // 3 : inchangé
  'V06;Mil test;Variable;kg;140;;;;;;Épicerie test;', // 4 : création
  'V05;Poisson test;Variable;sachet;330;;;;;;;',  // 5 : unité changée sans conversion
].join('\n');

test('simulation : aperçu ligne par ligne, rien n’est écrit', async () => {
  const avant = await etat();
  const r = await imp(admin, MELANGE);
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.strictEqual(r.json.message, '1 ligne à corriger : rien ne sera enregistré.');
  assert.deepStrictEqual(r.json.resume, { lignes: 4, creations: 1, modifications: 1, inchanges: 1, erreurs: 1 });
  const L = (n) => r.json.lignes.find((l) => l.ligne === n);
  assert.deepStrictEqual([L(2).statut, L(2).changements], ['modification', ['prix 110 → 115']]);
  assert.deepStrictEqual([L(3).statut, L(3).changements], ['inchange', []]);
  assert.deepStrictEqual([L(4).statut, L(4).changements], ['creation', ['créé (extra, kg, prix 140, catégorie Épicerie test)']]);
  assert.deepStrictEqual([L(5).statut, L(5).messages], ['erreur', ['Unité « kg » en base, « sachet » dans le tableau, sans conversion']]);
  assert.strictEqual(await etat(), avant);
});

test('application avec une ligne en erreur : 400, rien n’est enregistré', async () => {
  const avant = await etat();
  const r = await imp(admin, MELANGE, true);
  assert.strictEqual(r.statut, 400, JSON.stringify(r));
  assert.strictEqual(r.json.message, "1 ligne à corriger : rien n'a été enregistré.");
  assert.strictEqual(await etat(), avant);
});

test('application : en-têtes d’Excel, tabulations, produits mis à jour, journal', async () => {
  const journalAvant = await col('auditlogs').countDocuments();
  const excel = [
    'Référence\tNom du produit\tUnité\tPrix unitaire (FCFA)\tEssentiel\tÉquilibré\tCatégorie',
    'P01\tRiz test\tkg\t115\t3\t=\t',
    'V06\tMil test\tkg\t140\t\t\tÉpicerie test',
  ].join('\r\n');
  const r = await imp(admin, excel, true);
  assert.strictEqual(r.statut, 201, JSON.stringify(r));
  assert.strictEqual(r.json.message, 'Référentiel importé : 1 modification, 1 création.');
  const riz = await Product.findOne({ reference: 'P01' }).lean();
  assert.deepStrictEqual([riz.priceUnit, riz.quantites.essentiel, riz.quantites.equilibre], [115, 3, 4], 'colonne absente ou « = » : quantité gardée');
  const mil = await Product.findOne({ reference: 'V06' }).lean();
  assert.deepStrictEqual([mil.name, mil.type, mil.priceUnit], ['Mil test', 'extra', 140]);
  assert.ok(mil.category, 'catégorie retrouvée par son nom');
  const journal = await col('auditlogs').find({}).sort({ _id: 1 }).skip(journalAvant).toArray();
  assert.deepStrictEqual(journal.map((j) => j.action), ['Modification', 'Création', 'Import'], journal.map((j) => j.resume).join(' / '));
  assert.strictEqual(journal[2].resume, 'Import du référentiel : 1 modification, 1 création');

  const relance = await imp(admin, excel, true);
  assert.strictEqual(relance.statut, 200);
  assert.strictEqual(relance.json.message, 'Aucun changement : le catalogue suit déjà le tableau.');
  assert.strictEqual(await col('auditlogs').countDocuments(), journalAvant + 3, 'relance : rien de plus au journal');
});
