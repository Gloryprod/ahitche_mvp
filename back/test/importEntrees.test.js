// Import groupé des entrées de stock (POST /api/admin/stock/lots/import) : droits, contrôles de chaque ligne,
// simulation sans écriture, tout ou rien, pièces et dépenses, manques comblés, journal.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { demarrer, BACK } = require('./aide');

const modele = (nom) => require(path.join(BACK, 'src/models', nom));
const verifier = (nom, condition, detail = '') => assert.ok(condition, detail === '' ? nom : `${nom} : ${detail}`);
const ROUTE = '/api/admin/stock/lots/import';
const E = 'reference_produit;quantite;valeur_fcfa;date_reception;fournisseur;numero_piece;conditionnement';

let ctx, admin, gest;
const col = (nom) => mongoose.connection.collection(nom);
const imp = (cookie, texte, appliquer = false) => ctx.appel(cookie, 'POST', ROUTE, { texte, appliquer });
const compter = async () => ({
  lots: await col('lotstockfifos').countDocuments(), mouvements: await col('mouvementstocks').countDocuments(),
  depenses: await col('expenses').countDocuments(), journal: await col('auditlogs').countDocuments(),
  manques: await col('manquestocks').countDocuments({ quantiteRestante: { $gt: 0 } }),
});

before(async () => {
  ctx = await demarrer();
  const Product = modele('product'), Partner = modele('partner'), BudgetLine = modele('budgetLine'), Expense = modele('expense');
  await Product.create([
    { name: 'Riz essai', reference: 'T01', unit: 'kg' },
    { name: 'Huile essai', reference: 'T02', unit: 'L' },
    { name: 'Sucre essai', reference: 'T03', unit: 'kg' },
  ]);
  const [grossiste] = await Partner.create([
    { nom: 'Grossiste Éssai', type: 'Fournisseur' },
    { nom: 'Autre Grossiste', type: 'Fournisseur' },
    { nom: 'Fournisseur Inactif', type: 'Fournisseur', actif: false },
    { nom: 'Livreur Essai', type: 'Livreur' },
  ]);
  await BudgetLine.create([{ code: 'LX1', libelle: 'Ligne essai 1', categorieAd: 1 }, { code: 'LX2', libelle: 'Ligne essai 2' }]);
  // Pièce déjà saisie dans les Finances (rattachement)
  await Expense.create({ categorie: 'Budget', referenceLigne: 'LX1', libelle: 'Facture essai', numeroPiece: 'PIECE-EXIST', montantPrevuFcfa: 1000, creePar: ctx.comptes.admin._id });
  admin = await ctx.connexion('admin');
  gest = await ctx.connexion('gestionnaire');
  // 5 lots de T01 reçus le 10/11 par le formulaire (LOT-T01-20261110-01 à 05) : l'import continue la numérotation
  const T01 = await Product.findOne({ reference: 'T01' });
  for (let i = 0; i < 5; i++) {
    const r = await ctx.appel(admin, 'POST', '/api/admin/stock/lots', { productId: T01._id, fournisseurId: grossiste._id, dateReception: '2026-11-10', quantiteRecue: 1, prixAchatUnitaire: 700, creerDepense: false });
    assert.strictEqual(r.statut, 201, JSON.stringify(r));
  }
});

after(async () => { await ctx?.arreter(); });

test('droits : comptable, coordinateur, client et visiteur refusés', async () => {
  for (const role of ['comptable', 'coordinateur', 'user']) {
    const r = await imp(await ctx.connexion(role), E + '\nT01;1;1;2026-11-10;Grossiste Essai;;');
    verifier(`refus ${role}`, r.statut === 403, JSON.stringify(r));
  }
  const visiteur = await ctx.appel(null, 'POST', ROUTE, { texte: 'x', appliquer: false });
  verifier('refus visiteur', visiteur.statut === 401, JSON.stringify(visiteur));
});

