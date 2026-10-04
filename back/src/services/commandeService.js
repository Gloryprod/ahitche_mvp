const Order = require('../models/order');
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

// Fin des créneaux, heure du Bénin (UTC+1, pas d'heure d'été) : horaires de livraison 9 h – 18 h
const FIN_CRENEAU_HEURE = { 'Matin': 13, 'Après-midi': 18 };
const DELAI_GARANTIE_MS = 24 * 3600 * 1000;

// "2026-10-05" -> minuit à Cotonou (stocké en UTC)
function dateDuCreneau(jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour))) return null;
  const date = new Date(`${jour}T00:00:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finDuCreneau(creneau) {
  if (!creneau?.date || !FIN_CRENEAU_HEURE[creneau.periode]) return null;
  return new Date(new Date(creneau.date).getTime() + FIN_CRENEAU_HEURE[creneau.periode] * 3600 * 1000);
}

// Garantie Ahitché : plus de 24 h de retard après la fin du créneau confirmé
function estEnRetard(creneau, dateLivraison) {
  const fin = finDuCreneau(creneau);
  return !!fin && dateLivraison.getTime() > fin.getTime() + DELAI_GARANTIE_MS;
}

/**
 * Compensation en attente d'une livraison précédente du même client : elle est remise avec la nouvelle commande.
 * À appeler juste avant d'enregistrer une nouvelle commande.
 */
async function appliquerCompensationEnAttente(nouvelleCommande) {
  const precedente = await Order.findOne({
    userId: nouvelleCommande.userId,
    'compensation.statut': 'À appliquer',
    _id: { $ne: nouvelleCommande._id }
  }).sort({ dateLivraison: 1 });
  if (!precedente) return null;

  precedente.compensation.statut = 'Appliquée';
  precedente.compensation.appliqueeSurCommande = nouvelleCommande._id;
  await precedente.save();

  nouvelleCommande.compensationRecue = {
    depuisCommande: precedente._id,
    reference: precedente.reference,
    motif: precedente.compensation.motif
  };
  return precedente;
}

/**
 * Commande annulée qui portait une compensation : la compensation redevient « À appliquer »
 * pour être remise avec la prochaine commande du client.
 */
async function libererCompensation(commande, session = null) {
  const depuis = commande.compensationRecue?.depuisCommande;
  if (!depuis) return;
  await Order.updateOne(
    { _id: depuis, 'compensation.appliqueeSurCommande': commande._id },
    { $set: { 'compensation.statut': 'À appliquer', 'compensation.appliqueeSurCommande': null } },
    { session }
  );
  commande.compensationRecue = { depuisCommande: null, reference: '', motif: '' };
}

/**
 * Commande passée par le client (sans détail des produits) : à la confirmation, on lui attribue
 * la composition actuelle de son pack pour la préparation et la sortie de stock.
 */
async function genererCompositionSiAbsente(commande, session) {
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
  finDuCreneau,
  estEnRetard,
  appliquerCompensationEnAttente,
  libererCompensation,
  genererCompositionSiAbsente
};
