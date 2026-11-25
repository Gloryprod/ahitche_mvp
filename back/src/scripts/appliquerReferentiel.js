// Applique au catalogue les changements d'une version du référentiel des packs. Les valeurs viennent d'un fichier CSV
// rangé dans docs-internes/ (jamais dans le code).
// Usage : node src/scripts/appliquerReferentiel.js <fichier.csv> [--appliquer]
//   Sans --appliquer : simulation (transaction annulée) et rapport des changements.
// Une ligne par produit à créer ou à modifier ; les produits absents du fichier ne sont pas touchés.
// Colonnes : reference;produit;type;unite;prix_unitaire_fcfa;quantite_essentiel;quantite_equilibre;quantite_confort;
//            quantite_reserve;quantite_fraicheur;categorie;conversion
//  - Le produit est reconnu par son nom, sinon par sa référence (nom identique exigé) ; il est créé s'il n'existe pas,
//    avec la catégorie du même nom. Reconnaître par le nom permet d'échanger deux références (ex. P09 et V19) : chaque
//    produit garde ses lots et son historique.
//  - Type « Fixe » (base fixe) ou « Variable » (extra). Quantités par pack vides ou « — » : absent du pack ;
//    « = » : quantité actuelle gardée (ex. prix seul changé, ou quantité non chiffrée dans le référentiel).
//  - Prix vide : prix actuel gardé (à la création : prix à renseigner).
//  - Unité changée seulement avec « conversion » = nombre de nouvelles unités dans une ancienne (ex. 5 pour kg ->
//    sachet de 200 g) : lots, mouvements, manques et lignes de bons convertis (quantités × N, prix ÷ N), seuil d'alerte
//    et prix VIP aussi. Un produit déjà dans la nouvelle unité n'est pas reconverti : le script peut être relancé.
// Toute incohérence (unité changée sans conversion, nom différent, référence déjà prise…) arrête tout : rien n'est
// écrit. Chaque produit modifié ou créé est journalisé.
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/product');
const Category = require('../models/category');
const User = require('../models/user');
const PurchaseOrder = require('../models/purchaseOrder');
const { LotStockFifo, MouvementStock, ManqueStock } = require('../models/stock');
const { lireCsv } = require('../utils/csv');
const { normaliser, lireNombre } = require('../utils/texte');
const { journaliser } = require('../services/journalService');

dotenv.config();

const { PACKS } = Product;
const COLONNES = ['reference', 'produit', 'type', 'unite', 'prix_unitaire_fcfa', ...PACKS.map(p => `quantite_${p}`), 'categorie', 'conversion'];
const TYPES = { 'fixe': 'base fixe', 'base fixe': 'base fixe', 'variable': 'extra', 'extra': 'extra' };
const ABREGES = { essentiel: 'Ess', equilibre: 'Équ', confort: 'Conf', reserve: 'Rés', fraicheur: 'Fra' };
const vide = (v) => v === '' || v === '—' || v === '-';
const arrondi = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const quantitesTexte = (q) => PACKS.map(p => `${ABREGES[p]} ${q[p] ?? '—'}`).join(' · ');

