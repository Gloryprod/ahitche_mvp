// Cartes de l'accueil réglables dans « Site public » (clé « formules ») : publication pour tout pack de la base,
// contrôles, cartes affichées servies par GET /api/public/site (prix et noms) et par llms.txt, et publication ancienne
// (textes des 3 cartes seulement) toujours lue. Données fictives.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { demarrer } = require('./aide');

let ctx, admin, coord;
const col = (nom) => mongoose.connection.collection(nom);

const carte = (reglages = {}) => ({
  afficher: true, ordre: 0, emoji: '🌿', couleur: 'savane', niveau: 1,
  cible: '1 étudiant · par mois', accroche: 'Une accroche fictive pour les tests.', repas: '10–15', heures: '1–2h',
  foyer: '', recommandee: false, ...reglages,
});
const PUBLICATION = {
  'ahi-essentiel': carte({ ordre: 1, foyer: '1', cible: '1 personne · par mois' }),
  'ahi-equilibre': carte({ ordre: 2, foyer: '2-3', couleur: 'foret', niveau: 2, recommandee: true }),
  'ahi-confort': carte({ ordre: 3, foyer: '4-6', couleur: 'marine', niveau: 3 }),
  'ahi-etudiant': carte({ ordre: 0, emoji: '🎓📚', couleur: '#1C2E4A' }), // Pack créé, en tête de l'accueil
  'ahi-masque': carte({ afficher: false, ordre: 4, foyer: '1', recommandee: true }), // Masquée : foyer et recommandation ne comptent pas
  'ahi-inactif': carte({ ordre: 5 }), // Pack inactif : jamais sur l'accueil
};
const avec = (slug, reglages) => ({ ...PUBLICATION, [slug]: { ...PUBLICATION[slug], ...reglages } });
const publier = (cookie, valeurs) => ctx.appel(cookie, 'PUT', '/api/admin/site/formules', { valeurs });
const llms = async () => (await fetch(`${ctx.api}/api/public/llms.txt`)).text();

before(async () => {
  ctx = await demarrer();
  admin = await ctx.connexion('admin');
  coord = await ctx.connexion('coordinateur');
  for (const [type, nom] of [['etudiant', 'AHI Étudiant test'], ['masque', 'AHI Masqué test'], ['inactif', 'AHI Inactif test']]) {
    const r = await ctx.appel(admin, 'POST', '/api/admin/formulas', { type, nom, cible: 'test', prix: 5100, cycleJours: 30, bientotDisponible: false });
    assert.strictEqual(r.statut, 201, JSON.stringify(r));
  }
  await col('formules').updateOne({ slug: 'ahi-inactif' }, { $set: { statut: 'inactif' } });
});

after(async () => { await ctx?.arreter(); });

