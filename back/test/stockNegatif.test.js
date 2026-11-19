// Livraison avec stock incomplet (PATCH /api/admin/orders/:id/status, livrerMalgreManque) : admin seul, manques
// enregistrés puis comblés par les entrées suivantes (formulaire, comptage, correction, bon, production interne).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');

const modele = (nom) => require(path.join(BACK, 'src/models', nom));
const verif = (condition, libelle, detail) => assert.ok(condition, detail === undefined ? libelle : `${libelle} : ${JSON.stringify(detail)}`);

let ctx, cAdmin, cGest, four, client;
let Product, Partner, Order, Snap, AuditLog, LotStockFifo, MouvementStock, ManqueStock;
const P = {};
let n = 0;

before(async () => {
  ctx = await demarrer();
  Product = modele('product'); Partner = modele('partner'); Order = modele('order'); Snap = modele('orderProductSnapshot');
  AuditLog = modele('auditLog');
  ({ LotStockFifo, MouvementStock, ManqueStock } = modele('stock'));
  client = ctx.comptes.user;
  four = await Partner.create({ nom: 'Fournisseur Test', type: 'Fournisseur', actif: true });
  for (const [cle, name, unit, reference, quantites] of [
    ['riz', 'Riz local', 'kg', 'RIZ', { essentiel: 2 }], ['huile', 'Huile', 'L', 'HUI', {}], ['sucre', 'Sucre', 'kg', 'SUC', {}],
    ['mais', 'Maïs', 'kg', 'MAI', {}], ['farine', 'Farine de maïs', 'kg', 'FAR', {}],
  ]) P[cle] = await Product.create({ name, unit, reference, quantites, priceUnit: 500 });
  await mongoose.connection.db.collection('formules').insertOne({ slug: 'ahi-essentiel', statut: 'actif', nom: 'AHI Essentiel' });
  cAdmin = await ctx.connexion('admin');
  cGest = await ctx.connexion('gestionnaire');
});

after(async () => { await ctx?.arreter(); });

const lotsDe = async (p) => (await LotStockFifo.find({ product: p._id, deletedAt: null }).lean()).map((l) => l.quantiteRestante);
const inventaire = async () => new Map((await ctx.appel(cAdmin, 'GET', '/api/admin/inventory/global')).json.map((i) => [i.nom, i]));
async function commande(lignes, extra = {}) {
  n++;
  const o = await Order.create({ userId: client._id, reference: `CMD-${String(n).padStart(3, '0')}`, formule: 'AHI ESSENTIEL', formuleSlug: 'ahi-essentiel', total: 1000, modePaiement: 'Espèces', statut: 'En livraison', ...extra });
  for (const [p, q] of lignes) await Snap.create({ orderId: o._id, productId: p._id, name: p.name, quantity: q, unit: p.unit });
  return o;
}
const livrer = (cookie, o, extra = {}) => ctx.appel(cookie, 'PATCH', `/api/admin/orders/${o._id}/status`, { statut: 'Livrée', notePaiement: 'Espèces reçues', ...extra });
const entree = (p, quantiteRecue, prix, extra = {}) => ctx.appel(cAdmin, 'POST', '/api/admin/stock/lots', { productId: p._id, fournisseurId: four._id, quantiteRecue, prixAchatUnitaire: prix, creerDepense: false, ...extra });

let o2, m2, lotSucre;

test('A. Stock suffisant : livraison inchangée', async () => {
  await entree(P.riz, 10, 500);
  const o1 = await commande([[P.riz, 4]]);
  const r = await livrer(cAdmin, o1, { livrerMalgreManque: true });
  verif(r.statut === 200 && r.json.manques === undefined, '200 sans manques (champ ignoré)', r);
  verif(JSON.stringify(await lotsDe(P.riz)) === '[6]', 'lot riz 10 → 6', await lotsDe(P.riz));
});

