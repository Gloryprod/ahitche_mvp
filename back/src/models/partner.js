const mongoose = require('mongoose');

// Prestataires d'Ahitché : fournisseurs grossistes, livreurs et autres (nutritionniste, emballage…).
// Référencé par les lots de stock, les bons de commande, les dépenses et les tournées de livraison.
const TYPES_PRESTATAIRE = ['Fournisseur', 'Livreur', 'Autre'];
const MODES_PAIEMENT_PRESTATAIRE = ['Mobile Money', 'Espèces', 'Virement', 'Chèque'];

const partnerSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  type: { type: String, enum: TYPES_PRESTATAIRE, required: true },
  telephone: { type: String, trim: true, default: '' }, // WhatsApp de préférence
  quartier: { type: String, trim: true, default: '' },
  ifuRccm: { type: String, trim: true, default: '' }, // Facultatif
  modePaiement: { type: String, enum: MODES_PAIEMENT_PRESTATAIRE, default: 'Mobile Money' },
  notes: { type: String, trim: true, default: '' },
  actif: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Partner', partnerSchema);
module.exports.TYPES_PRESTATAIRE = TYPES_PRESTATAIRE;
module.exports.MODES_PAIEMENT_PRESTATAIRE = MODES_PAIEMENT_PRESTATAIRE;
