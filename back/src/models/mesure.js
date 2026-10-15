const mongoose = require('mongoose');

// Mesure d'audience sans cookie : uniquement des totaux par jour (pages vues, clics « Commander sur WhatsApp »).
// Aucune adresse IP, aucun identifiant de visiteur, aucun cookie : rien ne relie deux comptages entre eux.
const EVENEMENTS = ['visite', 'clic_whatsapp'];

const mesureSchema = new mongoose.Schema({
  jour: { type: String, required: true }, // AAAA-MM-JJ, heure de Cotonou
  evenement: { type: String, enum: EVENEMENTS, required: true },
  detail: { type: String, default: '' }, // Page vue, ou origine du clic (section, formule)
  nombre: { type: Number, default: 0, min: 0 }
}, { versionKey: false });

mesureSchema.index({ jour: 1, evenement: 1, detail: 1 }, { unique: true });

module.exports = mongoose.model('Mesure', mesureSchema);
module.exports.EVENEMENTS = EVENEMENTS;
