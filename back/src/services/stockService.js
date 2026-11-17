const { LotStockFifo, MouvementStock, ManqueStock } = require('../models/stock');
const User = require('../models/user');
const { echapperRegex } = require('../utils/texte');

// Nom de la personne connectée, consigné comme responsable des mouvements de stock
async function nomResponsable(req) {
  const u = await User.findById(req.user.id).select('username');
  return u?.username || req.user.role || 'Équipe';
}

// Numéro de lot généré : LOT-<référence produit>-AAAAMMJJ-NN (Q 6.4) ; null si le produit n'a pas de référence.
// Les lots archivés comptent aussi : un numéro n'est jamais réutilisé. Dans une transaction, passer la session
// (les lots déjà créés dans la même transaction sont alors vus).
async function genererNumeroLot(produit, date, session = null) {
  if (!produit.reference) return null;
  // Jour à l'heure du Bénin (une date « AAAA-MM-JJ » reste ce jour-là)
  const jour = new Date(date || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' }).replace(/-/g, '');
  const prefixe = `LOT-${produit.reference}-${jour}-`;
  const existants = await LotStockFifo.find({ numeroLot: { $regex: '^' + echapperRegex(prefixe) } }).select('numeroLot').session(session);
  const max = existants.reduce((m, l) => Math.max(m, parseInt(l.numeroLot.slice(prefixe.length), 10) || 0), 0);
  return prefixe + String(max + 1).padStart(2, '0');
}

// Lots d'un produit dans l'ordre FIFO : du plus ancien au plus récent ; un lot sans date de réception
// consignée passe après les lots datés. Les lots sans quantité (à compter) et les lots vides sont exclus.
async function lotsFifo(productId, session = null) {
  const lots = await LotStockFifo.find({ product: productId, quantiteRestante: { $gt: 0 }, deletedAt: null })
    .sort({ dateReception: 1, createdAt: 1 })
    .session(session);
  return [...lots.filter(l => l.dateReception), ...lots.filter(l => !l.dateReception)];
}

const arrondi3 = (n) => Math.round(n * 1000) / 1000;

// Coût d'achat d'une quantité prise sur un lot, comme la valeur d'inventaire : au prorata de la valeur facturée
// quand elle est connue (valeurFcfa × quantité ÷ quantité initiale), sinon quantité × prix d'achat ; null sans prix.
// Prendre tout le lot coûte donc exactement sa valeur facturée (le prix unitaire, arrondi au centime, ne l'est pas).
function coutPrelevement(lot, quantite) {
  if (lot.valeurFcfa !== null && lot.valeurFcfa !== undefined && lot.quantiteInitiale > 0) {
    return (lot.valeurFcfa * quantite) / lot.quantiteInitiale;
  }
  return lot.prixAchatUnitaire === null || lot.prixAchatUnitaire === undefined ? null : quantite * lot.prixAchatUnitaire;
}

/**
 * Consomme la quantité d'un produit en suivant la méthode FIFO
 * @param {String} productId - L'ID du produit à sortir
 * @param {Number} quantiteA_Sortir - La quantité totale demandée
 * @param {String} motifSortie - La raison (ex: "Vente Pack Essentiel #1024")
 * @param {Object} [session] - Session Mongoose optionnelle pour gérer les transactions
 * @param {Object} [options] - { type: 'sortie' | 'essai' | 'transformation_sortie', transformationId, responsable }
 * @returns {{ cout: number|null, prelevements: Array }} coût d'achat des quantités prélevées, au prorata de la valeur
 *   facturée des lots (null si un lot n'a ni valeur ni prix)
 */
async function consommerStockFIFO(productId, quantiteA_Sortir, motifSortie, session = null, options = {}) {
  const { type = 'sortie', transformationId = null, responsable } = options;
  let resteA_Prelever = quantiteA_Sortir;
  let cout = 0;
  const prelevements = [];

  for (const lot of await lotsFifo(productId, session)) {
    if (resteA_Prelever <= 0) break; // Quantité entièrement prélevée, on s'arrête

    const quantitePrelevee = Math.min(lot.quantiteRestante, resteA_Prelever);
    lot.quantiteRestante = arrondi3(lot.quantiteRestante - quantitePrelevee);
    resteA_Prelever = arrondi3(resteA_Prelever - quantitePrelevee);
    await lot.save({ session });

    if (cout !== null) {
      const coutLot = coutPrelevement(lot, quantitePrelevee);
      cout = coutLot === null ? null : cout + coutLot;
    }
    prelevements.push({ lotId: lot._id, numeroLot: lot.numeroLot, quantite: quantitePrelevee });

    // Mouvement de stock pour ce lot précis (traçabilité complète)
    await MouvementStock.create([{
      product: productId,
      lotId: lot._id,
      type,
      quantite: quantitePrelevee,
      transformationId,
      motif: `${motifSortie} (Prélevé sur le Lot ${lot.numeroLot})`,
      ...(responsable ? { responsable } : {})
    }], { session });
  }

  // Après tous les lots, il reste de la quantité à prélever : rupture de stock
  if (resteA_Prelever > 0) {
    throw new Error(`Stock insuffisant. Manque ${resteA_Prelever} unités pour finaliser l'opération.`);
  }

  return { cout, prelevements };
}

// Quantité disponible dans les lots d'un produit (lots à compter exclus), arrondie à 3 décimales
async function quantiteEnLots(productId, session = null) {
  return arrondi3((await lotsFifo(productId, session)).reduce((s, l) => s + l.quantiteRestante, 0));
}

// Manques ouverts par produit : Map(productId → quantité restant à combler). Sert au stock net (lots − manques).
async function manquesParProduit(productIds = null) {
  const manques = await ManqueStock.aggregate([
    { $match: { quantiteRestante: { $gt: 0 }, ...(productIds ? { product: { $in: productIds } } : {}) } },
    { $group: { _id: '$product', quantite: { $sum: '$quantiteRestante' } } }
  ]);
  return new Map(manques.map(m => [String(m._id), arrondi3(m.quantite)]));
}

// Livraison avec stock incomplet (validée par l'admin) : la part sans lot devient un manque à combler,
// avec une sortie sans lot pour la traçabilité
async function creerManque(productId, quantite, order, session, { responsable, creePar } = {}) {
  const [manque] = await ManqueStock.create([{
    product: productId, quantiteInitiale: quantite, quantiteRestante: quantite,
    orderId: order._id, reference: order.reference, creePar
  }], { session });
  await MouvementStock.create([{
    product: productId, lotId: null, type: 'sortie', quantite,
    motif: `Livraison de la commande ${order.reference} (sans stock : manque à combler)`,
    ...(responsable ? { responsable } : {})
  }], { session });
  return manque;
}

/**
 * Comble les manques ouverts du produit avec la quantité que le lot vient de recevoir, du plus ancien au plus récent.
 * Appelée après chaque entrée (entrée en stock, comptage, correction positive, production interne, réception de bon),
 * dans la transaction de l'entrée. Retire la quantité du lot (enregistré ici), crée un mouvement par comblement et
 * consigne le coût sur le manque. Un lot à compter (quantité vide) ne comble rien.
 * @returns {Array<{ reference, quantite }>} comblements effectués
 */
async function comblerManques(productId, lot, session, responsable) {
  if (!(lot.quantiteRestante > 0)) return [];
  const manques = await ManqueStock.find({ product: productId, quantiteRestante: { $gt: 0 } })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);
  const comblements = [];
  for (const manque of manques) {
    if (!(lot.quantiteRestante > 0)) break;
    const quantite = arrondi3(Math.min(lot.quantiteRestante, manque.quantiteRestante));
    lot.quantiteRestante = arrondi3(lot.quantiteRestante - quantite);
    manque.quantiteRestante = arrondi3(manque.quantiteRestante - quantite);
    const cout = coutPrelevement(lot, quantite);
    manque.couts.push({ lotId: lot._id, quantite, cout: cout === null ? null : Math.round(cout * 100) / 100 });
    if (manque.quantiteRestante === 0) manque.dateComblement = new Date();
    await manque.save({ session });
    await MouvementStock.create([{
      product: productId, lotId: lot._id, type: 'sortie', quantite,
      motif: `Manque de la livraison ${manque.reference} comblé (Prélevé sur le Lot ${lot.numeroLot})`,
      ...(responsable ? { responsable } : {})
    }], { session });
    comblements.push({ reference: manque.reference, quantite });
  }
  if (comblements.length) await lot.save({ session });
  return comblements;
}

// Fin de phrase du journal et du message : « , dont 3 kg pour combler CMD-001, CMD-004 »
function texteComblements(comblements, unite = '') {
  if (!comblements.length) return '';
  const total = arrondi3(comblements.reduce((s, c) => s + c.quantite, 0));
  return `, dont ${total.toLocaleString('fr-FR')}${unite ? ` ${unite}` : ''} pour combler ${[...new Set(comblements.map(c => c.reference))].join(', ')}`;
}

module.exports = {
  consommerStockFIFO,
  quantiteEnLots,
  manquesParProduit,
  creerManque,
  comblerManques,
  texteComblements,
  lotsFifo,
  genererNumeroLot,
  nomResponsable
};
