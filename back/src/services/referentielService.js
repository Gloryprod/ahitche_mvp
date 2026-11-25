// Import d'une version du référentiel des packs dans le catalogue : écran Produits de l'admin (coller un tableau,
// aperçu, appliquer ; admin seulement) et script appliquerReferentiel.js. Une ligne par produit à créer ou à modifier ;
// les produits absents du tableau ne sont pas touchés. Aucune valeur du référentiel dans le code.
// Colonnes (ordre libre, sans casse ni accents) : reference et produit obligatoires ; type, unite, prix_unitaire_fcfa,
// quantite_<pack> (un par pack de la base : essentiel, equilibre… et tout pack créé dans l'admin), categorie, conversion facultatives (colonne
// absente : valeur actuelle gardée).
//  - Le produit est reconnu par son nom, sinon par sa référence (nom identique exigé) ; il est créé s'il n'existe pas
//    (unité exigée, catégorie du même nom). Reconnaître par le nom permet d'échanger deux références (ex. P09 et V19) :
//    chaque produit garde ses lots et son historique.
//  - Type déduit de la référence : P.. = base fixe (« Fixe »), V.. = extra (« Variable »), sans quantité par pack.
//  - Quantité vide ou « — » : absent du pack ; « = » : quantité actuelle gardée. Prix vide : prix actuel gardé.
//  - Unité changée seulement avec « conversion » (nouvelles unités dans une ancienne, ex. 5 pour kg -> sachet de
//    200 g) et un prix : lots, mouvements, manques et lignes de bons convertis (quantités × N, prix ÷ N), seuil
//    d'alerte et prix VIP aussi ; jamais deux fois (unité déjà la bonne : rien à convertir).
// Tout ou rien, dans une transaction : une ligne en erreur et rien n'est enregistré ; simulation : transaction
// annulée. Chaque produit modifié ou créé est journalisé, plus une ligne de résumé.
const Product = require('../models/product');
const Category = require('../models/category');
const PurchaseOrder = require('../models/purchaseOrder');
const { LotStockFifo, MouvementStock, ManqueStock } = require('../models/stock');
const { lireTableau } = require('./entreeStockService');
const { normaliser, lireNombre } = require('../utils/texte');
const { journaliser } = require('./journalService');
const { typesPacks } = require('./packService');

const MAX_LIGNES = 200;
const MAX_OCTETS = 100 * 1024;
const cle = (nom) => normaliser(nom).replace(/[\s()]/g, ''); // Sans casse, accents, espaces, « _ » ni parenthèses
const TYPES = { 'fixe': 'base fixe', 'base fixe': 'base fixe', 'variable': 'extra', 'extra': 'extra' };
const ABREGES = { essentiel: 'Ess', equilibre: 'Équ', confort: 'Conf', reserve: 'Rés', fraicheur: 'Fra' };
const abrege = (p) => ABREGES[p] ?? p.charAt(0).toUpperCase() + p.slice(1, 4);
const vide = (v) => v === '' || v === '—' || v === '-';
const arrondi = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const quantitesTexte = (q, packs) => packs.map(p => `${abrege(p)} ${q[p] ?? '—'}`).join(' · ');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Colonnes reconnues pour les packs existants (packService) : quantite_<type> pour chacun ; libellés d'Excel acceptés
// aussi (« Nom du produit », « Prix unitaire (FCFA) », « Essentiel », « Etudiant »…)
function colonnesReconnues(packs) {
  const colonnes = ['reference', 'produit', 'type', 'unite', 'prix_unitaire_fcfa', ...packs.map(p => `quantite_${p}`), 'categorie', 'conversion'];
  const alias = { nomduproduit: 'produit', prix: 'prix_unitaire_fcfa', ...Object.fromEntries(packs.map(p => [p, `quantite_${p}`])) };
  return new Map([...colonnes.map(c => [cle(c), c]), ...Object.entries(alias)]);
}

