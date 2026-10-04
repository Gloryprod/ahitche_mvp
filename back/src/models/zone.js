const mongoose = require('mongoose');

// Zone de livraison = un arrondissement de Cotonou ou d'Abomey-Calavi (référentiel : data/zones-livraison.json).
// Le tarif de course sert à la fois de rémunération du livreur (par course) et de coût interne de livraison.
const zoneSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true }, // Ex : "cotonou-12", "calavi-godomey"
  commune: { type: String, required: true, enum: ['Cotonou', 'Abomey-Calavi'] },
  nom: { type: String, required: true, trim: true }, // Ex : "12e arrondissement", "Godomey"
  quartiers: [{ type: String, trim: true }],
  prioritaire: { type: Boolean, default: false },
  tarifCourse: { type: Number, default: 0, min: 0 }, // FCFA par livraison
  actif: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Zone', zoneSchema);
