const User = require('../models/user');
const Order = require('../models/order');

// Périmètre d'un gestionnaire relié à une fiche livreur (D-17 : DAVID ne voit que les clients de ses livraisons).
// Il voit ses commandes et celles qui restent à planifier (sans livreur) ; les autres clients lui sont masqués.
const PLANIFIABLES = ['Confirmée', 'En préparation'];

// Fiche livreur du compte connecté, ou null (aucune restriction)
async function livreurDuCompte(req) {
  if (req.user.role !== 'gestionnaire') return null;
  if (req.user.livreurId !== undefined) return req.user.livreurId;
  const compte = await User.findById(req.user.id).select('livreurId').lean();
  req.user.livreurId = compte?.livreurId || null;
  return req.user.livreurId;
}

// Filtre des commandes visibles par ce livreur
function filtreCommandesLivreur(livreurId) {
  return { $or: [{ livreurId }, { livreurId: null, statut: { $in: PLANIFIABLES } }] };
}

// Clients visibles par ce livreur : ceux de ses commandes (livrées, planifiées ou à planifier)
async function clientsDuLivreur(livreurId) {
  return Order.distinct('userId', { deletedAt: null, ...filtreCommandesLivreur(livreurId) });
}

module.exports = { livreurDuCompte, filtreCommandesLivreur, clientsDuLivreur };
