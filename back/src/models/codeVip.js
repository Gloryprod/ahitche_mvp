const mongoose = require('mongoose');

// Codes VIP (créés par l'admin) : un client qui saisit un code valide dans son espace devient VIP, sans fin,
// jusqu'au retrait du statut par l'admin (User.vip). Un compte VIP accède aux achats libres au prix VIP.
//  - personnel : une seule utilisation (plafond 1) ;
//  - partage   : plusieurs comptes, jusqu'au plafond.
// Désactiver un code empêche toute nouvelle utilisation ; les comptes déjà VIP le restent.
const TYPES_CODE_VIP = ['personnel', 'partage'];

const codeVipSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 }, // Ex : AHI-VIP-7K2Q4M
  type: { type: String, enum: TYPES_CODE_VIP, required: true },
  plafond: { type: Number, required: true, min: 1 }, // 1 pour un code personnel
  utilisations: [{
    _id: false,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now }
  }],
  libelle: { type: String, trim: true, maxlength: 80, default: '' }, // Ex : client prévu, nom de l'opération
  actif: { type: Boolean, default: true },
  creePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Un code n'existe qu'une fois, même archivé : un ancien code n'est jamais réattribué
codeVipSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });

module.exports = mongoose.model('CodeVip', codeVipSchema);
module.exports.TYPES_CODE_VIP = TYPES_CODE_VIP;
