const mongoose = require('mongoose');
const Partner = require('../models/partner');

/**
 * Retrouve la fiche d'un fournisseur actif à partir de son identifiant.
 * Renvoie null si l'identifiant est invalide ou ne correspond à aucun fournisseur actif.
 */
async function trouverFournisseur(fournisseurId) {
  if (!fournisseurId || !mongoose.isValidObjectId(fournisseurId)) return null;
  return Partner.findOne({ _id: fournisseurId, type: 'Fournisseur', actif: true, deletedAt: null });
}

module.exports = { trouverFournisseur };
