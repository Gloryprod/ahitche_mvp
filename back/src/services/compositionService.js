const Product = require('../models/product');
const Formule = require('../models/formules');

// Calcul de la composition d'un pack à partir du catalogue produits et des règles de composition.
// Partagé par l'écran Formules, la préparation des commandes (Logistique) et les Simulateurs.
// Lecture seule : ne modifie jamais le prix de vente de la formule.

const TYPES_PACK = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];

// 'ahi-equilibre' -> 'equilibre'
const typeDepuisSlug = (slug) => String(slug || '').replace(/^ahi-/, '');

/**
 * @param {string} type - 'essentiel', 'equilibre', 'confort', 'reserve' ou 'fraicheur'
 * @returns {Promise<null | { formule, prixCalcule, itemCount, items }>} null si la formule est introuvable ou inactive
 */
async function calculerCompositionPack(type) {
  const formuleData = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });
  if (!formuleData) return null;

  // Récupérer tous les produits non supprimés avec leurs règles associées
  const products = await Product.find({ deletedAt: null })
    .populate('category', 'name')
    .populate('compositionRule');

  let totalPackPrice = 0;
  const packItems = [];

  for (const product of products) {
    let multiplier = 1;
    let finalQuantity = 0;

    // --- LOGIQUE DES TROIS PREMIERS PACKS ---
    if (['essentiel', 'equilibre', 'confort'].includes(type)) {
      if (type === 'equilibre') {
        multiplier = product.compositionRule ? product.compositionRule.multiplierEquilibre : 2;
      } else if (type === 'confort') {
        multiplier = product.compositionRule ? product.compositionRule.multiplierConfort : 5;
      } else {
        // Pour le pack Essentiel, l'Huile de palme est un cas spécial (absente -> quantité = 0)
        multiplier = product.name.toLowerCase().includes('palme') ? 0 : 1;
      }
      finalQuantity = product.baseQuantity * multiplier;
    }
    // --- AHI RÉSERVE : quantités fixes du référentiel v4 ---
    else if (type === 'reserve') {
      finalQuantity = product.quantityReserve || product.compositionRule?.quantityReserve || 0;
      // Multiplicateur virtuel pour l'affichage front
      multiplier = product.baseQuantity > 0 ? (finalQuantity / product.baseQuantity) : 0;
    }
    // --- AHI FRAÎCHEUR : base minimale modulable du référentiel v4 ---
    else if (type === 'fraicheur') {
      finalQuantity = product.quantityFraicheur || product.compositionRule?.quantityFraicheur || 0;
      multiplier = product.baseQuantity > 0 ? (finalQuantity / product.baseQuantity) : 0;
    }

    // Cas d'exception pour l'oignon dans le pack Réserve (unité panier au coût brut de 3000 F)
    let currentPriceUnit = product.priceUnit;
    let currentUnit = product.unit;
    if (type === 'reserve' && product.name.toLowerCase().includes('oignon')) {
      currentPriceUnit = 3000; // 1 panier = 3000 FCFA
      currentUnit = 'panier';
      finalQuantity = 1;
      multiplier = 1;
    }

    const finalPrice = finalQuantity * currentPriceUnit;
    totalPackPrice += finalPrice;

    packItems.push({
      productId: product._id,
      name: product.name,
      category: product.category?.name || 'Autre',
      unit: currentUnit,
      priceUnit: currentPriceUnit,
      appliedMultiplier: Number(multiplier.toFixed(1)), // Évite les longues décimales à l'affichage
      quantity: finalQuantity,
      totalPrice: finalPrice
    });
  }

  // Pour Réserve et Fraîcheur, on n'affiche que les produits qui ont une quantité > 0 (règles v4)
  const items = ['reserve', 'fraicheur'].includes(type)
    ? packItems.filter(item => item.quantity > 0)
    : packItems;

  return {
    formule: formuleData,
    prixCalcule: totalPackPrice,
    itemCount: packItems.filter(item => item.quantity > 0).length,
    items
  };
}

module.exports = { TYPES_PACK, typeDepuisSlug, calculerCompositionPack };
