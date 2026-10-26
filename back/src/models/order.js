const mongoose = require('mongoose');

// Cycle de vie d'une commande (docs/conception-menu-admin.md, section 1) :
// En attente -> Confirmée -> En préparation -> En livraison -> Livrée (paiement effectué) ou Échec ; Annulée.
const STATUTS = ['En attente', 'Confirmée', 'En préparation', 'En livraison', 'Livrée', 'Échec', 'Annulée'];
const PERIODES = ['Matin', 'Après-midi'];
// D-06 : Mobile Money ou espèces à la livraison ; « Acompte » ne reste que pour l'historique
const MODES_PAIEMENT = ['Mobile Money', 'Espèces', 'Acompte'];
// Pack (par défaut, toutes les commandes existantes) ou achat libre VIP (services/achatLibreService.js) :
// lignes au prix VIP dans productsSnapshot dès la commande, demandes libres chiffrées ensuite par l'admin
const TYPES_COMMANDE = ['pack', 'achat-libre'];

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reference: {
    type: String,
    required: true,
    unique: true // Ex: CMD-001
  },
  formule: {
    type: String,
    required: true // Ex: "AHI ÉQUILIBRÉ"
  },
  formuleSlug: {
    type: String,
    required: true // Ex: "ahi-equilibre" ; "achat-libre" pour un achat libre VIP
  },
  typeCommande: { type: String, enum: TYPES_COMMANDE, default: 'pack' },
  total: {
    type: Number,
    required: true // Ex: 22500 ; fixé par le serveur (prix de la formule + extras − remise validée ;
                   // achat libre : lignes au prix VIP + demandes chiffrées)
  },
  // Achat libre : produits hors catalogue demandés par le client, sans prix tant que l'admin ne les a pas chiffrés.
  // Une demande retirée (motif) ne compte plus. Elles ne sortent jamais du stock.
  demandesLibres: [{
    designation: { type: String, required: true, trim: true, maxlength: 120 },
    quantite: { type: String, trim: true, maxlength: 60, default: '' }, // En texte : « 2 sachets », « 1 tas »
    prix: { type: Number, min: 0, default: null }, // FCFA ; vide = à chiffrer
    retiree: { type: Boolean, default: false },
    motif: { type: String, trim: true, maxlength: 300, default: '' } // Motif du retrait (interne)
  }],
  prixFormule: { type: Number, default: null }, // Prix de la formule au moment de la commande (vide pour un achat libre)
  montantExtras: { type: Number, default: 0 }, // Extras au prix du catalogue
  // Remise (décision D-10) : motif obligatoire ; appliquée au total seulement une fois validée par l'admin
  remise: {
    montant: { type: Number, default: 0, min: 0 },
    motif: { type: String, default: '' },
    statut: { type: String, enum: ['Aucune', 'À valider', 'Validée', 'Refusée'], default: 'Aucune' },
    demandeePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    valideePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    valideeLe: { type: Date, default: null }
  },
  modePaiement: {
    type: String,
    enum: MODES_PAIEMENT,
    default: 'Mobile Money'
  },
  notes: {
    type: String,
    default: ''
  },
  statut: {
    type: String,
    enum: STATUTS,
    default: 'En attente'
  },
  // Journal des changements de statut (qui, quand)
  historique: [{
    _id: false,
    statut: { type: String, enum: STATUTS },
    date: { type: Date, default: Date.now },
    par: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  facture_url: {
    type: String
  },
  // 🔗 Référence vers le modèle OrderProductSnapshot
  productsSnapshot: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderProductSnapshot'
  }],

  // --- Livraison ---
  zone: { type: String, default: null }, // Code de la zone du client au moment de la planification
  creneau: {
    date: { type: Date, default: null },
    periode: { type: String, enum: [...PERIODES, null], default: null }
  },
  livreurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  coutLivraison: { type: Number, default: 0 }, // Tarif de course de la zone, figé à la livraison
  dateLivraison: { type: Date, default: null },

  // --- Paiement (à la livraison) ---
  paiement: {
    statut: { type: String, enum: ['En attente', 'Payé'], default: 'En attente' },
    reference: { type: String, default: '' }, // Référence de transaction Mobile Money
    note: { type: String, default: '' }, // Obligatoire pour Espèces et Acompte
    date: { type: Date, default: null }
  },

  // --- Ancienne garantie « livraison > 24 h » : retirée (D-07, D-08), champs gardés pour l'historique, plus alimentés ---
  enRetard: { type: Boolean, default: false },
  compensation: {
    statut: { type: String, enum: ['Aucune', 'À appliquer', 'Appliquée'], default: 'Aucune' },
    motif: { type: String, default: '' },
    appliqueeSurCommande: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }
  },
  // Compensation d'une commande précédente, à remettre au client avec cette livraison
  compensationRecue: {
    depuisCommande: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    reference: { type: String, default: '' },
    motif: { type: String, default: '' }
  },

  deletedAt: { type: Date, default: null }
}, {
  timestamps: true // Génère automatiquement createdAt (qui servira de date) et updatedAt
});

module.exports = mongoose.model('Order', orderSchema);
module.exports.STATUTS = STATUTS;
module.exports.PERIODES = PERIODES;
module.exports.MODES_PAIEMENT = MODES_PAIEMENT;
module.exports.TYPES_COMMANDE = TYPES_COMMANDE;
