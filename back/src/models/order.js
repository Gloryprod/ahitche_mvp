const mongoose = require('mongoose');

// Cycle de vie d'une commande (docs/conception-menu-admin.md, section 1) :
// En attente -> Confirmée -> En préparation -> En livraison -> Livrée (paiement effectué) ou Échec ; Annulée.
const STATUTS = ['En attente', 'Confirmée', 'En préparation', 'En livraison', 'Livrée', 'Échec', 'Annulée'];
const PERIODES = ['Matin', 'Après-midi'];
const MODES_PAIEMENT = ['Mobile Money', 'Espèces', 'Acompte'];

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reference: {
    type: String,
    required: true,
    unique: true // Ex: CMD-001
  },
  formule: {
    type: String,
    required: true // Ex: "AHI ÉQUILIBRÉ"
  },
  formuleSlug: {
    type: String,
    required: true // Ex: "ahi-equilibre"
  },
  total: {
    type: Number,
    required: true // Ex: 22500
  },
  modePaiement: {
    type: String,
    enum: MODES_PAIEMENT,
    default: 'Mobile Money'
  },
  notes: {
    type: String,
    default: ''
  },
  statut: {
    type: String,
    enum: STATUTS,
    default: 'En attente'
  },
  // Journal des changements de statut (qui, quand)
  historique: [{
    _id: false,
    statut: { type: String, enum: STATUTS },
    date: { type: Date, default: Date.now },
    par: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  facture_url: {
    type: String
  },
  // 🔗 Référence vers le modèle OrderProductSnapshot
  productsSnapshot: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderProductSnapshot'
  }],

  // --- Livraison ---
  zone: { type: String, default: null }, // Code de la zone du client au moment de la planification
  creneau: {
    date: { type: Date, default: null },
    periode: { type: String, enum: [...PERIODES, null], default: null }
  },
  livreurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  coutLivraison: { type: Number, default: 0 }, // Tarif de course de la zone, figé à la livraison
  dateLivraison: { type: Date, default: null },

  // --- Paiement (à la livraison) ---
  paiement: {
    statut: { type: String, enum: ['En attente', 'Payé'], default: 'En attente' },
    reference: { type: String, default: '' }, // Référence de transaction Mobile Money
    note: { type: String, default: '' }, // Obligatoire pour Espèces et Acompte
    date: { type: Date, default: null }
  },

  // --- Garantie : livraison avec plus de 24 h de retard sur le créneau confirmé ---
  enRetard: { type: Boolean, default: false },
  compensation: {
    statut: { type: String, enum: ['Aucune', 'À appliquer', 'Appliquée'], default: 'Aucune' },
    motif: { type: String, default: '' },
    appliqueeSurCommande: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }
  },
  // Compensation d'une commande précédente, à remettre au client avec cette livraison
  compensationRecue: {
    depuisCommande: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    reference: { type: String, default: '' },
    motif: { type: String, default: '' }
  },

  deletedAt: { type: Date, default: null }
}, {
  timestamps: true // Génère automatiquement createdAt (qui servira de date) et updatedAt
});

module.exports = mongoose.model('Order', orderSchema);
module.exports.STATUTS = STATUTS;
module.exports.PERIODES = PERIODES;
module.exports.MODES_PAIEMENT = MODES_PAIEMENT;
