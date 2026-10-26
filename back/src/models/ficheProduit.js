const mongoose = require('mongoose');

// Fiches produits : publicité affichée dans l'espace client (bandeau), rattachée à un produit vendu du catalogue
// (base fixe ou extra). Plusieurs fiches par produit, une par format (« Boîte de 70 g », « Sac de 5 kg »).
// Affichage seulement : le prix d'une fiche est saisi à la main et n'a AUCUN lien avec les commandes, le stock,
// les finances ni les prix VIP. Décocher « publiée » retire la fiche de l'espace client sans la supprimer.
const ficheProduitSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  format: { type: String, required: true, trim: true, maxlength: 60 },
  prix: { type: Number, required: true, min: 0 }, // FCFA, prix publicitaire affiché (« 85 F »)
  mention: { type: String, trim: true, maxlength: 120, default: '' }, // Ex : « Prix inclus dans tous les packs »
  // Photo facultative, téléversée dans le dossier Cloudinary « fiches »
  photo: {
    url: { type: String, trim: true, default: '' },
    publicId: { type: String, trim: true, default: '' }
  },
  publiee: { type: Boolean, default: true },
  ordre: { type: Number, default: null }, // Tri d'affichage facultatif (les fiches sans ordre passent après)
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('FicheProduit', ficheProduitSchema);
