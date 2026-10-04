const Order = require('../models/order');

/**
 * Génère la prochaine référence de commande incrémentale (ex : CMD-001).
 * Partagée entre les commandes créées par l'admin et celles passées par les clients.
 */
async function genererReferenceCommande() {
  const totalOrdersCount = await Order.countDocuments();
  return `CMD-${String(totalOrdersCount + 1).padStart(3, '0')}`;
}

module.exports = { genererReferenceCommande };