test('B. Stock partiel sans le champ : 409, rien enregistré', async () => {
  o2 = await commande([[P.riz, 5], [P.riz, 4]]); // deux lignes du même produit : 9 kg
  let r = await livrer(cAdmin, o2);
  verif(r.statut === 409 && r.json.manques?.length === 1 && r.json.manques[0].manque === 3 && r.json.manques[0].nom === 'Riz local' && r.json.manques[0].unite === 'kg', '409 manques riz 3 kg', r);
  r = await livrer(cAdmin, o2, { livrerMalgreManque: 'true' });
  verif(r.statut === 409, 'livrerMalgreManque "true" (texte) traité comme absent → 409', r.statut);
  verif((await Order.findById(o2._id)).statut === 'En livraison' && JSON.stringify(await lotsDe(P.riz)) === '[6]' && !(await ManqueStock.countDocuments()), 'commande, lots et manques inchangés');
});

test('C. Gestionnaire : jamais de livraison avec stock incomplet', async () => {
  let r = await livrer(cGest, o2);
  verif(r.statut === 409 && r.json.manques?.[0]?.manque === 3, 'gestionnaire sans le champ : 409 + manques', r);
  r = await livrer(cGest, o2, { livrerMalgreManque: true });
  verif(r.statut === 403 && r.json.message === "Stock incomplet : demandez à l'admin de valider cette livraison." && r.json.manques?.[0]?.manque === 3, 'gestionnaire avec le champ : 403 + manques', r);
  verif((await Order.findById(o2._id)).statut === 'En livraison' && !(await ManqueStock.countDocuments()), 'rien enregistré');
});

test('D. Admin avec le champ : livrée, manque enregistré et journalisé', async () => {
  let r = await livrer(cAdmin, o2, { livrerMalgreManque: true });
  verif(r.statut === 200 && r.json.manques?.[0]?.manque === 3 && r.json.order.statut === 'Livrée', '200 + manques + Livrée', r);
  verif(JSON.stringify(await lotsDe(P.riz)) === '[0]', 'lots riz vidés', await lotsDe(P.riz));
  m2 = await ManqueStock.findOne({ orderId: o2._id }).lean();
  verif(m2 && m2.quantiteInitiale === 3 && m2.quantiteRestante === 3 && m2.reference === 'CMD-002' && String(m2.creePar) === String(ctx.comptes.admin._id), 'ManqueStock créé', m2);
  const mvt = await MouvementStock.findOne({ lotId: null }).lean();
  verif(mvt && mvt.type === 'sortie' && mvt.quantite === 3 && mvt.motif === 'Livraison de la commande CMD-002 (sans stock : manque à combler)', 'mouvement sortie sans lot', mvt);
  const j = await AuditLog.findOne({ entite: 'Stock' }).lean();
  verif(j && j.resume === 'Livraison CMD-002 avec stock incomplet : Riz local −3 kg', 'journal', j?.resume);
  const inv = await inventaire();
  verif(inv.get('Riz local').stockTotal === -3 && inv.get('Riz local').manque === 3, 'inventaire riz −3, manque 3', inv.get('Riz local'));
  verif(inv.get('Sucre').manque === 0, 'manque 0 sans manque', inv.get('Sucre').manque);
  r = await ctx.appel(cAdmin, 'GET', '/api/admin/mouvements');
  verif(r.statut === 200 && r.json.mouvements.some((m) => m.lotId === null), 'historique des mouvements lisible avec lotId null', r.statut);
});

test('E. Deuxième manque (riz + huile)', async () => {
  const o3 = await commande([[P.riz, 2], [P.huile, 1]]);
  const r = await livrer(cAdmin, o3, { livrerMalgreManque: true });
  verif(r.statut === 200 && r.json.manques.length === 2, '2 manques', r.json);
  const inv = await inventaire();
  verif(inv.get('Riz local').stockTotal === -5 && inv.get('Huile').stockTotal === -1, 'riz −5, huile −1', [inv.get('Riz local').stockTotal, inv.get('Huile').stockTotal]);
});

test('F. Entrée qui comble le 1er manque en entier et le 2e en partie, dans l’ordre', async () => {
  const r = await entree(P.riz, 4, 600);
  verif(r.statut === 201 && r.json.lot.quantiteRestante === 0 && r.json.comblements.length === 2 && r.json.comblements[0].reference === 'CMD-002' && r.json.comblements[0].quantite === 3 && r.json.comblements[1].quantite === 1, 'comblements CMD-002 3, CMD-003 1, lot 0', r.json);
  const m2b = await ManqueStock.findById(m2._id).lean();
  verif(m2b.quantiteRestante === 0 && m2b.dateComblement && m2b.couts[0].cout === 1800, 'CMD-002 comblé, coût 1800', m2b);
  verif((await ManqueStock.findOne({ reference: 'CMD-003', product: P.riz._id })).quantiteRestante === 1, 'CMD-003 riz reste 1');
  verif(await MouvementStock.countDocuments({ motif: /^Manque de la livraison CMD-00[23] comblé/ }) === 2, '2 mouvements de comblement reliés au lot');
});

