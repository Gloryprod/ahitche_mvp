// Restaure une sauvegarde faite par sauvegarderBase.js dans une base VIDE (refus si elle contient déjà des données :
// on ne mélange jamais une sauvegarde avec des données existantes). Les index sont recréés, puis les nombres de
// documents sont comparés au manifeste.
// Usage : MONGO_URI=<adresse de la base cible> node src/scripts/restaurerBase.js <dossier de la sauvegarde>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
// Pilote MongoDB et EJSON fournis par Mongoose (dépendance du projet)
const { mongo: { MongoClient, BSON: { EJSON } } } = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function restaurer() {
  const dossier = process.argv[2];
  if (!dossier || !fs.existsSync(path.join(dossier, 'manifeste.json'))) {
    console.error('Usage : MONGO_URI=… node src/scripts/restaurerBase.js <dossier contenant manifeste.json>');
    process.exit(1);
  }
  const manifeste = JSON.parse(fs.readFileSync(path.join(dossier, 'manifeste.json'), 'utf8'));
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();
  const existantes = (await db.listCollections({}, { nameOnly: true }).toArray()).filter(c => !c.name.startsWith('system.'));
  if (existantes.length) throw new Error(`La base « ${db.databaseName} » n'est pas vide (${existantes.length} collection(s)) : restauration refusée.`);

  let ecarts = 0;
  for (const [nom, { documents, index }] of Object.entries(manifeste.collections)) {
    const collection = db.collection(nom);
    await db.createCollection(nom);
    const lecture = readline.createInterface({ input: fs.createReadStream(path.join(dossier, `${nom}.jsonl.gz`)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let lot = [], total = 0;
    for await (const ligne of lecture) {
      if (!ligne.trim()) continue;
      lot.push(EJSON.parse(ligne, { relaxed: false }));
      if (lot.length === 500) { await collection.insertMany(lot, { ordered: true }); total += lot.length; lot = []; }
    }
    if (lot.length) { await collection.insertMany(lot, { ordered: true }); total += lot.length; }
    for (const { key, v, ns, background, ...options } of index) await collection.createIndex(key, options);
    const ok = total === documents;
    if (!ok) ecarts++;
    console.log(`  ${ok ? '✔' : '✘'} ${nom} : ${total} document(s)${ok ? '' : ` (manifeste : ${documents})`}, ${index.length} index`);
  }
  await client.close();
  if (ecarts) { console.error(`❌ ${ecarts} collection(s) incomplète(s)`); process.exit(1); }
  console.log(`✅ Sauvegarde du ${manifeste.date} (base « ${manifeste.base} ») restaurée dans « ${db.databaseName} »`);
}

restaurer().catch(e => {
  console.error('❌ Restauration interrompue :', String(e.message).replace(/mongodb(\+srv)?:\/\/[^@]+@/g, 'mongodb$1://***@'));
  process.exit(1);
});
