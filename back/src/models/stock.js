const mongoose = require('mongoose');

// 1. Définition de la fiche pour UN LOT physique
const lotStockFifoSchema = new mongoose.Schema({
  numeroLot: { 
    type: String, 
    required: true, 
    trim: true 
  }, // Ex: "LOT-RIZ-20260708-01"
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  }, // Le produit concerné
  quantiteInitiale: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Ce qu'on a acheté au début
  quantiteRestante: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Ce qu'il reste dans l'entrepôt actuellement
  prixAchatUnitaire: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Prix d'achat chez le grossiste en FCFA
  dateReception: { 
    type: Date, 
    default: Date.now, 
    required: true 
  }, // Très important pour le FIFO (savoir quel lot est le plus vieux)
  fournisseur: { 
    type: String, 
    required: true, 
    enum: ['ETS EUROHI & FILS', 'AHOUANDJO DAVID', 'Hananim Distribution', 'Autre'] 
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Optimisation pour que la base de données trie très vite par date pour le FIFO
lotStockFifoSchema.index(
  { product: 1, dateReception: 1, quantiteRestante: 1 },
  { numeroLot: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { deletedAt: null } 
  }
);


// 2. Définition de la fiche pour HISTORIQUE (Le journal des mouvements)
const mvtStockSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  lotId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'LotStockFifo', 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['entree', 'sortie', 'correction_positive', 'correction_negative'], 
    required: true 
  },
  quantite: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  motif: { 
    type: String, 
    trim: true 
  }, // Ex: "Réception bon de commande #12"
  responsable: { 
    type: String, 
    default: 'Gestionnaire Stock' 
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

const LotStockFifo = mongoose.model('LotStockFifo', lotStockFifoSchema);
const MouvementStock = mongoose.model('MouvementStock', mvtStockSchema);

module.exports = { LotStockFifo, MouvementStock };