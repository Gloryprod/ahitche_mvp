const mongoose = require('mongoose');

// Clôture mensuelle des finances (mois du projet, du 26 au 25) : un mois clos ne se modifie plus
// sans réouverture tracée (motif, auteur, date).
const evenementSchema = new mongoose.Schema({
  action: { type: String, enum: ['Clôture', 'Réouverture'], required: true },
  par: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  le: { type: Date, default: Date.now },
  motif: { type: String, trim: true, default: '' }
}, { _id: false });

const clotureMoisSchema = new mongoose.Schema({
  mois: { type: String, required: true, unique: true, match: /^M\d{1,2}$/ }, // Ex : "M4"
  close: { type: Boolean, default: false },
  historique: [evenementSchema]
}, { timestamps: true });

module.exports = mongoose.model('ClotureMois', clotureMoisSchema);
