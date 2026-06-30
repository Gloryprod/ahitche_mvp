const mongoose = require('mongoose');

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
    enum: ['Mobile Money', 'Espèces', 'Acompte'],
    default: 'Mobile Money'
  },
  notes: {
    type: String,
    default: ''
  },
  statut: {
    type: String,
    enum: ['En attente', 'Livré'],
    default: 'En attente'
  },
  facture_url: {
    type: String
  },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true // Génère automatiquement createdAt (qui servira de date) et updatedAt
});

module.exports = mongoose.model('Order', orderSchema);