test('G. Entrée en trop', async () => {
  const r = await entree(P.riz, 3, 600);
  verif(r.json.lot.quantiteRestante === 2 && r.json.comblements.length === 1, 'comble 1, lot garde 2', r.json.lot);
  const inv = await inventaire();
  verif(inv.get('Riz local').stockTotal === 2 && inv.get('Riz local').manque === 0, 'riz +2, manque 0', inv.get('Riz local'));
});

test('H. Lot à compter : comble seulement au comptage', async () => {
  let r = await ctx.appel(cAdmin, 'POST', '/api/admin/stock/lots', { productId: P.huile._id, fournisseurId: four._id, valeurFcfa: 1000, aConfirmer: 'Compter les bidons', creerDepense: false });
  verif(r.statut === 201 && r.json.comblements.length === 0 && r.json.lot.quantiteRestante === null, 'lot à compter : aucun comblement', r.json);
  verif((await inventaire()).get('Huile').stockTotal === -1, 'huile toujours −1');
  r = await ctx.appel(cAdmin, 'POST', `/api/admin/stock/lots/${r.json.lot._id}/comptage`, { quantite: 2 });
  verif(r.statut === 200 && r.json.comblements[0]?.quantite === 1 && r.json.lot.quantiteRestante === 1, 'comptage 2 : comble 1, lot 1', r.json);
  verif((await ManqueStock.findOne({ product: P.huile._id })).couts[0].cout === 500, 'coût huile 1000 × 1/2 = 500');
});

test('I. Correction positive', async () => {
  const o4 = await commande([[P.sucre, 2]]);
  await livrer(cAdmin, o4, { livrerMalgreManque: true });
  let r = await entree(P.sucre, 1, 400);
  lotSucre = r.json.lot;
  verif(lotSucre.quantiteRestante === 0, 'entrée sucre 1 : comble 1', lotSucre);
  r = await ctx.appel(cAdmin, 'POST', `/api/admin/stock/lots/${lotSucre._id}/correction`, { sens: 'positive', quantite: 1, raison: 'Erreur de saisie' });
  verif(r.statut === 200 && r.json.comblements[0]?.quantite === 1 && r.json.lot.quantiteRestante === 0, 'correction +1 : comble 1', r.json);
  verif((await ManqueStock.findOne({ orderId: o4._id })).quantiteRestante === 0, 'manque sucre comblé');
});

test('L. Essais, transformations et corrections négatives toujours bloqués', async () => {
  const o4b = await commande([[P.sucre, 1]]);
  await livrer(cAdmin, o4b, { livrerMalgreManque: true });
  let r = await ctx.appel(cAdmin, 'POST', '/api/admin/stock/essais', { productId: P.sucre._id, quantite: 1, commentaire: 'test moulin' });
  verif(r.statut === 400 && /Stock insuffisant/.test(r.json.message), 'essai refusé', r);
  r = await ctx.appel(cAdmin, 'POST', '/api/admin/stock/transformations', { matiereId: P.sucre._id, quantiteMatiere: 1, produitId: P.farine._id, quantiteObtenue: 1, date: '2026-11-17' });
  verif(r.statut === 400 && /Stock insuffisant/.test(r.json.message), 'transformation (matière en manque) refusée', r);
  r = await ctx.appel(cAdmin, 'POST', `/api/admin/stock/lots/${lotSucre._id}/correction`, { sens: 'negative', quantite: 1, raison: 'Perte' });
  verif(r.statut === 400, 'correction négative au-delà du lot refusée', r);
  verif((await inventaire()).get('Sucre').stockTotal === -1, 'sucre −1 inchangé');
});

