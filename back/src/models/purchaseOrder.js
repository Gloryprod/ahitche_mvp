const mongoose = require('mongoose');

// Bon de commande fournisseur. Deux formats coexistent :
//  - ancien format (écran Stock actuel) : `items` (produit, quantité commandée, prix prévu), numéro BC-xxxxxx généré ;
//  - nouveau format (saisie d'une facture d'achat) : `lignes`, une par ligne de la facture, rattachées à un produit
//    du catalogue ; la réception crée un lot de stock par ligne (lotId) et rattache le bon à la dépense de sa pièce.
// « Achat direct » : achat sans bon de commande signé ; le numéro du bon est alors « Achat direct – facture n° … ».
const TYPES_COMMANDE = ['Bon de commande', 'Achat direct'];
const STATUTS_BON = ['En attente', 'Reçu partiellement', 'Reçu', 'Annulé'];

const quantitePositive = {
  validator: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  message: 'La quantité doit être supérieure à 0.'
};

// Ligne de facture (nouveau format)
const ligneBonSchema = new mongoose.Schema({
  designation: { type: String, required: true, trim: true }, // Ligne telle qu'écrite sur la facture
  quantiteFacture: { type: String, trim: true, default: '' }, // Ex : « 1 carton »
  montantFcfa: { type: Number, required: true, min: 0 }, // Montant de la ligne sur la facture
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantite: { type: Number, required: true, validate: quantitePositive }, // Dans l'unité du produit
  detailQuantite: { type: String, trim: true, default: '' }, // Ex : « 15 bouteilles de 1 L »
  // Réception : quantité reçue, lot créé (un lot par ligne)
  quantiteRecue: { type: Number, default: null, min: 0 },
  lotFournisseur: { type: String, trim: true, default: '' },
  numeroLot: { type: String, trim: true, default: '' },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'LotStockFifo', default: null }
});

const purchaseOrderSchema = new mongoose.Schema({
  // Référence du bon de commande signé, ou « Achat direct – facture n° … » ; unique parmi TOUS les bons (supprimés compris)
  numeroBon: { type: String, required: true, unique: true }, // Ex: BC-2026-001
  typeCommande: { type: String, enum: TYPES_COMMANDE, default: 'Bon de commande' },
  // Fiche prestataire du fournisseur ; le nom est recopié pour garder l'historique lisible
  fournisseurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  fournisseur: { 
    type: String, 
    required: true, 
    trim: true 
  },
  // Ancien format (facultatif) : produit, quantité commandée et prix prévu
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantiteCommandee: { type: Number, required: true },
    prixUnitairePrevu: { type: Number, required: true }
  }],
  // Nouveau format : facture du fournisseur et ses lignes
  numeroFacture: { type: String, trim: true, default: '' },
  dateFacture: { type: Date, default: null },
  lignes: { type: [ligneBonSchema], default: [] },
  montantTotalFcfa: { type: Number, default: null, min: 0 }, // Somme des montants des lignes
  ligneBudgetaire: { type: String, trim: true, default: '' }, // Code de la ligne budgétaire (ex. L5)
  sousLigne: { type: String, trim: true, default: '' },
  dateReception: { type: Date, default: null },
  depenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null }, // Dépense de la pièce (jamais créée par le bon)
  commentaire: { type: String, trim: true, default: '' },
  statut: { 
    type: String, 
    enum: STATUTS_BON, 
    default: 'En attente' 
  },
  dateEmission: { type: Date, default: Date.now }, // Date du bon signé, ou de la facture pour un achat direct
  deletedAt: { type: Date, default: null}
}, { timestamps: true });   

// Une facture = un bon actif
purchaseOrderSchema.index(
  { numeroFacture: 1 },
  { name: 'numeroFacture_unique', unique: true, partialFilterExpression: { numeroFacture: { $gt: '' }, deletedAt: null } }
);

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports.TYPES_COMMANDE = TYPES_COMMANDE;
module.exports.STATUTS_BON = STATUTS_BON;
