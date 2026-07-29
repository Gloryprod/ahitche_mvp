const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  numeroBon: { type: String, required: true, unique: true }, // Ex: BC-2026-001
  fournisseur: { 
    type: String, 
    required: true, 
    enum: ['ETS EUROHI & FILS', 'AHOUANDJO DAVID', 'Hananim Distribution', 'Autre'] 
  },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantiteCommandee: { type: Number, required: true },
    prixUnitairePrevu: { type: Number, required: true }
  }],
  statut: { 
    type: String, 
    enum: ['En attente', 'Reçu partiellement', 'Reçu', 'Annulé'], 
    default: 'En attente' 
  },
  dateEmission: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null}
}, { timestamps: true });   

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);