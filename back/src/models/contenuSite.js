const mongoose = require('mongoose');
const { CLES } = require('../services/contenuSiteService');

// Contenus du site public modifiés depuis l'admin (écran « Site public », docs-internes/admin/CONTRAT-site-public-A.md).
// Un document par contenu, identifié par sa clé (« infos », « bandeau » ; plus tard « formules », « faq »…, voir
// services/contenuSiteService.js). Pas de document = jamais publié : le site garde les valeurs du code (aucune migration).
// `valeurs` est toujours validé par le service avant l'écriture ; `versions` garde les 10 dernières publications,
// la plus récente en tête.

const NB_VERSIONS = 10;

const versionSchema = new mongoose.Schema({
  valeurs: { type: mongoose.Schema.Types.Mixed, required: true },
  publieLe: { type: Date, required: true },
  publiePar: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nom: { type: String, default: '' }
  }
});

const contenuSiteSchema = new mongoose.Schema({
  cle: { type: String, required: true, unique: true, enum: CLES },
  valeurs: { type: mongoose.Schema.Types.Mixed, required: true },
  versions: { type: [versionSchema], default: [] }
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('ContenuSite', contenuSiteSchema);
module.exports.NB_VERSIONS = NB_VERSIONS;
