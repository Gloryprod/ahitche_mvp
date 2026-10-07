const Product = require('../models/product');
const Formule = require('../models/formules');

// Calcul de la composition d'un pack à partir du catalogue (référentiel packs v4).
// Partagé par l'écran Formules, la préparation des commandes (Logistique) et les Simulateurs.
// Lecture seule : ne modifie jamais le prix de vente de la formule.
//
// Règle (décision D-14) : la quantité de chaque produit dans chaque pack est une donnée du catalogue
// (Product.quantites) et fait foi ; une quantité vide signifie que le produit est absent du pack.
// Seuls les produits « base fixe » entrent automatiquement dans un pack ; les extras s'ajoutent à la demande.

const TYPES_PACK = ['essentiel', 'equilibre', 'confort', 'reserve', 'fraicheur'];

// 'ahi-equilibre' -> 'equilibre'
const typeDepuisSlug = (slug) => String(slug || '').replace(/^ahi-/, '');

/**
 * @param {string} type - 'essentiel', 'equilibre', 'confort', 'reserve' ou 'fraicheur'
 * @returns {Promise<null | { formule, prixCalcule, prixManquants, itemCount, items }>} null si la formule est introuvable ou inactive
 */
async function calculerCompositionPack(type) {
  const formuleData = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });
  if (!formuleData) return null;

  const products = await Product.find({ deletedAt: null, type: 'base fixe' })
    .populate('category', 'name')
    .populate('compositionRule', 'name')
    .sort({ reference: 1, name: 1 });

  const items = [];
  for (const product of products) {
    const quantite = product.quantites?.[type];
    if (quantite === null || quantite === undefined || quantite <= 0) continue; // Absent du pack

    const prix = product.priceUnit; // null : prix à renseigner, le coût de la ligne reste inconnu
    items.push({
      productId: product._id,
      reference: product.reference,
      name: product.name,
      category: product.category?.name || 'Non classé',
      regle: product.compositionRule?.name || '',
      unit: product.unit,
      priceUnit: prix,
      quantity: quantite,
      totalPrice: prix === null || prix === undefined ? null : quantite * prix,
      indisponible: product.statut === 'indisponible', // Signalé à la préparation
      commentaire: product.commentaire || ''
    });
  }

  const prixConnus = items.filter(i => i.totalPrice !== null);
  return {
    formule: formuleData,
    prixCalcule: prixConnus.reduce((s, i) => s + i.totalPrice, 0), // Coût des matières aux prix du catalogue
    prixManquants: items.length - prixConnus.length,
    itemCount: items.length,
    items
  };
}

module.exports = { TYPES_PACK, typeDepuisSlug, calculerCompositionPack };