test('envois invalides', async () => {
  for (const [nom, corps, motif] of [
    ['texte absent', { appliquer: false }, /Collez/], ['texte objet', { texte: { $gt: '' }, appliquer: false }, /Collez/],
    ['texte vide', { texte: '   ', appliquer: false }, /Collez/], ['appliquer chaîne', { texte: E, appliquer: 'true' }, /appliquer/],
    ['appliquer absent', { texte: E }, /appliquer/],
  ]) {
    const r = await ctx.appel(admin, 'POST', ROUTE, corps);
    verifier(nom, r.statut === 400 && motif.test(r.json?.message), JSON.stringify(r));
  }
  const nonJson = await ctx.appel(admin, 'POST', ROUTE, '{texte:', true);
  verifier('JSON illisible', nonJson.statut === 400, JSON.stringify(nonJson));
  for (const [nom, texte, motif] of [
    ['colonne inconnue', E + ';couleur\nT01;1;1;2026-11-10;Grossiste Essai;;;x', /colonne inconnue « couleur »/],
    ['colonne en double', E + ';Quantité\nT01;1;1;2026-11-10;Grossiste Essai;;;1', /quantite en double/],
    ['obligatoire absente', 'reference_produit;quantite;fournisseur\nT01;1;Grossiste Essai', /date_reception, valeur_fcfa/],
    ['en-tête seul', E, /Aucune ligne/],
  ]) {
    const r = await imp(admin, texte);
    verifier(nom, r.statut === 400 && motif.test(r.json?.message), JSON.stringify(r));
  }
});

test('limites : 200 lignes et 100 Ko', async () => {
  const ligne = 'T01;1;100;2026-11-12;Grossiste Essai;;';
  const l200 = await imp(admin, [E, ...Array(200).fill(ligne)].join('\n'));
  verifier('200 lignes acceptées', l200.statut === 200 && l200.json.resume.lignes === 200 && l200.json.resume.lotsCrees === 200, JSON.stringify(l200.json?.resume));
  verifier('200 lignes : numéros 01 à 200', l200.json?.lignes?.[199]?.numeroLot === 'LOT-T01-20261112-200' && l200.json.lignes[0].numeroLot === 'LOT-T01-20261112-01', l200.json?.lignes?.[199]?.numeroLot);
  const l201 = await imp(admin, [E, ...Array(201).fill(ligne)].join('\n'));
  verifier('201 lignes refusées', l201.statut === 400 && /200 lignes au plus/.test(l201.json?.message), JSON.stringify(l201));
  const r100 = await imp(admin, E + ';commentaire\n' + ligne + ';' + 'é'.repeat(52000));
  verifier('plus de 100 Ko refusé (400)', r100.statut === 400 && /100 Ko/.test(r100.json?.message), JSON.stringify(r100).slice(0, 200));
  // 99 Ko de tabulations : le JSON dépasse 100 Ko, la route l'accepte quand même
  const tabs = 'reference_produit\tquantite\tvaleur_fcfa\tdate_reception\tfournisseur\tcommentaire\n' + Array(200).fill('T01\t1\t100\t2026-11-12\tGrossiste Essai\t"' + 'x'.repeat(470) + '"').join('\n');
  const octetsTexte = Buffer.byteLength(tabs), octetsJson = Buffer.byteLength(JSON.stringify({ texte: tabs, appliquer: false }));
  const rtab = await imp(admin, tabs);
  verifier('texte < 100 Ko, JSON > 100 Ko : accepté', octetsTexte <= 102400 && octetsJson > 102400 && rtab.statut === 200 && rtab.json.resume.lotsCrees === 200, `${rtab.statut} texte ${octetsTexte} json ${octetsJson} ${rtab.json?.message}`);
});

let avant;

