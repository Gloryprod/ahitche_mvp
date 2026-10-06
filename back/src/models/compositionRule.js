const mongoose = require('mongoose');

const CompositionRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // ex: "Standard (×2 / ×5)", "Féculents plafonnés"
  // Libellé seulement (D-14) : les quantités par pack font foi ; vide pour une règle sans multiplicateur
  multiplierEquilibre: { type: Number, default: null }, // ex: 2 ou 1.3
  multiplierConfort: { type: Number, default: null }, // ex: 5 ou 1.7
  description: { type: String, default: '' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });   

module.exports = mongoose.model('CompositionRule', CompositionRuleSchema);