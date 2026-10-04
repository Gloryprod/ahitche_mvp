const mongoose = require('mongoose');

// Ligne budgétaire de la convention Next Impact (importée par CSV ou saisie dans Finances)
const budgetLineSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true }, // Ex : "1.1", "4.1"
  libelle: { type: String, required: true, trim: true },
  montantPrevuUsd: { type: Number, default: 0, min: 0 },
  montantPrevuFcfa: { type: Number, default: 0, min: 0 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Un code n'existe qu'une fois parmi les lignes actives
budgetLineSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

module.exports = mongoose.model('BudgetLine', budgetLineSchema);