test('contrôles de chaque ligne, simulation sans écriture', async () => {
  avant = await compter();
  const texteControles = [
    'Référence Produit;Quantité;Prix achat unitaire FCFA;valeur_fcfa;Date Réception;fournisseur;numero_piece;a_confirmer;ligne_budgetaire;creer_depense',
    'T01;2;500;1 000;10/11/2026;grossiste essai;;;;',            // 2 ok (casse et accents du fournisseur)
    'X99;1;;100;2026-11-10;Grossiste Essai;;;;',                 // 3 produit inconnu
    'T01;1;;100;2026-11-10;Fournisseur Inconnu;;;;',             // 4 fournisseur inconnu
    'T01;1;;100;2026-11-10;Production interne;;;;',              // 5 production interne
    'T01;1;;100;2026-11-10;Fournisseur Inactif;;;;',             // 6 inactif
    'T01;2;500;900;2026-11-10;Grossiste Essai;;;;',              // 7 total incohérent
    'T01;2;500;1000,5;2026-11-10;Grossiste Essai;;;;',           // 8 écart 0,5 : ok
    'T01;0;;100;2026-11-10;Grossiste Essai;;;;',                 // 9 quantité 0
    'T01;-1;;100;2026-11-10;Grossiste Essai;;;;',                // 10 négatif
    'T01;0x10;;100;2026-11-10;Grossiste Essai;;;;',              // 11 hexadécimal
    'T01;1e2;;100;2026-11-10;Grossiste Essai;;;;',               // 12 exponentiel
    'T01;1;;;2026-11-10;Grossiste Essai;;;;',                    // 13 valeur vide
    'T01;1;;100;;Grossiste Essai;;;;',                           // 14 date vide
    'T01;1;;100;31/02/2026;Grossiste Essai;;;;',                 // 15 date inexistante
    'T01;1;;100;2026/11/10;Grossiste Essai;;;;',                 // 16 date illisible
    'T01;1;;100;2026-11-10;Grossiste Essai;;;L404;',             // 17 ligne inconnue
    'T01;1;;100;2026-11-10;Grossiste Essai;;;;peut-être',        // 18 creer_depense invalide
    'T02;;;5 000;2026-11-10;Grossiste Essai;;Compter les bouteilles;;', // 19 à compter
    'T02;;;5000;2026-11-10;Grossiste Essai;;;;',                 // 20 à compter sans consigne
    'T01;3;;1000;2026-11-10;Grossiste Essai;;;;non',             // 21 prix déduit, sans dépense
    ';1;;100;2026-11-10;Grossiste Essai;;;;;en trop',            // 22 référence vide + cellule hors colonnes
  ].join('\n');
  const rc = await imp(admin, texteControles);
  const L = (n) => rc.json.lignes.find((l) => l.ligne === n);
  const a = (n, statut, motif) => verifier(`ligne ${n}`, L(n)?.statut === statut && (!motif || L(n).messages.some((m) => motif.test(m))), JSON.stringify(L(n)));
  verifier('simulation avec erreurs : 200', rc.statut === 200 && /à corriger/.test(rc.json?.message), JSON.stringify(rc.json?.message));
  a(2, 'ok', /Dépense créée/); verifier('ligne 2 : prix et valeur', L(2).prixAchat === 500 && L(2).valeur === 1000 && L(2).quantite === 2 && L(2).produit === 'Riz essai');
  a(3, 'erreur', /Produit X99 introuvable/); a(4, 'erreur', /Fournisseur introuvable/); a(5, 'erreur', /Production interne.*Transformation/);
  a(6, 'erreur', /Fournisseur introuvable/); a(7, 'erreur', /Total incohérent/); a(8, 'ok'); a(9, 'erreur', /Quantité à 0/);
  a(10, 'erreur', /Quantité : nombre positif/); a(11, 'erreur', /Quantité : nombre positif/); a(12, 'erreur', /Quantité : nombre positif/);
  a(13, 'erreur', /Valeur du lot/); a(14, 'erreur', /Date de réception manquante/); a(15, 'erreur', /illisible/); a(16, 'erreur', /illisible/);
  a(17, 'erreur', /L404 n'existe pas/); a(18, 'erreur', /oui ou non/); a(19, 'ok', /Dépense créée/); a(20, 'erreur', /a_confirmer/);
  verifier('lignes refusées : aucun message de dépense', rc.json.lignes.filter((l) => l.statut === 'erreur').every((l) => !l.messages.some((m) => /Dépense créée|Sans dépense|Rattachée|Une seule dépense/.test(m))));
  a(21, 'ok', /Sans dépense/); a(22, 'erreur', /Référence du produit manquante/); a(22, 'erreur', /hors des colonnes/);
  verifier('à compter : quantité et prix vides', L(19).quantite === null && L(19).prixAchat === null && L(19).valeur === 5000);
  verifier('prix déduit valeur ÷ quantité', L(21).prixAchat === 333.33, String(L(21).prixAchat));
  verifier('lignes en erreur sans numéro', L(3).numeroLot === null);
  verifier('résumé sur les lignes sans erreur', rc.json.resume.lignes === 21 && rc.json.resume.lotsCrees === 4 && rc.json.resume.totalFcfa === 8001, JSON.stringify(rc.json.resume));
  verifier('numéros après les lots du jour', L(2).numeroLot === 'LOT-T01-20261110-06' && L(8).numeroLot === 'LOT-T01-20261110-07' && L(21).numeroLot === 'LOT-T01-20261110-08', `${L(2).numeroLot} ${L(8).numeroLot} ${L(21).numeroLot}`);
  const apresSimu = await compter();
  verifier('simulation avec erreurs : rien écrit', JSON.stringify(avant) === JSON.stringify(apresSimu), JSON.stringify([avant, apresSimu]));
});

test('tout ou rien : une ligne en erreur, rien n’est enregistré', async () => {
  const ttr = await imp(admin, [E, 'T01;1;100;2026-11-11;Grossiste Essai;;', 'T02;1;100;2026-11-11;Grossiste Essai;;', 'T01;1;100;2026-11-11;Inconnu;;'].join('\n'), true);
  verifier('tout ou rien : 400', ttr.statut === 400 && /rien n'a été enregistré/.test(ttr.json?.message) && ttr.json.resume.lotsCrees === 0, JSON.stringify(ttr.json?.resume));
  verifier('tout ou rien : rien écrit', JSON.stringify(await compter()) === JSON.stringify(avant));
});

// Pièce sur deux lignes (une dépense au total) et pièce déjà saisie, dans trois formats de collage
const lignesPiece = [
  ['T01', '80', '96000', '2026-11-10', 'Grossiste Essai', 'IMP-001', '10 cartons de 8 kg'],
  ['T02', '40', '60000', '2026-11-10', 'Grossiste Essai', 'IMP-001', '2 cartons de 5 L x 4'],
  ['T03', '2', '1200', '2026-11-10', 'Autre Grossiste', 'PIECE-EXIST', ''],
];
const entetes = E.split(';');
const formats = {
  pointVirgule: [entetes, ...lignesPiece].map((l) => l.join(';')).join('\n'),
  tabulation: [entetes, ...lignesPiece].map((l) => l.join('\t')).join('\r\n'),
  markdown: [entetes, entetes.map(() => '---'), ...lignesPiece].map((l) => `| ${l.join(' | ')} |`).join('\n'),
};

test('séparateurs, pièces et avertissements (simulation)', async () => {
  const simus = {};
  for (const [nom, texte] of Object.entries(formats)) {
    simus[nom] = await imp(admin, texte);
    verifier(`séparateur ${nom}`, simus[nom].statut === 200 && simus[nom].json.lignes.length === 3 && simus[nom].json.lignes.every((l) => l.statut !== 'erreur'), JSON.stringify(simus[nom].json).slice(0, 400));
  }
  verifier('trois séparateurs : même aperçu', JSON.stringify(simus.pointVirgule.json) === JSON.stringify(simus.tabulation.json) && JSON.stringify(simus.tabulation.json) === JSON.stringify(simus.markdown.json));
  const s = simus.pointVirgule.json;
  verifier('aperçu pièce : une dépense', s.lignes[0].messages.includes('Une seule dépense pour la pièce IMP-001 (2 lots).'), JSON.stringify(s.lignes[0]));
  verifier('aperçu pièce existante : rattachement', s.lignes[2].statut === 'ok' && s.lignes[2].messages.some((m) => /Rattachée à la dépense existante de la pièce PIECE-EXIST/.test(m)), JSON.stringify(s.lignes[2]));
  // Avertissements : fournisseurs différents sur une pièce ; ligne budgétaire différente de la dépense existante (LX1)
  const av = await imp(admin, ['reference_produit;quantite;valeur_fcfa;date_reception;fournisseur;numero_piece;ligne_budgetaire',
    'T01;1;100;2026-11-16;Grossiste Essai;AV-1;', 'T02;1;100;2026-11-16;Autre Grossiste;AV-1;', 'T03;1;100;2026-11-16;Grossiste Essai;PIECE-EXIST;LX2'].join('\n'));
  verifier('avertissement fournisseurs différents', av.json.lignes[0].statut === 'ok' && av.json.lignes[1].statut === 'avertissement' && av.json.lignes[1].messages.some((m) => /AV-1 : fournisseur différent de la ligne 2/.test(m)), JSON.stringify(av.json.lignes[1]));
  verifier('avertissement ligne budgétaire ≠ dépense existante', av.json.lignes[2].statut === 'avertissement' && av.json.lignes[2].messages.some((m) => /ligne budgétaire différente de celle de la dépense \(LX1\)/.test(m)), JSON.stringify(av.json.lignes[2]));
  verifier('avertissements non bloquants', av.json.resume.lotsCrees === 3 && /prêts à importer/.test(av.json.message), JSON.stringify(av.json.resume));
  verifier('résumé', s.resume.lignes === 3 && s.resume.totalFcfa === 157200 && s.resume.lotsCrees === 3, JSON.stringify(s.resume));
  verifier('simulation sans erreur : rien écrit', JSON.stringify(await compter()) === JSON.stringify(avant));
});

let dep, lots;

test('application : lots, une dépense par pièce, manque comblé, journal', async () => {
  const journalAvant = await col('auditlogs').countDocuments();
  // Manque ouvert sur T03 : l'import le comble
  const T03 = await col('products').findOne({ reference: 'T03' });
  await col('manquestocks').insertOne({ product: T03._id, quantiteInitiale: 1.5, quantiteRestante: 1.5, reference: 'CMD-901', couts: [], orderId: null, creePar: null, dateComblement: null, createdAt: new Date(), updatedAt: new Date() });
  const avantApp = await compter();
  const app = await imp(gest, formats.tabulation, true);
  verifier('application : 201', app.statut === 201 && app.json.message === '3 lots importés. Manques comblés sur 1 lot.' && app.json.resume.lotsCrees === 3, JSON.stringify(app.json?.message));
  verifier('application : comblement signalé', app.json.lignes[2].messages.some((m) => /1,5 kg pour combler CMD-901/.test(m)), JSON.stringify(app.json.lignes[2]));
  const apresApp = await compter();
  verifier('application : 3 lots, 3 entrées + 1 sortie de comblement', apresApp.lots - avantApp.lots === 3 && apresApp.mouvements - avantApp.mouvements === 4 && apresApp.manques === avantApp.manques - 1, JSON.stringify([avantApp, apresApp]));
  verifier('application : 1 seule dépense créée', apresApp.depenses - avantApp.depenses === 1);
  dep = await col('expenses').findOne({ numeroPiece: 'IMP-001' });
  lots = await col('lotstockfifos').find({ numeroPiece: 'IMP-001' }).toArray();
  verifier('dépense de la pièce = total, sans lotStockId', dep.montantPrevuFcfa === 156000 && dep.lotStockId === null && dep.categorie === 'Exploitation' && dep.typeExploitation === 'Achat stock', JSON.stringify({ m: dep.montantPrevuFcfa, l: dep.lotStockId }));
  verifier('libellé de la dépense', dep.libelle === `Achat Riz essai, Huile essai - lots ${lots.map((l) => l.numeroLot).join(', ')}`, dep.libelle);
  verifier('lots rattachés à la dépense', lots.length === 2 && lots.every((l) => String(l.depenseId) === String(dep._id)));
  const lotT01 = lots.find((l) => l.quantiteInitiale === 80);
  verifier('lot T01 : prix déduit, conditionnement, date', lotT01.prixAchatUnitaire === 1200 && lotT01.valeurFcfa === 96000 && lotT01.conditionnement === '10 cartons de 8 kg' && lotT01.numeroLot === 'LOT-T01-20261110-06', JSON.stringify({ p: lotT01.prixAchatUnitaire, n: lotT01.numeroLot }));
  const existante = await col('expenses').findOne({ numeroPiece: 'PIECE-EXIST' });
  const lotExist = await col('lotstockfifos').findOne({ numeroPiece: 'PIECE-EXIST', product: T03._id });
  verifier('pièce existante : rattachée, pas de seconde dépense', String(lotExist.depenseId) === String(existante._id) && await col('expenses').countDocuments({ numeroPiece: 'PIECE-EXIST' }) === 1);
  verifier('lot T03 : reste après comblement', lotExist.quantiteRestante === 0.5, String(lotExist.quantiteRestante));
  const journal = await col('auditlogs').find({}).sort({ _id: -1 }).limit(3).toArray();
  verifier('journal : une ligne de résumé', journal[0].resume === 'Import de 3 lots (2 pièces)' && journal[0].action === 'Import', journal[0].resume);
  verifier('journal : la dépense créée a sa ligne, pas de ligne par lot', /Dépense créée par l'import de stock \(pièce IMP-001, 2 lots\)/.test(journal[1].resume) && await col('auditlogs').countDocuments() - journalAvant === 2, journal.map((j) => j.resume).join(' / '));
});

test('après l’import : modification d’un lot, relance, pièces mixtes, budget, lots sans pièce', async () => {
  // Modifier un lot de la pièce ne ramène pas la dépense au montant du lot
  const lotT02 = lots.find((l) => l.quantiteInitiale === 40);
  const put = await ctx.appel(admin, 'PUT', `/api/admin/stock/lots/${lotT02._id}`, { prixAchatUnitaire: 1000, commentaire: 'modifié' });
  const depApres = await col('expenses').findOne({ _id: dep._id });
  verifier('modification d\'un lot : dépense de la pièce inchangée', put.statut === 200 && depApres.montantPrevuFcfa === 156000, `${put.statut} ${depApres.montantPrevuFcfa}`);

  // Relancer le même collage : nouveaux numéros, rattachement à la dépense désormais existante
  const re = await imp(admin, formats.pointVirgule);
  verifier('relance : numéros suivants et rattachement', re.json.lignes[0].numeroLot === 'LOT-T01-20261110-07' && re.json.lignes[0].messages.some((m) => /Rattachée à la dépense existante de la pièce IMP-001/.test(m)), JSON.stringify(re.json.lignes[0]));

  // Pièce nouvelle : creer_depense différent selon les lignes, ligne budgétaire différente
  const mix = await imp(admin, ['reference_produit;quantite;valeur_fcfa;date_reception;fournisseur;numero_piece;creer_depense;ligne_budgetaire',
    'T01;1;100;2026-11-13;Grossiste Essai;MIX-1;oui;', 'T02;1;100;2026-11-13;Grossiste Essai;MIX-1;non;',
    'T01;1;100;2026-11-13;Grossiste Essai;MIX-2;;LX1', 'T02;1;100;2026-11-13;Grossiste Essai;MIX-2;;LX2'].join('\n'));
  verifier('creer_depense différent dans une pièce : erreur', mix.json.lignes[0].statut === 'erreur' && mix.json.lignes[1].messages.some((m) => /même sur toutes les lignes de la pièce MIX-1/.test(m)));
  verifier('ligne budgétaire différente dans une pièce : avertissement', mix.json.lignes[2].statut === 'ok' && mix.json.lignes[3].statut === 'avertissement' && mix.json.lignes[3].messages.some((m) => /ligne budgétaire différente.*LX1/.test(m)), JSON.stringify(mix.json.lignes.slice(2)));

  // Pièce nouvelle sur plusieurs lignes, imputée au budget : une dépense « Budget » sur la ligne de la première
  const avantBudget = await compter();
  const bud = await imp(admin, ['reference_produit;quantite;valeur_fcfa;date_reception;fournisseur;numero_piece;ligne_budgetaire',
    'T01;1;100;2026-11-14;Grossiste Essai;BUD-1;LX1', 'T02;1;250;2026-11-14;Grossiste Essai;BUD-1;LX1'].join('\n'), true);
  const depBud = await col('expenses').findOne({ numeroPiece: 'BUD-1' });
  verifier('pièce au budget', bud.statut === 201 && depBud?.categorie === 'Budget' && depBud.referenceLigne === 'LX1' && depBud.montantPrevuFcfa === 350 && depBud.categorieAd === 1 && (await compter()).depenses - avantBudget.depenses === 1, JSON.stringify(depBud && { c: depBud.categorie, r: depBud.referenceLigne }));

  // Sans pièce et creer_depense oui : une dépense par lot, liée à son lot (comme le formulaire)
  const avantSans = await compter();
  const sans = await imp(admin, [E, 'T01;1;100;2026-11-15;Grossiste Essai;;', 'T01;2;300;2026-11-15;Grossiste Essai;;'].join('\n'), true);
  const depsSans = await col('expenses').find({ montantPrevuFcfa: { $in: [100, 300] }, numeroPiece: '', lotStockId: { $ne: null } }).toArray();
  verifier('sans pièce : une dépense par lot', sans.statut === 201 && (await compter()).depenses - avantSans.depenses === 2 && depsSans.length === 2, `${sans.statut} ${depsSans.length}`);
});
