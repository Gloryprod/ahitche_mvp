// models/Expense.js
const mongoose = require('mongoose');
const { SOURCES_FINANCEMENT, MODES_PAIEMENT_DEPENSE } = require('../config/convention');

// Deux familles de dépenses (docs/conception-menu-admin.md, Finances) :
//  - Budget : lignes de la convention Next Impact (prévu / réel, USD et FCFA, audit)
//  - Exploitation : achats de stock (créés automatiquement), livraison, compensations, autres
const CATEGORIES_DEPENSE = ['Budget', 'Exploitation'];
const TYPES_EXPLOITATION = ['Achat stock', 'Livraison', 'Compensation', 'Autre'];

const justificatifSchema = new mongoose.Schema({
  publicId: { type: String, required: true }, // Identifiant Cloudinary (stockage privé)
  format: { type: String, required: true }, // pdf, jpg ou png
  resourceType: { type: String, default: 'image' },
  nom: { type: String, trim: true, default: '' }, // Nom du fichier d'origine
  typePiece: { type: String, trim: true, default: '' }, // Ex : facture, preuve de paiement, autorisation de décaissement
  taille: { type: Number, default: 0 },
  televerseLe: { type: Date, default: Date.now },
  televersePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const expenseSchema = new mongoose.Schema({
  categorie: {
    type: String,
    enum: CATEGORIES_DEPENSE,
    default: 'Budget'
  },
  referenceLigne: {
    type: String,
    // Ex: '1.1', '4.1', '5.x' : obligatoire pour une dépense du budget de la convention
    required: function () { return this.categorie === 'Budget'; },
    trim: true,
    default: ''
  },
  typeExploitation: {
    type: String,
    enum: [...TYPES_EXPLOITATION, null],
    default: null
  },
  libelle: {
    type: String,
    required: true,
    trim: true
  },
  partenaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner', // Liaison avec la section Prestataires
    required: false
  },
  lotStockId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LotStockFifo', // Dépense créée automatiquement par une entrée de stock
    default: null
  },
  // Numéro de la facture ou du reçu : les lots d'un même achat s'y rattachent (une seule dépense par achat, Q 6.3)
  numeroPiece: { type: String, trim: true, default: '' },
  numeroAutorisation: { type: String, trim: true, default: '' }, // Autorisation de décaissement (ex : 171_01)
  sousLigne: { type: String, trim: true, default: '' }, // Ex : L2a, L5b (bons de commande)
  modePaiement: { type: String, enum: [...MODES_PAIEMENT_DEPENSE, ''], default: '' },
  detailPaiement: { type: String, trim: true, default: '' }, // Ex : « Flooz »
  referencePaiement: { type: String, trim: true, default: '' }, // Ex : référence de la transaction Mobile Money
  sourceFinancement: { type: String, enum: [...SOURCES_FINANCEMENT, ''], default: '' },
  moisProjet: { type: String, default: '', match: /^(M\d{1,2})?$/ }, // Mois du projet (du 26 au 25) de l'imputation
  categorieAd: { type: Number, enum: [1, 2, null], default: null }, // Catégorie de la convention : pièces exigées (Q 9.3)
  piecesManquantes: { type: String, trim: true, default: '' }, // Constat écrit (import, contrôle) en plus de la liste automatique
  fichiersAttendus: [{ type: String, trim: true }], // Noms des fichiers justificatifs à téléverser (import)
  commentaire: { type: String, trim: true, default: '' },
  // Montant prévu : vide s'il n'a pas été fixé avant l'achat (dépenses importées)
  montantPrevuUsd: { type: Number, default: null },
  montantPrevuFcfa: { type: Number, default: null },
  montantReelUsd: {
    type: Number,
    default: 0
  },
  montantReelFcfa: {
    type: Number,
    default: 0
  },
  tauxApplique: {
    type: Number,
    required: true,
    default: 571 // Taux initial Convention N°171 ; figé à la création de la dépense
  },
  estEffectue: {
    type: Boolean,
    default: false
  },
  // R10/R11 : Isolation stricte pour l'audit NEXT IMPACT
  estValidePourAudit: {
    type: Boolean,
    default: true,
    required: true
  },
  datePaiement: {
    type: Date
  },
  // Ancien justificatif à adresse publique (avant le stockage privé) : à téléverser de nouveau, puis à effacer
  urlPieceJointe: {
    type: String,
    default: null
  },
  // Pièces justificatives en stockage privé (au moins une pour passer la dépense en « effectuée »)
  justificatifs: [justificatifSchema],
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

expenseSchema.index({ numeroPiece: 1 }, { partialFilterExpression: { numeroPiece: { $gt: '' } } });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.CATEGORIES_DEPENSE = CATEGORIES_DEPENSE;
module.exports.TYPES_EXPLOITATION = TYPES_EXPLOITATION;
