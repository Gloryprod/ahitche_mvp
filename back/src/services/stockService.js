const { LotStockFifo, MouvementStock } = require('../models/stock');

// Lots d'un produit dans l'ordre FIFO : du plus ancien au plus récent ; un lot sans date de réception
// consignée passe après les lots datés. Les lots sans quantité (à compter) et les lots vides sont exclus.
async function lotsFifo(productId, session = null) {
  const lots = await LotStockFifo.find({ product: productId, quantiteRestante: { $gt: 0 }, deletedAt: null })
    .sort({ dateReception: 1, createdAt: 1 })
    .session(session);
  return [...lots.filter(l => l.dateReception), ...lots.filter(l => !l.dateReception)];
}

const arrondi3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Consomme la quantité d'un produit en suivant la méthode FIFO
 * @param {String} productId - L'ID du produit à sortir
 * @param {Number} quantiteA_Sortir - La quantité totale demandée
 * @param {String} motifSortie - La raison (ex: "Vente Pack Essentiel #1024")
 * @param {Object} [session] - Session Mongoose optionnelle pour gérer les transactions
 * @param {Object} [options] - { type: 'sortie' | 'essai' | 'transformation_sortie', transformationId, responsable }
 * @returns {{ cout: number|null, prelevements: Array }} coût d'achat des quantités prélevées (null si un lot n'a pas de prix)
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

    if (cout !== null) cout = lot.prixAchatUnitaire === null ? null : cout + quantitePrelevee * lot.prixAchatUnitaire;
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
  lotsFifo
};
