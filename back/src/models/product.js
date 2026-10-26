const mongoose = require('mongoose');

// Catalogue (référentiel packs v4), quatre familles :
//  - P   (« base fixe »)        : produits fixes P01 à P17, base des packs ;
//  - V   (« extra »)            : produits variables, vendus à la demande (compléments de la semaine) ;
//  - MP  (« matière première ») : matières premières stockées puis transformées (ex. maïs → farine), jamais vendues ;
//  - EMB (« fourniture »)       : fournitures et emballages, stockés mais non vendus, hors packs, invisibles sur le site.
// Seuls P et V se vendent (TYPES_VENDUS) : MP et EMB n'ont ni quantité par pack ni affichage « cette semaine ».
// Les quantités par pack font foi (décision D-14) ; la règle de composition n'est plus qu'un libellé, qui sert à
// proposer les quantités d'un nouveau produit.
// Une valeur absente reste vide (null) et s'affiche « à renseigner » : aucune valeur n'est inventée.
const TYPES_PRODUIT = ['base fixe', 'extra', 'matière première', 'fourniture'];
const TYPES_VENDUS = ['base fixe', 'extra'];
const FAMILLES = { 'base fixe': 'P', 'extra': 'V', 'matière première': 'MP', 'fourniture': 'EMB' };
const STATUTS_PRODUIT = ['disponible', 'indisponible'];
const PACKS = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];

// Quantité d'un produit dans chaque pack, dans l'unité du produit ; vide = absent du pack
const quantitesSchema = new mongoose.Schema(
  Object.fromEntries(PACKS.map(p => [p, { type: Number, min: 0, default: null }])),
  { _id: false }
);

const ProductSchema = new mongoose.Schema({
  reference: { type: String, trim: true, default: null }, // Ex : "P01", "V13", "MP01", "EMB01"
  name: { type: String, required: true, trim: true }, // ex: "Riz local", "Coquillettes"
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  compositionRule: { type: mongoose.Schema.Types.ObjectId, ref: 'CompositionRule', default: null }, // Libellé seulement
  type: { type: String, enum: TYPES_PRODUIT, default: 'base fixe' },
  statut: { type: String, enum: STATUTS_PRODUIT, default: 'disponible' },
  quantites: { type: quantitesSchema, default: () => ({}) },
  baseQuantity: { type: Number, default: null }, // Ancien champ (quantité Essentiel) : remplacé par quantites.essentiel
  unit: { type: String, required: true, trim: true }, // ex: "kg", "boîte", "unités"
  priceUnit: { type: Number, min: 0, default: null }, // P.U. FCFA du référentiel ; vide = à renseigner
  // Prix des achats libres VIP (FCFA), fixé par l'admin ; vide = produit non proposé aux comptes VIP.
  // Lu seulement par les rôles de la section « vip » (admin, coordinateur) et par les comptes VIP.
  prixVip: { type: Number, min: 0, default: null },
  seuilAlerte: { type: Number, min: 0, default: null }, // Dans l'unité du produit ; vide = pas d'alerte (à renseigner)
  commentaire: { type: String, trim: true, default: '' },
  // Vitrine des compléments (extras) : section « Disponible cette semaine » de l'accueil
  photo: { type: String, trim: true, default: '' }, // Adresse Cloudinary ; vide = pas encore de photo
  description: { type: String, trim: true, default: '', maxlength: 200 },
  cetteSemaine: { type: Boolean, default: false }, // Affiché sur le site cette semaine (retirer ne supprime pas)
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Une référence n'existe qu'une fois parmi les produits actifs
ProductSchema.index(
  { reference: 1 },
  { unique: true, name: 'reference_unique', partialFilterExpression: { reference: { $type: 'string' }, deletedAt: null } }
);

module.exports = mongoose.model('Product', ProductSchema);
module.exports.TYPES_PRODUIT = TYPES_PRODUIT;
module.exports.TYPES_VENDUS = TYPES_VENDUS;
module.exports.FAMILLES = FAMILLES;
module.exports.STATUTS_PRODUIT = STATUTS_PRODUIT;
module.exports.PACKS = PACKS;
