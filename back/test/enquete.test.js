// Enquête de satisfaction (docs-internes/enquete/CONTRAT.md) : page publique sans compte (GET/POST /api/public/enquete),
// synthèse, liste et suppression dans l'admin (section « enquete »), effacement automatique après un an.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { demarrer, BACK } = require('./aide');

const modele = (nom) => require(path.join(BACK, 'src/models', nom));
const verif = (condition, libelle, detail) => assert.ok(condition, detail === undefined ? libelle : `${libelle} : ${JSON.stringify(detail)}`);

let ctx, cAdmin, cCoord, cGest, Product, ReponseEnquete, AuditLog;
const P = {};
let ip = 0;

// Chaque envoi vient d'une adresse IP différente, sauf si on la donne (limite de 30 envois par heure et par IP)
async function envoyer(corps, adresse = `10.0.0.${++ip}`) {
  const r = await fetch(`${ctx.api}/api/public/enquete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': adresse }, body: JSON.stringify(corps),
  });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
const id = (cle) => String(P[cle]._id);

before(async () => {
  ctx = await demarrer();
  Product = modele('product');
  ({ ReponseEnquete } = modele('reponseEnquete'));
  AuditLog = modele('auditLog');
  for (const [cle, name, reference, extra] of [
    ['sucre', 'Sucre', 'P03', {}], ['riz', 'Riz local', 'P01', {}], ['huile', 'Huile', 'P02', { statut: 'indisponible' }],
    ['sel', 'Sel', 'P09', {}], ['ancien', 'Ancien produit', 'P99', { deletedAt: new Date() }],
    ['extra', 'Gari', 'V01', { type: 'extra' }], ['mais', 'Maïs grain', 'MP01', { type: 'matière première' }],
  ]) P[cle] = await Product.create({ name, reference, unit: 'kg', priceUnit: 500, ...extra });
  cAdmin = await ctx.connexion('admin');
  cCoord = await ctx.connexion('coordinateur');
  cGest = await ctx.connexion('gestionnaire');
});

after(async () => { await ctx?.arreter(); });

test('A. Produits de l’enquête : base fixe non supprimée, triée par référence, nom seulement', async () => {
  const r = await ctx.appel(null, 'GET', '/api/public/enquete');
  verif(r.statut === 200, '200', r);
  verif(JSON.stringify(r.json.produits.map(p => p.nom)) === JSON.stringify(['Riz local', 'Huile', 'Sucre', 'Sel']), 'P01, P02, P03, P09', r.json);
  verif(r.json.produits.every(p => Object.keys(p).join() === 'id,nom'), 'id et nom seulement', r.json.produits[0]);
});

test('B. Envoi valide : 201, textes nettoyés, téléphone normalisé, champs inconnus ignorés', async () => {
  const r = await envoyer({
    noteGlobale: 4, noteLivraison: 5, noteQualite: '', formule: 'ahi-confort',
    produitsPlus: [id('riz'), id('sucre')], produitsMoins: [id('sel')], produitSouhaite: '  Lait en poudre  ',
    detail: [{ produit: id('huile'), avis: 'autre', remplacement: ' Huile d’arachide ' }, { produit: id('sucre'), avis: 'bien', remplacement: 'ignoré' }],
    suggestion: '   ', contact: { prenom: ' Awa ', telephone: '+229 01 97 00 00 00', accordRecontact: true },
    total: 0, statut: 'Publié', site: '',
  });
  verif(r.statut === 201 && r.json.ok === true, '201 { ok: true }', r);
  const doc = await ReponseEnquete.findOne().lean();
  verif(doc.noteGlobale === 4 && doc.noteLivraison === 5 && doc.noteQualite === undefined && doc.formule === 'ahi-confort', 'notes et formule', doc);
  verif(doc.produitSouhaite === 'Lait en poudre' && doc.suggestion === undefined, 'texte nettoyé, vide ignoré', doc);
  verif(doc.detail[0].remplacement === 'Huile d’arachide' && doc.detail[1].remplacement === undefined, 'remplacement seulement si « autre »', doc.detail);
  verif(doc.contact.prenom === 'Awa' && doc.contact.telephone === '2290197000000' && doc.contact.accordRecontact === true, 'contact', doc.contact);
  verif(doc.total === undefined && doc.statut === undefined && doc.site === undefined, 'champs inconnus non enregistrés', doc);
});

test('C. Envois refusés (400, rien enregistré)', async () => {
  const avant = await ReponseEnquete.countDocuments();
  for (const [libelle, corps, message] of [
    ['note manquante', { formule: 'ahi-essentiel' }, 'Merci de donner une note de 1 à 5.'],
    ['note 6', { noteGlobale: 6 }, 'Merci de donner une note de 1 à 5.'],
    ['note texte', { noteGlobale: '4' }, 'Merci de donner une note de 1 à 5.'],
    ['4 produits en plus', { noteGlobale: 3, produitsPlus: [id('riz'), id('sucre'), id('sel'), id('huile')] }, '3 produits au plus.'],
    ['même produit en plus et en moins', { noteGlobale: 3, produitsPlus: [id('riz')], produitsMoins: [id('riz')] }, 'Un produit ne peut pas être à la fois en plus et en moins.'],
    ['produit V', { noteGlobale: 3, produitsPlus: [id('extra')] }, 'Produit inconnu.'],
    ['produit MP dans le détail', { noteGlobale: 3, detail: [{ produit: id('mais'), avis: 'plus' }] }, 'Produit inconnu.'],
    ['produit supprimé', { noteGlobale: 3, produitsMoins: [id('ancien')] }, 'Produit inconnu.'],
    ['identifiant invalide', { noteGlobale: 3, produitsPlus: [{ $ne: null }] }, 'Produit inconnu.'],
    ['deux avis sur un produit', { noteGlobale: 3, detail: [{ produit: id('riz'), avis: 'plus' }, { produit: id('riz'), avis: 'moins' }] }, 'Un seul avis par produit.'],
    ['formule inconnue', { noteGlobale: 3, formule: 'ahi-reserve' }, 'Pack inconnu.'],
    ['suggestion trop longue', { noteGlobale: 3, suggestion: 'a'.repeat(1001) }, 'Suggestion : 1000 caractères au plus.'],
    ['téléphone sans accord', { noteGlobale: 3, contact: { telephone: '0197000000' } }, "Pour être recontacté, coche la case d'accord."],
    ['téléphone invalide', { noteGlobale: 3, contact: { telephone: '12345', accordRecontact: true } }, 'Numéro invalide.'],
  ]) {
    const r = await envoyer(corps);
    verif(r.statut === 400 && r.json?.message === message, libelle, r);
  }
  verif(await ReponseEnquete.countDocuments() === avant, 'rien enregistré');
});

test('D. Champ piège rempli : 201 sans enregistrement', async () => {
  const avant = await ReponseEnquete.countDocuments();
  const r = await envoyer({ noteGlobale: 5, site: 'https://pub.example' });
  verif(r.statut === 201 && r.json.ok === true, '201', r);
  verif(await ReponseEnquete.countDocuments() === avant, 'rien enregistré');
});

test('E. Limite : 30 envois par heure et par adresse IP (réseaux mobiles partagés)', async () => {
  for (let i = 0; i < 30; i++) verif((await envoyer({}, '10.9.9.9')).statut === 400, `envoi ${i + 1} traité`);
  const r = await envoyer({ noteGlobale: 5 }, '10.9.9.9');
  verif(r.statut === 429 && /^Trop d'envois de l'enquête\. Réessayez dans/.test(r.json.message), '31e envoi : 429', r);
  verif((await envoyer({ noteGlobale: 5 })).statut === 201, 'autre adresse : acceptée');
});

test('F. Synthèse : « en plus » totalisé depuis la question courte et le détail, une fois par réponse', async () => {
  await ReponseEnquete.deleteMany({});
  for (const corps of [
    { noteGlobale: 5, noteLivraison: 4, formule: 'ahi-essentiel', produitsPlus: [id('riz')] }, // question courte
    { noteGlobale: 4, formule: 'ahi-essentiel', detail: [{ produit: id('riz'), avis: 'plus' }, { produit: id('sel'), avis: 'bien' }] }, // détail
    { noteGlobale: 4, noteLivraison: 3, formule: 'ahi-confort', produitsPlus: [id('riz')], produitsMoins: [id('sucre')], // les deux : compte 1
      detail: [{ produit: id('riz'), avis: 'plus' }, { produit: id('sucre'), avis: 'moins' }, { produit: id('huile'), avis: 'autre', remplacement: 'Huile d’arachide' }],
      produitSouhaite: 'Lait', suggestion: 'Livrer le samedi' },
  ]) verif((await envoyer(corps)).statut === 201, 'envoi');
  // Réponse ancienne, hors de la période filtrée plus bas
  await ReponseEnquete.collection.insertOne({ noteGlobale: 1, produitsPlus: [], produitsMoins: [P.sel._id], detail: [], createdAt: new Date('2026-01-15T10:00:00Z') });

  let r = await ctx.appel(cAdmin, 'GET', '/api/admin/enquete/synthese');
  verif(r.statut === 200 && r.json.total === 4, '4 réponses', r);
  verif(r.json.moyennes.globale === 3.5 && r.json.moyennes.livraison === 3.5 && r.json.moyennes.qualite === null, 'moyennes 3,5 / 3,5 / null', r.json.moyennes);
  verif(r.json.parFormule['ahi-essentiel'] === 2 && r.json.parFormule['ahi-confort'] === 1 && r.json.parFormule.autre === 0, 'par formule', r.json.parFormule);
  const ligne = (nom) => r.json.produits.find(p => p.nom === nom);
  verif(r.json.produits[0].nom === 'Riz local' && ligne('Riz local').plus === 3 && ligne('Riz local').moins === 0, 'riz : plus 3, en tête', r.json.produits);
  verif(ligne('Sucre').moins === 1 && ligne('Sel').bien === 1 && ligne('Sel').moins === 1, 'sucre moins 1 (une réponse), sel bien 1 et moins 1', r.json.produits);
  verif(ligne('Huile').autre === 1 && JSON.stringify(ligne('Huile').remplacements) === '["Huile d’arachide"]', 'huile : autre et remplacement', ligne('Huile'));
  verif(r.json.produits.length === 4 && !ligne('Gari'), 'produits de base seulement', r.json.produits.map(p => p.nom));
  verif(r.json.produitsSouhaites.length === 1 && r.json.produitsSouhaites[0].texte === 'Lait' && r.json.suggestions[0].texte === 'Livrer le samedi', 'textes', r.json);

  r = await ctx.appel(cCoord, 'GET', '/api/admin/enquete/synthese?du=2026-01-15&au=2026-01-15');
  verif(r.statut === 200 && r.json.total === 1 && r.json.moyennes.globale === 1, 'coordinateur, période du 15/01 : 1 réponse', r);
  r = await ctx.appel(cAdmin, 'GET', '/api/admin/enquete/synthese?du=2026-02-30');
  verif(r.statut === 400 && r.json.message === 'Date invalide (format AAAA-MM-JJ).', 'date invalide : 400', r);
  r = await ctx.appel(cGest, 'GET', '/api/admin/enquete/synthese');
  verif(r.statut === 403, 'gestionnaire : 403', r.statut);
});

let plusRecente;
test('G. Liste paginée : 20 par page, plus récentes d’abord, noms et contact', async () => {
  await ReponseEnquete.deleteMany({});
  const base = Date.now() - 3600 * 1000;
  await ReponseEnquete.collection.insertMany(Array.from({ length: 25 }, (_, i) => ({
    noteGlobale: (i % 5) + 1, produitsPlus: [P.riz._id], produitsMoins: [], detail: [{ produit: P.huile._id, avis: 'autre', remplacement: 'Arachide' }],
    createdAt: new Date(base + i * 1000), ...(i === 24 && { contact: { prenom: 'Koffi', telephone: '22997000000', accordRecontact: true } }),
  })));
  let r = await ctx.appel(cCoord, 'GET', '/api/admin/enquete/reponses');
  verif(r.statut === 200 && r.json.total === 25 && r.json.page === 1 && r.json.reponses.length === 20, 'page 1 : 20 sur 25', r.json && { total: r.json.total, n: r.json.reponses?.length });
  const premiere = r.json.reponses[0];
  plusRecente = premiere.id;
  verif(premiere.contact?.telephone === '22997000000' && premiere.contact.prenom === 'Koffi', 'plus récente d’abord, contact visible', premiere);
  verif(JSON.stringify(premiere.produitsPlus) === '["Riz local"]' && premiere.detail[0].nom === 'Huile' && premiere.detail[0].remplacement === 'Arachide', 'noms des produits', premiere);
  verif(r.json.reponses[1].contact === null && r.json.reponses[1].noteLivraison === null, 'sans contact : null', r.json.reponses[1]);
  r = await ctx.appel(cAdmin, 'GET', '/api/admin/enquete/reponses?page=2');
  verif(r.json.page === 2 && r.json.reponses.length === 5, 'page 2 : 5', r.json.reponses?.length);
  r = await ctx.appel(cGest, 'GET', '/api/admin/enquete/reponses');
  verif(r.statut === 403, 'gestionnaire : 403', r.statut);
});

test('H. Suppression : refusée au coordinateur, acceptée à l’admin et journalisée sans le téléphone', async () => {
  let r = await ctx.appel(cCoord, 'DELETE', `/api/admin/enquete/${plusRecente}`);
  verif(r.statut === 403 && await ReponseEnquete.exists({ _id: plusRecente }), 'coordinateur : 403, réponse gardée', r);
  r = await ctx.appel(cAdmin, 'DELETE', `/api/admin/enquete/${plusRecente}`);
  verif(r.statut === 204 && !(await ReponseEnquete.exists({ _id: plusRecente })), 'admin : 204, réponse supprimée', r);
  const j = await AuditLog.findOne({ entite: "Réponse à l'enquête" }).lean();
  verif(j && j.action === 'Suppression' && j.entiteId === String(plusRecente) && !/97000000|Koffi/.test(JSON.stringify(j)), 'journal sans téléphone ni prénom', j);
  r = await ctx.appel(cAdmin, 'DELETE', `/api/admin/enquete/${plusRecente}`);
  verif(r.statut === 404, 'déjà supprimée : 404', r.statut);
  r = await ctx.appel(cAdmin, 'DELETE', '/api/admin/enquete/pas-un-id');
  verif(r.statut === 404, 'identifiant invalide : 404', r.statut);
});

test('I. Effacement automatique : index TTL de 365 jours sur createdAt', async () => {
  const index = await ReponseEnquete.collection.indexes();
  const ttl = index.find(i => i.key.createdAt === 1 && i.expireAfterSeconds !== undefined);
  verif(ttl && ttl.expireAfterSeconds === 365 * 24 * 3600, 'expireAfterSeconds = 31 536 000', index);
});
