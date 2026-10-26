const OrderProductSnapshot = require('../models/orderProductSnapshot');
const { calculerCompositionPack, typeDepuisSlug } = require('./compositionService');

// Passages de statut autorisés (docs/conception-menu-admin.md, section 1)
const TRANSITIONS = {
  'En attente': ['Confirmée', 'Annulée'],
  'Confirmée': ['En préparation', 'Annulée'],
  'En préparation': ['En livraison', 'Annulée'],
  'En livraison': ['Livrée', 'Échec'],
  'Échec': ['Confirmée', 'Annulée'], // Nouvelle tentative : la commande repasse par la planification
  'Livrée': [],
  'Annulée': []
};

// Un client peut annuler lui-même tant que la préparation n'a pas commencé
const ANNULABLES_PAR_CLIENT = ['En attente', 'Confirmée'];

// "2026-10-05" -> minuit à Cotonou (stocké en UTC)
function dateDuCreneau(jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour))) return null;
  const date = new Date(`${jour}T00:00:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// La compensation automatique d'une livraison en retard (> 24 h) est retirée : la garantie est désormais
// le remplacement à l'identique d'un produit manquant ou abîmé à la livraison suivante (D-08), sans délai promis (D-07).

/**
 * Commande passée par le client (sans détail des produits) : à la confirmation, on lui attribue
 * la composition actuelle de son pack pour la préparation et la sortie de stock.
 * Un achat libre VIP n'est jamais un pack : ses lignes sont enregistrées dès la commande (ou il n'a que des
 * demandes libres, qui ne sortent pas du stock).
 */
async function genererCompositionSiAbsente(commande, session) {
  if (commande.typeCommande === 'achat-libre') return false;
  if (commande.productsSnapshot?.length) return false;

  const composition = await calculerCompositionPack(typeDepuisSlug(commande.formuleSlug));
  const lignes = (composition?.items || []).filter(item => item.quantity > 0);
  if (!lignes.length) return false;

  const snapshots = await OrderProductSnapshot.insertMany(lignes.map(item => ({
    orderId: commande._id,
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.priceUnit,
    totalPrice: item.totalPrice,
    isExtra: false
  })), { session });
  commande.productsSnapshot = snapshots.map(s => s._id);
  return true;
}

module.exports = {
  TRANSITIONS,
  ANNULABLES_PAR_CLIENT,
  dateDuCreneau,
  genererCompositionSiAbsente
};
