const mongoose = require('mongoose');

// Suivi alimentaire (docs/conception-menu-admin.md, Nutrition et point 4.2).
// v1 : uniquement des données NON sensibles. Aucune donnée de santé (maladies, allergies, objectifs médicaux)
// ni de conviction (interdits religieux) : ces champs attendront l'autorisation préalable de l'APDP
// (Code du numérique, loi 2017-20, article 394).

const TRANCHES_AGE = ['0-5', '6-12', '13-17', '18-59', '60+'];
const OBJECTIFS = ['Manger plus équilibré', 'Varier les repas', 'Cuisiner plus vite', 'Maîtriser le budget', 'Repas adaptés aux enfants'];
const VERSION_CONSENTEMENT = '2026-10-v1';

// Profil du foyer, rempli par le client dans son espace
const profilSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  foyer: {
    '0-5': { type: Number, default: 0, min: 0, max: 20 },
    '6-12': { type: Number, default: 0, min: 0, max: 20 },
    '13-17': { type: Number, default: 0, min: 0, max: 20 },
    '18-59': { type: Number, default: 0, min: 0, max: 20 },
    '60+': { type: Number, default: 0, min: 0, max: 20 }
  },
  objectifs: [{ type: String, enum: OBJECTIFS }],
  platsAimes: { type: String, trim: true, maxlength: 500, default: '' },
  alimentsNonAimes: { type: String, trim: true, maxlength: 500, default: '' }, // Goûts uniquement (pas d'allergies en v1)
  consentement: {
    date: { type: Date, required: true },
    version: { type: String, required: true }
  },
  prochainPoint: { type: Date, default: null } // Point mensuel (question 33)
}, { timestamps: true });

// Journal du suivi dans la fiche client
const suiviSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  auteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['Point mensuel', 'Recommandation', 'Note interne'], required: true },
  contenu: { type: String, required: true, trim: true, maxlength: 2000 },
  visibleClient: { type: Boolean, default: false } // Recommandations et points mensuels : visibles dans l'espace client
}, { timestamps: true });

// Idées de repas par formule (D-18) : rédigées par l'équipe (gestionnaire, nutritionniste), sans conseil de santé,
// publiées seulement après validation du porteur (admin). Brouillon -> À valider -> Publié (ou renvoyée en brouillon).
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const STATUTS_IDEE = ['Brouillon', 'À valider', 'Publié'];
const MENTION_SANTE = "Ces conseils ne remplacent pas l'avis d'un professionnel de santé."; // Q 11.5
const menuSchema = new mongoose.Schema({
  formuleSlug: { type: String, required: true, enum: ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort', 'ahi-reserve', 'ahi-fraicheur'] },
  titre: { type: String, required: true, trim: true, maxlength: 120 },
  jours: [{
    _id: false,
    jour: { type: String, enum: JOURS },
    dejeuner: { type: String, trim: true, maxlength: 200, default: '' },
    diner: { type: String, trim: true, maxlength: 200, default: '' }
  }],
  conseil: { type: String, trim: true, maxlength: 500, default: '' },
  actif: { type: Boolean, default: true }, // Ancien affichage, remplacé par le statut
  statut: { type: String, enum: STATUTS_IDEE, default: 'Brouillon' },
  auteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  validePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  valideLe: { type: Date, default: null },
  remarque: { type: String, trim: true, maxlength: 500, default: '' } // Motif d'un renvoi en brouillon
}, { timestamps: true });

module.exports = {
  ProfilNutrition: mongoose.model('ProfilNutrition', profilSchema),
  SuiviNutrition: mongoose.model('SuiviNutrition', suiviSchema),
  MenuType: mongoose.model('MenuType', menuSchema),
  TRANCHES_AGE, OBJECTIFS, JOURS, VERSION_CONSENTEMENT, STATUTS_IDEE, MENTION_SANTE
};
