const mongoose = require('mongoose');

// Ligne budgétaire de la convention Next Impact (importée par CSV ou saisie dans Finances)
const budgetLineSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true }, // Ex : "L1", "L10"
  libelle: { type: String, required: true, trim: true },
  montantPrevuUsd: { type: Number, default: 0, min: 0 },
  montantPrevuFcfa: { type: Number, default: 0, min: 0 },
  categorieAd: { type: Number, enum: [1, 2, null], default: null }, // 1 : biens et services non consultants ; 2 : consultants
  passation: { type: String, trim: true, default: '' }, // Ex : « Achat direct », « Cotation (3 proformas, 14 j) »
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Un code n'existe qu'une fois parmi les lignes actives
budgetLineSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

module.exports = mongoose.model('BudgetLine', budgetLineSchema);
