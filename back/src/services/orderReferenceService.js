const Order = require('../models/order');

/**
 * Génère la prochaine référence de commande incrémentale (ex : CMD-001).
 * Partagée entre les commandes créées par l'admin et celles passées par les clients.
 * Le numéro suit la plus grande référence existante (et non le nombre de commandes, qui produisait des doublons
 * dès qu'une commande n'avait pas de référence) ; un index unique sur la référence bloque tout doublon restant.
 */
async function genererReferenceCommande(session = null) {
  const [resultat] = await Order.aggregate([
    { $match: { reference: { $regex: /^CMD-\d+$/ } } },
    { $group: { _id: null, max: { $max: { $toInt: { $substrCP: ['$reference', 4, 12] } } } } }
  ]).session(session);
  return `CMD-${String((resultat?.max ?? 0) + 1).padStart(3, '0')}`;
}

module.exports = { genererReferenceCommande };