function lireFichier(chemin) {
  const [entete = [], ...lignes] = lireCsv(fs.readFileSync(chemin, 'utf8'));
  const cles = entete.map(k => k.trim().toLowerCase());
  const manquantes = COLONNES.filter(c => !cles.includes(c));
  if (manquantes.length) throw new Error(`Colonnes manquantes : ${manquantes.join(', ')}`);
  const erreurs = [];
  const nombre = (v, libelle, n) => {
    if (vide(v)) return null;
    const x = lireNombre(v);
    if (!Number.isFinite(x) || x < 0) { erreurs.push(`Ligne ${n} : ${libelle} illisible (« ${v} »)`); return null; }
    return x;
  };
  const lus = lignes.map((cellules, i) => {
    const n = i + 2;
    const l = Object.fromEntries(cles.map((k, j) => [k, (cellules[j] ?? '').trim()]));
    const type = TYPES[normaliser(l.type)];
    if (!/^[PV]\d{2}$/.test(l.reference)) erreurs.push(`Ligne ${n} : référence « ${l.reference} » invalide (P01, V19…)`);
    if (!l.produit) erreurs.push(`Ligne ${n} : nom du produit manquant`);
    if (!type) erreurs.push(`Ligne ${n} : type « ${l.type} » inconnu (Fixe ou Variable)`);
    else if ((type === 'base fixe') !== l.reference.startsWith('P')) erreurs.push(`Ligne ${n} : la référence ${l.reference} ne correspond pas au type « ${l.type} »`);
    if (!l.unite) erreurs.push(`Ligne ${n} : unité manquante`);
    // undefined : « = », quantité actuelle gardée
    const quantites = Object.fromEntries(PACKS.map(p => [p, l[`quantite_${p}`] === '=' ? undefined : nombre(l[`quantite_${p}`], `quantité ${p}`, n)]));
    if (type === 'extra' && PACKS.some(p => quantites[p] !== null)) erreurs.push(`Ligne ${n} : un produit variable n'a pas de quantité par pack`);
    const conversion = nombre(l.conversion, 'conversion', n);
    const prix = nombre(l.prix_unitaire_fcfa, 'prix', n);
    if (conversion === 0) erreurs.push(`Ligne ${n} : conversion à 0`);
    // Sinon l'ancien prix (au kilo, par exemple) resterait sur la nouvelle unité
    if (conversion && prix === null) erreurs.push(`Ligne ${n} : une conversion exige le prix de la nouvelle unité`);
    return { n, reference: l.reference, nom: l.produit, type, unite: l.unite, prix, quantites, categorie: l.categorie, conversion };
  });
  for (const [cle, libelle] of [['reference', 'Référence'], ['nom', 'Produit']]) {
    const vus = new Map();
    for (const l of lus) {
      const k = cle === 'nom' ? normaliser(l.nom) : l.reference;
      if (vus.has(k)) erreurs.push(`${libelle} « ${l[cle]} » en double (lignes ${vus.get(k)} et ${l.n})`);
      else vus.set(k, l.n);
    }
  }
  if (!lus.length) erreurs.push('Aucune ligne dans le fichier');
  if (erreurs.length) throw new Error(`Fichier à corriger :\n  ${erreurs.join('\n  ')}`);
  return lus;
}

// Pour chaque ligne : produit visé (ou création) et changements ; toutes les incohérences sont relevées d'un coup
async function preparer(lignes, s) {
  const produits = await Product.find({ deletedAt: null }).session(s);
  const parNom = new Map(), parRef = new Map();
  for (const p of produits) {
    const k = normaliser(p.name);
    parNom.set(k, parNom.has(k) ? 'double' : p);
    if (p.reference) parRef.set(p.reference, p);
  }
  const erreurs = [], plan = [], cibles = new Set();
  for (const l of lignes) {
    const etiquette = `${l.reference} « ${l.nom} »`;
    let p = parNom.get(normaliser(l.nom));
    if (p === 'double') { erreurs.push(`${etiquette} : plusieurs produits portent ce nom en base`); continue; }
    if (!p && parRef.has(l.reference)) {
      erreurs.push(`${etiquette} : la référence ${l.reference} est « ${parRef.get(l.reference).name} » en base (nom différent : corrige le fichier ou le nom dans l'admin)`);
      continue;
    }
    if (p && cibles.has(String(p._id))) { erreurs.push(`${etiquette} : produit déjà visé par une autre ligne`); continue; }
    if (p) cibles.add(String(p._id));
    plan.push({ l, p, etiquette });
  }
  for (const { l, etiquette } of plan) {
    const occupant = parRef.get(l.reference);
    if (occupant && !cibles.has(String(occupant._id))) erreurs.push(`${etiquette} : référence ${l.reference} déjà prise par « ${occupant.name} », absent du fichier`);
  }

  for (const item of plan) {
    const { l, p, etiquette } = item;
    item.changements = [];
    if (!p) continue;
    const maj = {};
    const noter = (texte, champ, valeur) => { item.changements.push(texte); if (champ) maj[champ] = valeur; };
    if (p.reference !== l.reference) noter(`référence ${p.reference ?? 'vide'} → ${l.reference}`, 'reference', l.reference);
    if (p.type !== l.type) noter(`type ${p.type} → ${l.type}`, 'type', l.type);
    if (normaliser(p.unit) !== normaliser(l.unite)) {
      if (!l.conversion) erreurs.push(`${etiquette} : unité « ${p.unit} » en base, « ${l.unite} » dans le fichier, sans conversion`);
      else { item.facteur = l.conversion; noter(`unité ${p.unit} → ${l.unite} (×${l.conversion})`, 'unit', l.unite); }
    } else if (p.unit !== l.unite) noter(`libellé de l'unité « ${p.unit} » → « ${l.unite} »`, 'unit', l.unite);
    if (l.prix !== null && p.priceUnit !== l.prix) noter(`prix ${p.priceUnit ?? 'vide'} → ${l.prix}`, 'priceUnit', l.prix);
    const avant = Object.fromEntries(PACKS.map(k => [k, p.quantites?.[k] ?? null]));
    const quantites = Object.fromEntries(PACKS.map(k => [k, l.quantites[k] === undefined ? avant[k] : l.quantites[k]]));
    if (PACKS.some(k => avant[k] !== quantites[k])) noter(`quantités ${quantitesTexte(avant)} → ${quantitesTexte(quantites)}`, 'quantites', quantites);
    if (l.type === 'base fixe' && p.cetteSemaine) noter('retiré de « Disponible cette semaine »', 'cetteSemaine', false);
    if (item.facteur) {
      const f = item.facteur;
      if (p.seuilAlerte != null) noter(`seuil d'alerte ${p.seuilAlerte} → ${arrondi(p.seuilAlerte * f, 3)}`, 'seuilAlerte', arrondi(p.seuilAlerte * f, 3));
      if (p.prixVip != null) noter(`prix VIP : ${p.prixVip} → ${Math.round(p.prixVip / f)}`, 'prixVip', Math.round(p.prixVip / f));
      if (p.baseQuantity != null) maj.baseQuantity = arrondi(p.baseQuantity * f, 3);
    }
    item.maj = maj;
  }
  return { plan, erreurs };
}