test('J. Réception d’un bon de commande', async () => {
  const o5 = await commande([[P.riz, 5]]); // riz 2 en lot → manque 3
  await livrer(cAdmin, o5, { livrerMalgreManque: true });
  let r = await ctx.appel(cAdmin, 'POST', '/api/admin/bons-commande', { numeroBon: 'BC-T1', dateEmission: '2026-11-17', fournisseurId: four._id, lignes: [{ designation: 'Riz 4 kg', productId: P.riz._id, quantite: 4, montantFcfa: 2400 }] });
  verif(r.statut === 201, 'bon créé', r);
  const bon = r.json.bon;
  r = await ctx.appel(cAdmin, 'POST', `/api/admin/bons-commande/${bon._id}/reception`, { dateReception: '2026-11-17', lignes: [{ ligneId: bon.lignes[0]._id, quantiteRecue: 4 }] });
  verif(r.statut === 201 && r.json.comblements[0]?.quantite === 3 && r.json.comblements[0].reference === 'CMD-006' && r.json.lots[0].quantiteRestante === 1, 'réception 4 : comble 3, lot 1', r.json.comblements);
  verif((await ManqueStock.findOne({ orderId: o5._id })).couts[0].cout === 1800, 'coût 2400 × 3/4 = 1800');
});

test('K. Production interne', async () => {
  const o6 = await commande([[P.farine, 2]]);
  await livrer(cAdmin, o6, { livrerMalgreManque: true });
  await entree(P.mais, 10, 300);
  const r = await ctx.appel(cAdmin, 'POST', '/api/admin/stock/transformations', { matiereId: P.mais._id, quantiteMatiere: 5, produitId: P.farine._id, quantiteObtenue: 4, date: '2026-11-17' });
  verif(r.statut === 201 && r.json.comblements[0]?.quantite === 2 && r.json.lot.quantiteRestante === 2, 'transformation : comble 2, lot farine 2', r.json);
  verif((await ManqueStock.findOne({ orderId: o6._id })).couts[0].cout === 750, 'coût farine 1500 × 2/4 = 750');
});

test('M. Erreur au milieu de la livraison : tout est annulé', async () => {
  const avantLots = JSON.stringify(await LotStockFifo.find().sort({ _id: 1 }).select('quantiteRestante').lean());
  const avantMvt = await MouvementStock.countDocuments(), avantManques = await ManqueStock.countDocuments(), avantJournal = await AuditLog.countDocuments();
  const o7 = await commande([[P.riz, 1], [P.huile, 5]]);
  await Order.collection.updateOne({ _id: o7._id }, { $set: { historique: [{ statut: 'Inconnu', date: new Date() }] } }); // fait échouer order.save
  const r = await livrer(cAdmin, o7, { livrerMalgreManque: true });
  verif(r.statut === 500, 'échec à l’enregistrement de la commande → 500', r);
  verif(JSON.stringify(await LotStockFifo.find().sort({ _id: 1 }).select('quantiteRestante').lean()) === avantLots
    && await MouvementStock.countDocuments() === avantMvt && await ManqueStock.countDocuments() === avantManques && await AuditLog.countDocuments() === avantJournal
    && (await Order.findById(o7._id)).statut === 'En livraison', 'lots, mouvements, manques, journal et commande intacts');
});

test('N. Prévision d’achats et suppression d’un produit en manque', async () => {
  const o8 = await commande([[P.huile, 3]]); // huile 1 en lot → manque 2
  await livrer(cAdmin, o8, { livrerMalgreManque: true });
  let r = await ctx.appel(cGest, 'GET', '/api/admin/stock/prevision-achats?essentiel=1');
  const lp = new Map((r.json.lignes || []).map((l) => [l.produit, l]));
  verif(r.statut === 200 && lp.get('Riz local')?.besoin === 2 && lp.get('Riz local').disponible === 1 && lp.get('Riz local').manque === 0 && lp.get('Riz local').aAcheter === 1, 'riz : besoin 2, disponible 1, à acheter 1', lp.get('Riz local'));
  verif(lp.get('Huile')?.besoin === 0 && lp.get('Huile').disponible === -2 && lp.get('Huile').manque === 2 && lp.get('Huile').aAcheter === 2, 'huile hors pack : disponible −2, manque 2, à acheter 2', lp.get('Huile'));
  r = await ctx.appel(cAdmin, 'DELETE', `/api/admin/products/${P.huile._id}`);
  verif(r.statut === 400 && /stock négatif/.test(r.json.message), 'produit avec manque : suppression refusée', r);
});
