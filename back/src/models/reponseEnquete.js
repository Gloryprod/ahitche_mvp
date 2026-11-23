const mongoose = require('mongoose');

// Enquête de satisfaction (page publique /enquete, sans compte) : notes, avis sur les produits de base des packs,
// suggestions. Anonyme, sauf si le client laisse son numéro avec son accord pour être recontacté.
// Effacée automatiquement un an après l'envoi (index TTL). Contrat : docs-internes/enquete/CONTRAT.md.

const FORMULES_ENQUETE = ['ahi-essentiel', 'ahi-equilibre', 'ahi-confort', 'autre', 'ne-sait-pas'];
const AVIS_PRODUIT = ['moins', 'bien', 'plus', 'autre'];
// Produits proposés : la base fixe (P) des packs, hors produits supprimés
const PRODUITS_ENQUETE = { type: 'base fixe', deletedAt: null };
const CONSERVATION_SECONDES = 365 * 24 * 3600;

const note = (required) => ({ type: Number, required, min: 1, max: 5, validate: { validator: Number.isInteger, message: 'Note entière attendue.' } });
const produit = { type: mongoose.Schema.Types.ObjectId, ref: 'Product' };

const avisProduitSchema = new mongoose.Schema({
  produit: { ...produit, required: true },
  avis: { type: String, enum: AVIS_PRODUIT, required: true },
  remplacement: { type: String, trim: true, maxlength: 80 } // Seulement si avis « autre »
}, { _id: false });

const reponseEnqueteSchema = new mongoose.Schema({
  noteGlobale: note(true),
  noteLivraison: note(false),
  noteQualite: note(false),
  formule: { type: String, enum: FORMULES_ENQUETE },
  produitsPlus: [produit],
  produitsMoins: [produit],
  produitSouhaite: { type: String, trim: true, maxlength: 200 },
  detail: [avisProduitSchema],
  suggestion: { type: String, trim: true, maxlength: 1000 },
  contact: {
    prenom: { type: String, trim: true, maxlength: 50 },
    telephone: { type: String }, // Normalisé (« 229… »), seulement avec accordRecontact
    accordRecontact: { type: Boolean }
  }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

reponseEnqueteSchema.index({ createdAt: 1 }, { expireAfterSeconds: CONSERVATION_SECONDES, name: 'effacement_apres_un_an' });

module.exports = {
  ReponseEnquete: mongoose.model('ReponseEnquete', reponseEnqueteSchema),
  FORMULES_ENQUETE, AVIS_PRODUIT, PRODUITS_ENQUETE, CONSERVATION_SECONDES
};
