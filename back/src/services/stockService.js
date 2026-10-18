const { LotStockFifo, MouvementStock } = require('../models/stock');
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

module.exports = {
  consommerStockFIFO,
  lotsFifo,
  genererNumeroLot,
  nomResponsable
};
