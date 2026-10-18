const mongoose = require('mongoose');

// Lot « à compter » : quantité et prix d'achat restent vides tant que le comptage physique n'est pas fait
// (Q 6.1) ; seule la valeur facturée est connue. Un lot sans quantité ne sort jamais du stock.
// Fournisseur « Production interne » : lot issu d'une transformation (farine de maïs), sans fiche prestataire.
const FOURNISSEUR_INTERNE = 'Production interne';

// 1. Définition de la fiche pour UN LOT physique
const lotStockFifoSchema = new mongoose.Schema({
  numeroLot: {
    type: String,
    required: true,
    trim: true
  }, // Format LOT-<référence produit>-AAAAMMJJ-NN (Q 6.4)
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  }, // Le produit concerné
  quantiteInitiale: { type: Number, default: null, min: 0 }, // Vide : à compter
  quantiteRestante: { type: Number, default: null, min: 0 }, // Ce qu'il reste dans l'entrepôt actuellement
  prixAchatUnitaire: { type: Number, default: null, min: 0 }, // Prix d'achat en FCFA ; vide tant que la quantité n'est pas comptée
  valeurFcfa: { type: Number, default: null, min: 0 }, // Montant facturé pour le lot
  // Date de réception, pour le FIFO ; vide si elle n'est pas consignée (le lot sort alors après les lots datés)
  dateReception: { type: Date, default: Date.now },
  // Fiche prestataire du fournisseur ; le nom est recopié pour garder l'historique lisible
  fournisseurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  fournisseur: {
    type: String,
    required: true,
    trim: true
  },
  lotFournisseur: { type: String, trim: true, default: '' }, // Numéro imprimé par le fournisseur sur le carton
  conditionnement: { type: String, trim: true, default: '' }, // Ex : « 1 carton de 40 sachets de 200 g »
  aConfirmer: { type: String, trim: true, default: '' }, // Ce qui reste à vérifier ; vide = lot confirmé
  // Pièce de l'achat : l'entrée se rattache à la dépense existante, sans en créer une seconde (Q 6.3)
  numeroPiece: { type: String, trim: true, default: '' },
  depenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
  bonCommandeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null }, // Lot créé par la réception d'un bon
  transformationId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Lot produit par une transformation
  commentaire: { type: String, trim: true, default: '' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Tri FIFO rapide par produit et date
lotStockFifoSchema.index({ product: 1, dateReception: 1, quantiteRestante: 1 });
// Numéro de lot unique parmi les lots actifs
lotStockFifoSchema.index({ numeroLot: 1 }, { name: 'numeroLot_unique', unique: true, partialFilterExpression: { deletedAt: null } });


// 2. Définition de la fiche pour HISTORIQUE (Le journal des mouvements)
// Transformation : la matière sort (transformation_sortie) et le produit obtenu entre (transformation_entree),
// avec le rendement ; essai : sortie pour un test (moulin, recette).
const TYPES_MOUVEMENT = ['entree', 'sortie', 'correction_positive', 'correction_negative', 'transformation_sortie', 'transformation_entree', 'essai'];
// Motifs d'une correction (Q 6.5) ; « Comptage » confirme la quantité d'un lot à compter
const RAISONS_CORRECTION = ['Perte', 'Péremption', 'Erreur de saisie', 'Comptage'];

const mvtStockSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LotStockFifo',
    required: true
  },
  type: {
    type: String,
    enum: TYPES_MOUVEMENT,
    required: true
  },
  quantite: {
    type: Number,
    required: true,
    min: 0
  },
  raison: { type: String, enum: [...RAISONS_CORRECTION, null], default: null },
  motif: {
    type: String,
    trim: true
  }, // Ex: "Réception bon de commande #12"
  transformationId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Relie la sortie de matière et l'entrée du produit
  rendement: { type: Number, default: null }, // Quantité obtenue / quantité de matière, sur l'entrée de transformation
  responsable: {
    type: String,
    default: 'Gestionnaire Stock'
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

const LotStockFifo = mongoose.model('LotStockFifo', lotStockFifoSchema);
const MouvementStock = mongoose.model('MouvementStock', mvtStockSchema);

module.exports = { LotStockFifo, MouvementStock, FOURNISSEUR_INTERNE, TYPES_MOUVEMENT, RAISONS_CORRECTION };