test('rien de publié : les 3 cartes par défaut, avec leur nom en base', async () => {
  const r = await ctx.appel(null, 'GET', '/api/public/site');
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.strictEqual(r.json.formules, null);
  assert.deepStrictEqual(r.json.noms, { 'ahi-essentiel': 'AHI essentiel', 'ahi-equilibre': 'AHI equilibre', 'ahi-confort': 'AHI confort' });
  assert.deepStrictEqual(Object.keys(r.json.prix), ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort']);
});

test('publier les cartes : admin seulement, un pack créé affiché, journal avec le nom en base', async () => {
  assert.strictEqual((await publier(coord, PUBLICATION)).statut, 403);
  const r = await publier(admin, PUBLICATION);
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.deepStrictEqual(r.json.contenu.valeurs, PUBLICATION);

  const modifiee = { ...avec('ahi-etudiant', { emoji: '🎓', couleur: 'foret' }), 'ahi-masque': { ...PUBLICATION['ahi-masque'], afficher: true, foyer: '', recommandee: false } };
  assert.strictEqual((await publier(admin, modifiee)).statut, 200);
  const journal = await col('auditlogs').findOne({ entite: 'Site public', entiteId: 'formules', action: 'Modification' });
  assert.match(journal?.resume ?? '', /^Formules publiées : AHI Étudiant test \(emoji, couleur\), AHI Masqué test \(affichée, taille de foyer\)$/, journal?.resume);
  assert.strictEqual((await publier(admin, PUBLICATION)).statut, 200);
});

test('publication refusée : pack inconnu, aucune carte affichée, deux recommandées, foyer en double, réglages invalides', async () => {
  const toutes = (reglages) => Object.fromEntries(Object.entries(PUBLICATION).map(([slug, c]) => [slug, { ...c, ...reglages }]));
  const sansNiveau = { ...PUBLICATION['ahi-etudiant'] };
  delete sansNiveau.niveau;
  for (const [valeurs, motif] of [
    [{ ...PUBLICATION, 'ahi-inconnu': carte() }, /^Formule inconnue : ahi-inconnu\.$/],
    [toutes({ afficher: false }), /au moins une carte doit être affichée/],
    [{ ...toutes({ afficher: false }), 'ahi-inactif': carte() }, /au moins une carte doit être affichée/], // Seul un pack inactif
    [avec('ahi-etudiant', { recommandee: true }), /recommandée : une seule au plus/],
    [avec('ahi-etudiant', { foyer: '1' }), /Taille de foyer : une carte affichée différente/],
    [avec('ahi-inactif', { foyer: '4-6' }), /Taille de foyer : une carte affichée différente/], // Compte aussi : conflit à sa réactivation
    ...['rouge', '#12345', '#GGGGGG', '#1C2E4A;', 12, null].map((couleur) => [avec('ahi-etudiant', { couleur }), /couleur, savane, foret, marine/]),
    ...['', '   ', '<b>', 'abcdefghi', '\u0007', '\u0085', '\u0090', 5].map((emoji) => [avec('ahi-etudiant', { emoji }), /AHI Étudiant test : emoji/]),
    [avec('ahi-etudiant', { niveau: 4 }), /niveau de confort/], [{ ...PUBLICATION, 'ahi-etudiant': sansNiveau }, /niveau de confort/],
    [avec('ahi-etudiant', { ordre: 100 }), /ordre/], [avec('ahi-etudiant', { ordre: 1.5 }), /ordre/],
    [avec('ahi-etudiant', { afficher: 'oui' }), /afficher sur l'accueil/], [avec('ahi-etudiant', { foyer: '7' }), /taille de foyer, 1, 2-3, 4-6 ou aucune/],
  ]) {
    const r = await publier(admin, valeurs);
    assert.ok(r.statut === 400 && motif.test(r.json?.message), `${JSON.stringify(valeurs['ahi-etudiant'])} -> ${JSON.stringify(r)}`);
  }
});

test('GET /api/public/site : prix et noms des cartes affichées, dans l’ordre ; ni pack masqué, ni pack inactif', async () => {
  const r = await ctx.appel(null, 'GET', '/api/public/site');
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.deepStrictEqual(Object.entries(r.json.noms), [
    ['ahi-etudiant', 'AHI Étudiant test'], ['ahi-essentiel', 'AHI essentiel'], ['ahi-equilibre', 'AHI equilibre'], ['ahi-confort', 'AHI confort'],
  ]);
  assert.deepStrictEqual(r.json.prix, { 'ahi-etudiant': 5100, 'ahi-essentiel': null, 'ahi-equilibre': null, 'ahi-confort': null });
  assert.strictEqual(r.json.formules['ahi-etudiant'].emoji, '🎓📚');
});

test('llms.txt : le pack affiché, dans l’ordre des cartes ; ni pack masqué, ni pack inactif', async () => {
  const texte = await llms();
  assert.match(texte, /- AHI Étudiant test : 1 étudiant, 5 100 FCFA par mois\.\n- AHI Essentiel : 1 personne, 10 800 FCFA par mois\./);
  assert.match(texte, /- AHI Réserve et AHI Fraîcheur : bientôt disponibles\./);
  assert.doesNotMatch(texte, /Masqué|Inactif/);
});

test('publication ancienne (textes des 3 cartes seulement, sans migration) : toujours servie, cartes par défaut', async () => {
  const textes = (foyer, recommandee) => ({ cible: '1 personne · par mois', accroche: 'Les bases de votre mois.', repas: '20–30', heures: '2–4h', foyer, recommandee });
  const ancienne = { 'ahi-essentiel': textes('1', false), 'ahi-equilibre': textes('2-3', true), 'ahi-confort': textes('4-6', false) };
  await col('contenusites').updateOne({ cle: 'formules' }, { $set: { valeurs: ancienne } });
  const r = await ctx.appel(null, 'GET', '/api/public/site');
  assert.strictEqual(r.statut, 200, JSON.stringify(r));
  assert.deepStrictEqual(r.json.formules, ancienne);
  assert.deepStrictEqual(Object.keys(r.json.noms), ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort']);
  const texte = await llms();
  assert.match(texte, /- AHI Essentiel : 1 personne, 10 800 FCFA par mois\./);
  assert.doesNotMatch(texte, /Étudiant/);
});