// Lots, mouvements, manques et lignes de bons du produit dans la nouvelle unité (quantités × f, prix ÷ f)
async function convertir(id, f, s) {
  const fois = (x) => ({ $cond: [{ $isNumber: x }, { $round: [{ $multiply: [x, f] }, 3] }, x] });
  const divise = (x) => ({ $cond: [{ $isNumber: x }, { $round: [{ $divide: [x, f] }, 2] }, x] });
  const surLignes = (tableau, champsFois, champsDivise = []) => ({
    $cond: [{ $isArray: `$${tableau}` }, {
      $map: {
        input: `$${tableau}`, as: 'x',
        in: {
          $cond: [{ $eq: ['$$x.productId', id] }, {
            $mergeObjects: ['$$x', Object.fromEntries([
              ...champsFois.map(c => [c, fois(`$$x.${c}`)]), ...champsDivise.map(c => [c, divise(`$$x.${c}`)])
            ])]
          }, '$$x']
        }
      }
    }, `$${tableau}`]
  });
  const lots = await LotStockFifo.collection.updateMany({ product: id }, [{ $set: {
    quantiteInitiale: fois('$quantiteInitiale'), quantiteRestante: fois('$quantiteRestante'), prixAchatUnitaire: divise('$prixAchatUnitaire')
  } }], { session: s });
  const mouvements = await MouvementStock.collection.updateMany({ product: id }, [{ $set: { quantite: fois('$quantite') } }], { session: s });
  const manques = await ManqueStock.collection.updateMany({ product: id }, [{ $set: {
    quantiteInitiale: fois('$quantiteInitiale'), quantiteRestante: fois('$quantiteRestante'),
    couts: { $cond: [{ $isArray: '$couts' }, { $map: { input: '$couts', as: 'c', in: { $mergeObjects: ['$$c', { quantite: fois('$$c.quantite') }] } } }, '$couts'] }
  } }], { session: s });
  const bons = await PurchaseOrder.collection.updateMany(
    { $or: [{ 'lignes.productId': id }, { 'items.productId': id }] },
    [{ $set: { lignes: surLignes('lignes', ['quantite', 'quantiteRecue']), items: surLignes('items', ['quantiteCommandee'], ['prixUnitairePrevu']) } }],
    { session: s }
  );
  return `${lots.modifiedCount} lot(s), ${mouvements.modifiedCount} mouvement(s), ${manques.modifiedCount} manque(s), ${bons.modifiedCount} bon(s) convertis`;
}

