const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  formule: {
    type: String,
    required: true // Ex: "AHI ÉQUILIBRÉ"
  },
  total: {
    type: Number,
    required: true // Ex: 22500
  },
  statut: {
    type: String,
    enum: ['En attente', 'Livré'],
    default: 'En attente'
  },
  facture_url: {
    type: String
  }
}, {
  timestamps: true // Génère automatiquement createdAt (qui servira de date) et updatedAt
});

module.exports = mongoose.model('Order', orderSchema);