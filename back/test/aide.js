// Outils communs des tests de l'API (npm test) : base MongoDB jetable en mémoire, en replica set à un nœud (exigé
// par les transactions de la livraison et du stock), et API lancée dans un processus à part sur un port libre.
// Données fictives seulement ; aucun service extérieur n'est appelé.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BACK = path.join(__dirname, '..');
const MOT_DE_PASSE = 'Essai-Local-2026';
const ROLES = ['admin', 'gestionnaire', 'comptable', 'coordinateur', 'user'];

function portLibre() {
  return new Promise((ok, ko) => {
    const serveur = net.createServer().once('error', ko).listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      serveur.close(() => ok(port));
    });
  });
}

// Démarre la base et l'API, crée un compte par rôle (« admin@essai.local »…). À arrêter avec arreter().
async function demarrer() {
  const base = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: process.env.MONGOMS_VERSION || '8.2.6' },
  });
  const uri = base.getUri('ahitche_tests');
  // Garde-fou : jamais une autre base que celle qui vient d'être créée sur ce poste
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
    await base.stop();
    throw new Error(`Base des tests non locale : ${uri}`);
  }
  await mongoose.connect(uri);
  for (const fichier of fs.readdirSync(path.join(BACK, 'src/models'))) require(path.join(BACK, 'src/models', fichier));
  // Collections et index créés avant les transactions
  await Promise.all(Object.values(mongoose.models).map((modele) => modele.init()));

  // Les 5 formules du référentiel, comme en production (packs reconnus par packService) ; aucun prix
  await mongoose.connection.collection('formules').insertMany(['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'].map((type) => ({
    slug: `ahi-${type}`, nom: `AHI ${type}`, cible: 'test', statut: 'actif', bientotDisponible: false, cycleJours: 30, lienWhatsApp: 'https://wa.me/', prixActuel: null,
  })));

  const User = require(path.join(BACK, 'src/models/user'));
  const hash = await bcrypt.hash(MOT_DE_PASSE, 4);
  const comptes = {};
  for (const role of ROLES) {
    comptes[role] = await User.create({ username: `Test ${role}`, email: `${role}@essai.local`, password: hash, role, adminPrincipal: role === 'admin' });
  }

  const port = await portLibre();
  const api = `http://127.0.0.1:${port}`;
  // Environnement entièrement imposé, et dossier courant sans .env : le .env du poste (base de production, clés)
  // n'est jamais lu (dotenv cherche .env dans le dossier courant et ne remplace pas une variable déjà définie).
  const env = {
    PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT,
    MONGO_URI: uri, PORT: String(port), NODE_ENV: 'test',
    JWT_SECRET: 'secret-des-tests', RESEND_API_KEY: 're_tests', FRONTEND_URL: 'http://localhost:4173',
    SENTRY_DSN: '', ADMIN_PASSWORD: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
  };
  const processus = spawn(process.execPath, [path.join(BACK, 'index.js')], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let journal = '';
  processus.stdout.on('data', (d) => { journal += d; });
  processus.stderr.on('data', (d) => { journal += d; });
  for (let i = 0; ; i++) {
    if (processus.exitCode !== null) throw new Error(`L'API s'est arrêtée au démarrage :\n${journal}`);
    try { if ((await fetch(`${api}/api/sante`)).ok) break; } catch { /* pas encore prête */ }
    // 60 s : le premier démarrage peut être lent sur un poste chargé (un essai à 30 s a échoué)
    if (i >= 120) throw new Error(`L'API ne répond pas après 60 s :\n${journal}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  async function appel(cookie, methode, chemin, corps, brut = false) {
    const r = await fetch(api + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: corps === undefined ? undefined : (brut ? corps : JSON.stringify(corps)),
    });
    let json = null;
    try { json = await r.json(); } catch { /* réponse sans JSON */ }
    return { statut: r.status, json };
  }

  // Cookie de session du compte du rôle donné
  async function connexion(role) {
    const r = await fetch(`${api}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}@essai.local`, password: MOT_DE_PASSE }),
    });
    const cookie = r.headers.get('set-cookie');
    if (!r.ok || !cookie) throw new Error(`Connexion ${role} : ${r.status}`);
    return cookie.split(';')[0];
  }

  // Lance un script de src/scripts sur la base des tests, avec le même environnement imposé que l'API
  function script(nom, args = []) {
    return new Promise((ok) => {
      const p = spawn(process.execPath, [path.join(BACK, 'src/scripts', nom), ...args], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let sortie = '';
      p.stdout.on('data', (d) => { sortie += d; });
      p.stderr.on('data', (d) => { sortie += d; });
      p.on('close', (code) => ok({ code, sortie }));
    });
  }

  async function arreter() {
    processus.kill();
    await mongoose.disconnect();
    await base.stop();
  }

  return { api, comptes, appel, connexion, script, arreter, journal: () => journal };
}

module.exports = { demarrer, BACK };
