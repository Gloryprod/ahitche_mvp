const mongoose = require('mongoose');

// Avis clients : rédigés par le client dans son espace, affichés sur l'accueil seulement après validation de l'admin.
// À valider -> Publié ou Refusé (motif visible du client). Toute modification par le client le renvoie « À valider ».
// Données publiées (prénom, quartier, note, texte) : seulement avec l'accord du client, qui peut retirer son avis à tout moment.

const STATUTS_AVIS = ['À valider', 'Publié', 'Refusé'];
const VERSION_CONSENTEMENT_AVIS = '2026-10-v1';

const avisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // Un avis par client
  prenom: { type: String, required: true, trim: true, maxlength: 40 }, // Nom affiché sur le site, choisi par le client
  quartier: { type: String, trim: true, maxlength: 60, default: '' },
  note: { type: Number, required: true, min: 1, max: 5 },
  texte: { type: String, required: true, trim: true, maxlength: 600 },
  statut: { type: String, enum: STATUTS_AVIS, default: 'À valider', index: true },
  consentement: {
    date: { type: Date, required: true },
    version: { type: String, required: true }
  },
  decidePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decideLe: { type: Date, default: null },
  motif: { type: String, trim: true, maxlength: 300, default: '' } // Refus ou retrait du site
}, { timestamps: true });

module.exports = {
  Avis: mongoose.model('Avis', avisSchema),
  STATUTS_AVIS, VERSION_CONSENTEMENT_AVIS
};