// En-tête et cellules ; erreur de fichier (sans aperçu) ou lignes lues, chacune avec ses motifs d'erreur
function lireLignes(texte, packs) {
  const COLONNE_PAR_CLE = colonnesReconnues(packs);
  const [entete = [], ...donnees] = lireTableau(texte);
  const colonnes = [];
  for (const nom of entete) {
    const colonne = nom ? COLONNE_PAR_CLE.get(cle(nom)) : null;
    if (nom && !colonne) return { erreur: `En-tête : colonne inconnue « ${nom.slice(0, 40)} ».` };
    if (colonne && colonnes.includes(colonne)) return { erreur: `En-tête : colonne ${colonne} en double.` };
    colonnes.push(colonne);
  }
  const absentes = ['reference', 'produit'].filter(c => !colonnes.includes(c));
  if (absentes.length) return { erreur: `En-tête : colonnes obligatoires absentes : ${absentes.join(', ')}.` };
  if (!donnees.length) return { erreur: 'Aucune ligne sous les en-têtes.' };
  if (donnees.length > MAX_LIGNES) return { erreur: `${MAX_LIGNES} lignes au plus par import (${donnees.length} reçues).` };
  const presente = (c) => colonnes.includes(c);

  const lignes = donnees.map((cellules, i) => {
    const v = Object.fromEntries(colonnes.map((c, j) => [c, String(cellules[j] ?? '').trim()]).filter(([c]) => c));
    const l = { ligne: i + 2, reference: v.reference.slice(0, 20), produit: v.produit.slice(0, 120), statut: null, changements: [], messages: [] };
    const erreur = (m) => l.messages.push(m);
    const nombre = (texte, libelle) => {
      if (vide(texte)) return null;
      const x = lireNombre(texte);
      if (!Number.isFinite(x) || x < 0) { erreur(`${libelle} illisible (« ${texte.slice(0, 20)} »)`); return null; }
      return x;
    };
    if (!/^[PV]\d{2}$/.test(l.reference)) erreur(`Référence « ${l.reference} » invalide (P01, V19…)`);
    if (!l.produit) erreur('Nom du produit manquant');
    l.type = l.reference.startsWith('P') ? 'base fixe' : 'extra';
    if (v.type && !l.messages.length) { // Référence invalide : un seul motif, le type n'est pas comparé
      const type = TYPES[normaliser(v.type)];
      if (!type) erreur(`Type « ${v.type.slice(0, 20)} » inconnu (Fixe ou Variable)`);
      else if (type !== l.type) erreur(`La référence ${l.reference} ne correspond pas au type « ${v.type} »`);
    }
    l.unite = presente('unite') && v.unite ? v.unite.slice(0, 40) : undefined; // undefined : unité actuelle gardée
    l.prix = presente('prix_unitaire_fcfa') ? nombre(v.prix_unitaire_fcfa, 'Prix') : null; // null : prix actuel gardé
    // undefined : « = » ou colonne absente, quantité actuelle gardée ; un produit variable n'est dans aucun pack
    l.quantites = Object.fromEntries(packs.map(p => {
      const c = `quantite_${p}`;
      if (l.type === 'extra') {
        if (presente(c) && !vide(v[c])) erreur("Un produit variable n'a pas de quantité par pack");
        return [p, null];
      }
      return [p, !presente(c) || v[c] === '=' ? undefined : nombre(v[c], `Quantité ${p}`)];
    }));
    l.categorie = (v.categorie ?? '').slice(0, 60);
    l.conversion = presente('conversion') ? nombre(v.conversion, 'Conversion') : null;
    if (l.conversion === 0) erreur('Conversion à 0');
    // Garde-fou : un facteur aberrant multiplierait tout le stock du produit
    if (l.conversion > 1000) erreur('Conversion de plus de 1 000 : vérifie la valeur');
    // Sinon l'ancien prix (au kilo, par exemple) resterait sur la nouvelle unité
    if (l.conversion && l.prix === null) erreur('Une conversion exige le prix de la nouvelle unité');
    return l;
  });
  for (const [champ, libelle] of [['reference', 'Référence'], ['produit', 'Produit']]) {
    const vus = new Map();
    for (const l of lignes) {
      const k = champ === 'produit' ? normaliser(l.produit) : l.reference;
      if (!k) continue;
      if (vus.has(k)) for (const autre of [vus.get(k), l]) autre.messages.push(`${libelle} en double (lignes ${vus.get(k).ligne} et ${l.ligne})`);
      else vus.set(k, l);
    }
  }
  return { lignes };
}

