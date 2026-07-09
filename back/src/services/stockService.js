const { LotStockFifo, MouvementStock } = require('../models/stock');

/**
 * Consomme la quantité d'un produit en suivant la méthode FIFO
 * @param {String} productId - L'ID du produit à sortir
 * @param {Number} quantiteA_Sortir - La quantité totale demandée
 * @param {String} motifSortie - La raison (ex: "Vente Pack Essentiel #1024")
 * @param {Object} [session] - Session Mongoose optionnelle pour gérer les transactions
 */
async function consommerStockFIFO(productId, quantiteA_Sortir, motifSortie, session = null) {
  let resteA_Prelever = quantiteA_Sortir;

  // 1. Récupérer les lots actifs disponibles pour ce produit, du plus ANCIEN au plus RÉCENT
  // On exclut les lots supprimés logiquement (deletedAt: null) et ceux déjà vides
  const lotsDisponibles = await LotStockFifo.find({
    product: productId,
    quantiteRestante: { $gt: 0 },
    deletedAt: null
  })
  .sort({ dateReception: 1, createdAt: 1 }) // Tri chronologique croissant (FIFO)
  .session(session); // Support des transactions si nécessaire

  // 2. Parcourir les lots pour prélever la quantité
  for (const lot of lotsDisponibles) {
    if (resteA_Prelever <= 0) break; // Quantité entièrement prélevée, on s'arrête

    let quantitePrelevee = 0;

    if (lot.quantiteRestante >= resteA_Prelever) {
      // Cas A : Le lot a assez de stock pour couvrir tout le reste de la demande
      quantitePrelevee = resteA_Prelever;
      lot.quantiteRestante -= resteA_Prelever;
      resteA_Prelever = 0;
    } else {
      // Cas B : Le lot est insuffisant, on prend tout ce qui reste dedans
      quantitePrelevee = lot.quantiteRestante;
      resteA_Prelever -= lot.quantiteRestante;
      lot.quantiteRestante = 0;
    }

    // Sauvegarder les changements sur le lot
    await lot.save({ session });

    // Enregistrer le mouvement de stock pour ce lot précis (traçabilité complète)
    await MouvementStock.create([{
      product: productId,
      lotId: lot._id,
      type: 'sortie',
      quantite: quantitePrelevee,
      motif: `${motifSortie} (Prélevé sur le Lot ${lot.numeroLot})`
    }], { session });
  }

  // 3. Si après avoir parcouru tous les lots, il reste de la quantité à prélever...
  // C'est qu'il y a une rupture de stock !
  if (resteA_Prelever > 0) {
    throw new Error(`Stock insuffisant. Manque ${resteA_Prelever} unités pour finaliser l'opération.`);
  }

  return true;
}

module.exports = {
  consommerStockFIFO
};