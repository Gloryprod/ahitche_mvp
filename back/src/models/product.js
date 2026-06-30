const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // ex: "Riz local", "Coquillettes"
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  compositionRule: { type: mongoose.Schema.Types.ObjectId, ref: 'CompositionRule', required: true },
  baseQuantity: { type: Number, required: true }, // Quantité de base (Essentiel)
  unit: { type: String, required: true, trim: true }, // ex: "kg", "boîte", "unités"
  priceUnit: { type: Number, required: true }, // P.U. FCFA
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);