const mongoose = require('mongoose');

// Réglages des simulateurs et du tableau de bord (Q 10.1 à 10.4), enregistrés côté serveur et journalisés.
// Document unique (cle « general »). Aucune valeur par défaut inventée : vide = « à renseigner ».
const nombre = { type: Number, default: null, min: 0 };
const pourcentage = { type: Number, default: null, min: 0, max: 100 };

const parametresSchema = new mongoose.Schema({
  cle: { type: String, default: 'general', unique: true },
  chargesFixesMensuellesFcfa: nombre, // Charges de l'après-convention, saisies par le porteur
  objectifCaMensuelFcfa: nombre,
  repartition: { essentiel: pourcentage, equilibre: pourcentage, confort: pourcentage }, // Part des commandes (%)
  emballageParCommandeFcfa: nombre, // En plus du coefficient (0 : l'emballage est déjà dans le coefficient)
  commissionMobileMoneyPct: pourcentage,
  livraisonMoyenneFcfa: nombre,
  objectifClients: nombre, // Clients visés sur la période de l'objectif
  debutObjectif: { type: Date, default: null },
  finObjectif: { type: Date, default: null },
  // Méthode du référentiel v4 : coût réel = matières × (1 + parts) ; prix = coût réel ÷ (1 − marge)
  parts: { emballage: pourcentage, transformation: pourcentage, logistique: pourcentage, pertes: pourcentage },
  margeCiblePct: { type: Number, default: null, min: 0, max: 95 }
}, { timestamps: true });

// Coefficient opérationnel déduit des parts (1,23 = 1 + 8 % + 5 % + 7 % + 3 %) ; null tant qu'une part manque
parametresSchema.methods.coefficient = function () {
  const p = this.parts || {};
  const valeurs = [p.emballage, p.transformation, p.logistique, p.pertes];
  if (valeurs.some(v => v === null || v === undefined)) return null;
  return Math.round((1 + valeurs.reduce((s, v) => s + v, 0) / 100) * 10000) / 10000;
};

parametresSchema.statics.obtenir = async function () {
  return (await this.findOne({ cle: 'general' })) || new this({ cle: 'general' });
};

module.exports = mongoose.model('Parametres', parametresSchema);