const champsJournal = (p) => ({
  reference: p.reference, type: p.type, unit: p.unit, priceUnit: p.priceUnit ?? null, prixVip: p.prixVip ?? null,
  quantites: Object.fromEntries(PACKS.map(k => [k, p.quantites?.[k] ?? null])), seuilAlerte: p.seuilAlerte ?? null, cetteSemaine: !!p.cetteSemaine
});

async function appliquer(plan, req, s) {
  const rapport = [];
  const categories = await Category.find({ deletedAt: null }).session(s);
  // Références provisoires d'abord : deux produits peuvent échanger leurs références sans heurter l'index unique
  for (const { p, maj } of plan) {
    if (p && maj.reference) await Product.updateOne({ _id: p._id }, { $set: { reference: `TMP-${p._id}` } }, { session: s });
  }
  for (const item of plan) {
    const { l, p, maj, changements, etiquette } = item;
    if (p) {
      if (!changements.length) continue;
      if (item.facteur) changements.push(await convertir(p._id, item.facteur, s));
      const avant = champsJournal(p);
      const apres = champsJournal({ ...p.toObject(), ...maj });
      await Product.updateOne({ _id: p._id }, { $set: maj }, { session: s, runValidators: true });
      const resume = `Produit ${l.reference} · ${p.name} (référentiel) : ${changements.join(' ; ')}`;
      await journaliser(req, { action: 'Modification', entite: 'Produit', entiteId: p._id, resume, avant, apres }, s);
      rapport.push(`${etiquette} : ${changements.join(' ; ')}`);
      continue;
    }
    const categorie = l.categorie ? categories.find(c => normaliser(c.name) === normaliser(l.categorie)) : null;
    const [cree] = await Product.create([{
      reference: l.reference, name: l.nom, type: l.type, unit: l.unite, priceUnit: l.prix,
      quantites: Object.fromEntries(PACKS.map(k => [k, l.quantites[k] ?? null])), category: categorie?._id ?? null
    }], { session: s });
    const details = [l.type, l.unite, `prix ${l.prix ?? 'à renseigner'}`, categorie ? `catégorie ${categorie.name}` : null].filter(Boolean).join(', ');
    await journaliser(req, { action: 'Création', entite: 'Produit', entiteId: cree._id, resume: `Produit ${l.reference} · ${l.nom} créé (référentiel : ${details})` }, s);
    rapport.push(`${etiquette} : créé (${details})${l.categorie && !categorie ? ` ; catégorie « ${l.categorie} » introuvable, laissée vide` : ''}`);
  }
  return rapport;
}

async function executer() {
  const fichier = process.argv.slice(2).find(a => !a.startsWith('--'));
  const enregistrer = process.argv.includes('--appliquer');
  if (!fichier) { console.error('Usage : node src/scripts/appliquerReferentiel.js <fichier.csv> [--appliquer]'); process.exit(1); }
  let lignes;
  try { lignes = lireFichier(fichier); } catch (error) { console.error(`❌ ${error.message}`); process.exitCode = 1; return; }
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const session = await mongoose.startSession();
  let rapport = null;
  try {
    session.startTransaction();
    const porteur = await User.findOne({ adminPrincipal: true }).session(session);
    if (!porteur) throw new Error('aucun admin principal en base (journal impossible)');
    const { plan, erreurs } = await preparer(lignes, session);
    if (erreurs.length) throw new Error(`le fichier ne colle pas avec la base :\n  ${erreurs.join('\n  ')}`);
    rapport = await appliquer(plan, { user: { id: porteur._id, role: 'admin' } }, session);
    if (enregistrer) await session.commitTransaction(); else await session.abortTransaction();
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error(`❌ Arrêt, rien n'a été enregistré : ${error.message}`);
    process.exitCode = 1;
    rapport = null;
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
  if (!rapport) return;
  console.log(enregistrer ? '✅ RÉFÉRENTIEL APPLIQUÉ' : '🔎 SIMULATION (rien n\'a été enregistré)');
  console.log(rapport.length ? rapport.map(r => `  ${r}`).join('\n') : '  Aucun changement : le catalogue suit déjà le fichier.');
}

executer();
