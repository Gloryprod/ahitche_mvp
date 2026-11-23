// Packs dynamiques : liste des packs (toute l'équipe), création d'un pack (admin seulement, journalisée), et un pack
// créé reconnu partout : quantités du catalogue, import du référentiel, composition, prévision d'achats. Données fictives.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');

let ctx, admin, gest, Product, riz;
const col = (nom) => mongoose.connection.collection(nom);
const PACK = { type: 'etudiant', nom: 'AHI Étudiant test', cible: '1 étudiant · par mois', prix: 5100, cycleJours: 30, bientotDisponible: true };

before(async () => {
  ctx = await demarrer();
  Product = require(path.join(BACK, 'src/models/product'));
  riz = await Product.create({ reference: 'P01', name: 'Riz test', type: 'base fixe', unit: 'kg', priceUnit: 120, quantites: { essentiel: 2 } });
  admin = await ctx.connexion('admin');
  gest = await ctx.connexion('gestionnaire');
});

after(async () => { await ctx?.arreter(); });

test('liste des packs : toute l’équipe, ordre du référentiel', async () => {
  const r = await ctx.appel(gest, 'GET', '/api/admin/packs');
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.deepStrictEqual(r.json.map((p) => p.type), ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur']);
  assert.strictEqual((await ctx.appel(null, 'GET', '/api/admin/packs')).statut, 401);
});

test('créer un pack : admin seulement, contrôles, journal', async () => {
  assert.strictEqual((await ctx.appel(gest, 'POST', '/api/admin/formulas', PACK)).statut, 403);
  for (const [corps, motif] of [
    [{ ...PACK, type: 'Étudiant' }, /Identifiant du pack/], [{ ...PACK, type: 'e' }, /Identifiant du pack/], [{ ...PACK, type: { $gt: '' } }, /Identifiant du pack/],
    [{ ...PACK, nom: '' }, /Nom du pack/], [{ ...PACK, cible: '' }, /Cible du pack/], [{ ...PACK, prix: -1 }, /Prix invalide/],
    [{ ...PACK, cycleJours: 0 }, /cycle/], [{ ...PACK, bientotDisponible: 'oui' }, /bientotDisponible/],
  ]) {
    const r = await ctx.appel(admin, 'POST', '/api/admin/formulas', corps);
    assert.ok(r.statut === 400 && motif.test(r.json?.message), JSON.stringify(r));
  }
  const r = await ctx.appel(admin, 'POST', '/api/admin/formulas', PACK);
  assert.strictEqual(r.statut, 201, JSON.stringify(r));
  assert.deepStrictEqual(r.json.pack, { type: 'etudiant', slug: 'ahi-etudiant', nom: 'AHI Étudiant test', statut: 'actif', bientotDisponible: true, ordre: 5 });
  assert.strictEqual((await ctx.appel(admin, 'POST', '/api/admin/formulas', PACK)).statut, 409, 'pas deux fois');
  const formule = await col('formules').findOne({ slug: 'ahi-etudiant' });
  assert.deepStrictEqual([formule.prixActuel, formule.cycleJours, formule.lienWhatsApp.startsWith('https://wa.me/')], [5100, 30, true]);
  assert.ok(await col('auditlogs').findOne({ entite: 'Formule', action: 'Création', resume: /Pack AHI Étudiant test \(ahi-etudiant\) créé/ }));
  const liste = await ctx.appel(gest, 'GET', '/api/admin/packs');
  assert.strictEqual(liste.json.at(-1).type, 'etudiant', 'le nouveau pack vient après les autres');
});

test('un pack créé est reconnu partout : quantités, import du référentiel, composition, prévision d’achats', async () => {
  // Quantité saisie dans l'écran Produits
  const put = await ctx.appel(admin, 'PUT', `/api/admin/products/${riz._id}`, { reference: 'P01', name: 'Riz test', unit: 'kg', type: 'base fixe', priceUnit: 120, quantites: { essentiel: 2, etudiant: 1.5 } });
  assert.strictEqual(put.statut, 200, JSON.stringify(put));
  assert.strictEqual((await Product.findById(riz._id).lean()).quantites.etudiant, 1.5);

  // Colonne du nouveau pack dans l'import du référentiel (« Etudiant » d'Excel accepté)
  const imp = await ctx.appel(admin, 'POST', '/api/admin/products/referentiel/import', { texte: 'reference;produit;quantite_etudiant\nP01;Riz test;3', appliquer: true });
  assert.strictEqual(imp.statut, 201, JSON.stringify(imp));
  assert.deepStrictEqual(imp.json.lignes[0].changements, ['quantités Ess 2 · Équ — · Conf — · Rés — · Fra — · Etud 1.5 → Ess 2 · Équ — · Conf — · Rés — · Fra — · Etud 3']);
  const excel = await ctx.appel(admin, 'POST', '/api/admin/products/referentiel/import', { texte: 'Référence\tNom du produit\tEtudiant\nP01\tRiz test\t3', appliquer: false });
  assert.strictEqual(excel.json.lignes?.[0]?.statut, 'inchange', JSON.stringify(excel.json));

  // Composition et prévision d'achats
  const compo = await ctx.appel(admin, 'GET', '/api/admin/formulas/etudiant');
  assert.strictEqual(compo.statut, 200, JSON.stringify(compo));
  assert.strictEqual(compo.json.items.length, 1, JSON.stringify(compo.json.items)); // Le riz, seul produit du pack
  const prevision = await ctx.appel(gest, 'GET', '/api/admin/stock/prevision-achats?etudiant=2');
  assert.strictEqual(prevision.statut, 200, JSON.stringify(prevision));
  assert.strictEqual(prevision.json.lignes.find((l) => l.produit === 'Riz test')?.besoin, 6);

  // Un type inconnu reste refusé ou absent
  assert.strictEqual((await ctx.appel(admin, 'GET', '/api/admin/formulas/inconnu')).statut, 404);
  assert.strictEqual((await ctx.appel(admin, 'GET', '/api/admin/formulas/Inconnu!')).statut, 400);
});

test('ouvrir un pack à la commande : admin seulement, journalisé', async () => {
  const route = '/api/admin/formulas/etudiant/disponibilite';
  assert.strictEqual((await ctx.appel(gest, 'PATCH', route, { bientotDisponible: false })).statut, 403);
  assert.strictEqual((await ctx.appel(admin, 'PATCH', route, { bientotDisponible: 'non' })).statut, 400);
  assert.strictEqual((await ctx.appel(admin, 'PATCH', '/api/admin/formulas/inconnu/disponibilite', { bientotDisponible: false })).statut, 404);
  const r = await ctx.appel(admin, 'PATCH', route, { bientotDisponible: false });
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.strictEqual((await col('formules').findOne({ slug: 'ahi-etudiant' })).bientotDisponible, false);
  assert.ok(await col('auditlogs').findOne({ entite: 'Formule', resume: 'AHI Étudiant test : ouvert à la commande' }));
  const packs = await ctx.appel(gest, 'GET', '/api/admin/packs');
  assert.strictEqual(packs.json.find((p) => p.type === 'etudiant').bientotDisponible, false);
});