// Produit visé (ou création) et changements de chaque ligne sans erreur de lecture ; motifs ajoutés aux lignes
async function preparer(lignes, packs, s) {
  const produits = await Product.find({ deletedAt: null }).session(s);
  const categories = await Category.find({ deletedAt: null }).session(s);
  const parNom = new Map(), parRef = new Map();
  for (const p of produits) {
    const k = normaliser(p.name);
    parNom.set(k, parNom.has(k) ? 'double' : p);
    if (p.reference) parRef.set(p.reference, p);
  }
  const lisibles = lignes.filter(l => !l.messages.length);
  const cibles = new Set();
  for (const l of lisibles) {
    const p = parNom.get(normaliser(l.produit));
    if (p === 'double') { l.messages.push('Plusieurs produits portent ce nom en base'); continue; }
    if (!p && parRef.has(l.reference)) {
      l.messages.push(`La référence ${l.reference} est « ${parRef.get(l.reference).name} » en base (nom différent : corrige le tableau ou le nom dans l'admin)`);
      continue;
    }
    if (p && cibles.has(String(p._id))) { l.messages.push('Produit déjà visé par une autre ligne'); continue; }
    if (p) cibles.add(String(p._id));
    l.p = p ?? null;
  }
  for (const l of lisibles.filter(x => x.p !== undefined)) {
    const occupant = parRef.get(l.reference);
    if (occupant && !cibles.has(String(occupant._id))) l.messages.push(`Référence ${l.reference} déjà prise par « ${occupant.name} », absent du tableau`);
  }

  for (const l of lisibles.filter(x => x.p !== undefined && !x.messages.length)) {
    const { p } = l;
    if (!p) {
      if (!l.unite) { l.messages.push('Unité manquante pour créer le produit'); continue; }
      l.categorieTrouvee = l.categorie ? categories.find(c => normaliser(c.name) === normaliser(l.categorie)) ?? null : null;
      const details = [l.type, l.unite, `prix ${l.prix ?? 'à renseigner'}`, l.categorieTrouvee ? `catégorie ${l.categorieTrouvee.name}` : null].filter(Boolean).join(', ');
      l.changements.push(`créé (${details})`);
      if (l.categorie && !l.categorieTrouvee) l.changements.push(`catégorie « ${l.categorie} » introuvable, laissée vide`);
      continue;
    }
    const maj = {};
    const noter = (texte, champ, valeur) => { l.changements.push(texte); if (champ) maj[champ] = valeur; };
    if (p.reference !== l.reference) noter(`référence ${p.reference ?? 'vide'} → ${l.reference}`, 'reference', l.reference);
    if (p.type !== l.type) noter(`type ${p.type} → ${l.type}`, 'type', l.type);
    if (l.unite !== undefined && normaliser(p.unit) !== normaliser(l.unite)) {
      if (!l.conversion) { l.messages.push(`Unité « ${p.unit} » en base, « ${l.unite} » dans le tableau, sans conversion`); continue; }
      l.facteur = l.conversion;
      noter(`unité ${p.unit} → ${l.unite} (×${l.conversion})`, 'unit', l.unite);
    } else if (l.unite !== undefined && p.unit !== l.unite) noter(`libellé de l'unité « ${p.unit} » → « ${l.unite} »`, 'unit', l.unite);
    if (l.prix !== null && p.priceUnit !== l.prix) noter(`prix ${p.priceUnit ?? 'vide'} → ${l.prix}`, 'priceUnit', l.prix);
    const avant = Object.fromEntries(packs.map(k => [k, p.quantites?.[k] ?? null]));
    const quantites = Object.fromEntries(packs.map(k => [k, l.quantites[k] === undefined ? avant[k] : l.quantites[k]]));
    if (packs.some(k => avant[k] !== quantites[k])) noter(`quantités ${quantitesTexte(avant, packs)} → ${quantitesTexte(quantites, packs)}`, 'quantites', quantites);
    if (l.type === 'base fixe' && p.cetteSemaine) noter('retiré de « Disponible cette semaine »', 'cetteSemaine', false);
    if (l.facteur) {
      const f = l.facteur;
      if (p.seuilAlerte != null) noter(`seuil d'alerte ${p.seuilAlerte} → ${arrondi(p.seuilAlerte * f, 3)}`, 'seuilAlerte', arrondi(p.seuilAlerte * f, 3));
      if (p.prixVip != null) noter(`prix VIP : ${p.prixVip} → ${Math.round(p.prixVip / f)}`, 'prixVip', Math.round(p.prixVip / f));
      if (p.baseQuantity != null) maj.baseQuantity = arrondi(p.baseQuantity * f, 3);
    }
    l.maj = maj;
  }
  for (const l of lignes) {
    if (l.messages.length) { l.statut = 'erreur'; l.changements = []; }
    else l.statut = !l.p ? 'creation' : l.changements.length ? 'modification' : 'inchange';
  }
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

const champsJournal = (p, packs) => ({
  reference: p.reference, type: p.type, unit: p.unit, priceUnit: p.priceUnit ?? null, prixVip: p.prixVip ?? null,
  quantites: Object.fromEntries(packs.map(k => [k, p.quantites?.[k] ?? null])), seuilAlerte: p.seuilAlerte ?? null, cetteSemaine: !!p.cetteSemaine
});

async function ecrire(lignes, packs, req, s) {
  const aEcrire = lignes.filter(l => l.statut === 'creation' || l.statut === 'modification');
  // Références provisoires d'abord : deux produits peuvent échanger leurs références sans heurter l'index unique
  for (const l of aEcrire) {
    if (l.p && l.maj.reference) await Product.updateOne({ _id: l.p._id }, { $set: { reference: `TMP-${l.p._id}` } }, { session: s });
  }
  for (const l of aEcrire) {
    if (l.p) {
      if (l.facteur) l.changements.push(await convertir(l.p._id, l.facteur, s));
      await Product.updateOne({ _id: l.p._id }, { $set: l.maj }, { session: s, runValidators: true });
      await journaliser(req, {
        action: 'Modification', entite: 'Produit', entiteId: l.p._id,
        resume: `Produit ${l.reference} · ${l.p.name} (référentiel) : ${l.changements.join(' ; ')}`,
        avant: champsJournal(l.p, packs), apres: champsJournal({ ...l.p.toObject(), ...l.maj }, packs)
      }, s);
      continue;
    }
    const [cree] = await Product.create([{
      reference: l.reference, name: l.produit, type: l.type, unit: l.unite, priceUnit: l.prix,
      quantites: Object.fromEntries(packs.map(k => [k, l.quantites[k] ?? null])), category: l.categorieTrouvee?._id ?? null
    }], { session: s });
    await journaliser(req, { action: 'Création', entite: 'Produit', entiteId: cree._id, resume: `Produit ${l.reference} · ${l.produit} ${l.changements.join(' ; ')} (référentiel)` }, s);
  }
}

/**
 * Import d'un tableau du référentiel (texte collé ou fichier). Démarre la transaction de la session ; simulation
 * (appliquer = false) : annulée. Une ligne en erreur : rien n'est enregistré.
 * @returns {{ statut: number, corps: object }} 400 { message } pour une erreur de fichier ; sinon message, resume, lignes
 */
async function importerReferentiel(req, texte, appliquer, session) {
  const packs = await typesPacks(); // Packs de la base : une colonne quantite_<type> par pack
  const lu = lireLignes(texte, packs);
  if (lu.erreur) return { statut: 400, corps: { message: lu.erreur } };
  const { lignes } = lu;
  session.startTransaction();
  await preparer(lignes, packs, session);
  const compte = (statut) => lignes.filter(l => l.statut === statut).length;
  const resume = { lignes: lignes.length, creations: compte('creation'), modifications: compte('modification'), inchanges: compte('inchange'), erreurs: compte('erreur') };
  const corps = (message) => ({
    message, resume,
    lignes: lignes.map(({ ligne, reference, produit, statut, changements, messages }) => ({ ligne, reference, produit, statut, changements, messages }))
  });
  if (resume.erreurs) {
    await session.abortTransaction();
    const message = `${pluriel(resume.erreurs, 'ligne')} à corriger : rien ${appliquer ? "n'a été" : 'ne sera'} enregistré.`;
    return { statut: appliquer ? 400 : 200, corps: corps(message) };
  }
  if (!resume.creations && !resume.modifications) {
    await session.abortTransaction();
    return { statut: 200, corps: corps('Aucun changement : le catalogue suit déjà le tableau.') };
  }
  await ecrire(lignes, packs, req, session);
  const bilan = [resume.modifications && pluriel(resume.modifications, 'modification'), resume.creations && pluriel(resume.creations, 'création')].filter(Boolean).join(', ');
  if (!appliquer) {
    await session.abortTransaction();
    return { statut: 200, corps: corps(`Prêt : ${bilan}.`) };
  }
  await journaliser(req, { action: 'Import', entite: 'Produit', resume: `Import du référentiel : ${bilan}` }, session);
  await session.commitTransaction();
  return { statut: 201, corps: corps(`Référentiel importé : ${bilan}.`) };
}

module.exports = { importerReferentiel, MAX_OCTETS };
