// models/Expense.js
const mongoose = require('mongoose');

// Deux familles de dépenses (docs/conception-menu-admin.md, Finances) :
//  - Budget : lignes de la convention Next Impact (prévu / réel, USD et FCFA, audit)
//  - Exploitation : achats de stock (créés automatiquement), livraison, compensations, autres
const CATEGORIES_DEPENSE = ['Budget', 'Exploitation'];
const TYPES_EXPLOITATION = ['Achat stock', 'Livraison', 'Compensation', 'Autre'];

const expenseSchema = new mongoose.Schema({
  categorie: {
    type: String,
    enum: CATEGORIES_DEPENSE,
    default: 'Budget'
  },
  referenceLigne: {
    type: String,
    // Ex: '1.1', '4.1', '5.x' : obligatoire pour une dépense du budget de la convention
    required: function () { return this.categorie === 'Budget'; },
    trim: true,
    default: ''
  },
  typeExploitation: {
    type: String,
    enum: [...TYPES_EXPLOITATION, null],
    default: null
  },
  libelle: {
    type: String,
    required: true,
    trim: true
  },
  partenaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner', // Liaison avec la section Prestataires
    required: false
  },
  lotStockId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LotStockFifo', // Dépense créée automatiquement par une entrée de stock
    default: null
  },
  montantPrevuUsd: {
    type: Number,
    required: true,
    default: 0
  },
  montantPrevuFcfa: {
    type: Number,
    required: true,
    default: 0
  },
  montantReelUsd: {
    type: Number,
    default: 0
  },
  montantReelFcfa: {
    type: Number,
    default: 0
  },
  tauxApplique: {
    type: Number,
    required: true,
    default: 571 // Taux initial Convention N°171 ; figé à la création de la dépense
  },
  estEffectue: {
    type: Boolean,
    default: false
  },
  // R10/R11 : Isolation stricte pour l'audit NEXT IMPACT
  estValidePourAudit: {
    type: Boolean,
    default: true,
    required: true
  },
  datePaiement: {
    type: Date
  },
  urlPieceJointe: {
    type: String,
    default: null // Justificatif obligatoire pour passer la dépense en « effectuée »
  },
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.CATEGORIES_DEPENSE = CATEGORIES_DEPENSE;
module.exports.TYPES_EXPLOITATION = TYPES_EXPLOITATION;
