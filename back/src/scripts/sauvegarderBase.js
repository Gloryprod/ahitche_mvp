// Sauvegarde complète d'une base MongoDB : un fichier par collection (JSON étendu, une ligne par document, compressé),
// les index et un manifeste (nombre de documents), dans un dossier daté. Restauration : restaurerBase.js.
// Usage : MONGO_URI=<adresse, lecture seule suffit> node src/scripts/sauvegarderBase.js [dossier parent]
//   Dossier parent par défaut : ../docs-internes/sauvegardes (exclu de Git).
// Les sauvegardes contiennent des données personnelles : à garder en lieu sûr, jamais dans le dépôt.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
// Pilote MongoDB et EJSON fournis par Mongoose (dépendance du projet)
const { mongo: { MongoClient, BSON: { EJSON } } } = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function sauvegarder() {
  const parent = path.resolve(process.argv[2] || path.join(__dirname, '../../../docs-internes/sauvegardes'));
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();
  const horodatage = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dossier = path.join(parent, `${db.databaseName}-${horodatage}`);
  fs.mkdirSync(dossier, { recursive: true });

  const manifeste = { base: db.databaseName, date: new Date().toISOString(), collections: {} };
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.')).sort();
  for (const nom of collections) {
    const collection = db.collection(nom);
    let nombre = 0;
    const lignes = Readable.from((async function* () {
      for await (const doc of collection.find({}, { batchSize: 500 })) { nombre++; yield EJSON.stringify(doc, { relaxed: false }) + '\n'; }
    })());
    await pipeline(lignes, zlib.createGzip(), fs.createWriteStream(path.join(dossier, `${nom}.jsonl.gz`)));
    const index = (await collection.indexes()).filter(i => i.name !== '_id_');
    manifeste.collections[nom] = { documents: nombre, index };
    console.log(`  ✔ ${nom} : ${nombre} document(s)`);
  }
  fs.writeFileSync(path.join(dossier, 'manifeste.json'), JSON.stringify(manifeste, null, 2));
  await client.close();
  console.log(`✅ Sauvegarde de « ${db.databaseName} » : ${collections.length} collection(s) dans ${dossier}`);
}

sauvegarder().catch(e => {
  console.error('❌ Sauvegarde interrompue :', String(e.message).replace(/mongodb(\+srv)?:\/\/[^@]+@/g, 'mongodb$1://***@'));
  process.exit(1);
});
