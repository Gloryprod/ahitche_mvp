// models/Expense.js
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  referenceLigne: {
    type: String,
    required: true, // Ex: '1.1', '4.1', '5.x'
    trim: true
  },
  libelle: {
    type: String,
    required: true,
    trim: true
  },
  partenaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner', // Liaison avec le Module 5 (Partenaires)
    required: false
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
    default: 571 // Taux initial Convention N°171
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
    default: null
  },
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('expense', expenseSchema);