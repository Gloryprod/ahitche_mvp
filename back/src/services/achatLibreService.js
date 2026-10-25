const mongoose = require('mongoose');
const Product = require('../models/product');
const { TYPES_VENDUS, FAMILLES } = require('../models/product');

// Achats libres VIP (docs-internes/vip/CAHIER-DES-CHARGES.md, partie B) : un compte VIP commande des produits du
// catalogue au prix VIP, et des « demandes libres » sans prix que l'admin chiffre ensuite. Le serveur fixe le total :
//   total = Σ (prix VIP × quantité) des lignes, arrondi au franc + Σ prix des demandes chiffrées (non retirées)
// Le prix du catalogue (priceUnit) n'est jamais utilisé ni renvoyé au client. Même parcours qu'un pack : référence
// CMD-xxx, statuts, paiement à la livraison, sortie de stock FIFO des lignes à la livraison.

const SLUG_ACHAT_LIBRE = 'achat-libre';
const NOM_ACHAT_LIBRE = 'Achat libre VIP';
const MAX_LIGNES = 50;
const MAX_DEMANDES = 10;
const MAX_QUANTITE = 100;
const MAX_PRIX = 10000000; // Garde-fou de saisie (FCFA)

// Produits proposés en achat libre : actifs, vendus (base fixe ou extra), pas « indisponibles », avec un prix VIP
const FILTRE_PROPOSES = { deletedAt: null, type: { $in: TYPES_VENDUS }, statut: { $ne: 'indisponible' }, prixVip: { $gte: 0 } };

// kg et L se commandent par demi-unité (0,5) ; les autres unités (unité, boîte, lot, pack, 500 g…) à l'unité
const UNITES_FRACTIONNABLES = ['kg', 'kgs', 'kilo', 'kilos', 'kilogramme', 'kilogrammes', 'l', 'litre', 'litres'];
const pasDeQuantite = (unite) => (UNITES_FRACTIONNABLES.includes(String(unite || '').trim().toLowerCase()) ? 0.5 : 1);

// Nombre saisi : un nombre ou un texte numérique fini ; NaN sinon (absent, tableau, objet, Infinity)
const nombre = (v) => {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return NaN;
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(n) ? n : NaN;
};

// Texte d'une saisie : espaces et retours à la ligne ramenés à un seul espace
const nettoyer = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// Multiple du pas, entre le pas et 100 (0,5 · 1 · 1,5… pour kg et L ; 1 · 2 · 3… sinon)
const quantiteValide = (q, pas) => q >= pas && q <= MAX_QUANTITE && Number.isInteger(q / pas);

/**
 * Lit et valide la commande envoyée par le client, sans toucher à la base.
 * @returns {{ erreur } | { lignes: [{ productId, quantite }], demandes: [{ designation, quantite }], notes }}
 */
function lireAchatLibre(body) {
  const lignesRecues = body?.lignes ?? [];
  const demandesRecues = body?.demandesLibres ?? [];
  if (!Array.isArray(lignesRecues) || !Array.isArray(demandesRecues)) return { erreur: 'Commande invalide.' };
  if (lignesRecues.length > MAX_LIGNES) return { erreur: `${MAX_LIGNES} produits au plus par commande.` };
  if (demandesRecues.length > MAX_DEMANDES) return { erreur: `${MAX_DEMANDES} demandes libres au plus par commande.` };
  if (!lignesRecues.length && !demandesRecues.length) return { erreur: 'Choisissez au moins un produit ou ajoutez une demande.' };
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') return { erreur: 'Note invalide.' };

  const lignes = [];
  const vus = new Set();
  for (const ligne of lignesRecues) {
    if (!ligne || typeof ligne !== 'object' || !mongoose.isValidObjectId(ligne.productId)) return { erreur: 'Un produit de la commande est invalide.' };
    const id = String(ligne.productId);
    if (vus.has(id)) return { erreur: 'Un produit apparaît deux fois : regroupez les quantités.' };
    vus.add(id);
    const quantite = nombre(ligne.quantite);
    if (Number.isNaN(quantite)) return { erreur: 'Quantité invalide.' };
    lignes.push({ productId: id, quantite });
  }

  const demandes = [];
  for (const demande of demandesRecues) {
    if (!demande || typeof demande !== 'object') return { erreur: 'Demande libre invalide.' };
    if (demande.quantite !== undefined && demande.quantite !== null && typeof demande.quantite !== 'string') {
      return { erreur: 'La quantité d\'une demande libre s\'écrit en texte (ex. « 2 sachets »).' };
    }
    const designation = nettoyer(demande.designation);
    const quantite = nettoyer(demande.quantite);
    if (designation.length < 2 || designation.length > 120) return { erreur: 'Chaque demande libre doit avoir une désignation (120 caractères au plus).' };
    if (quantite.length > 60) return { erreur: 'Quantité d\'une demande libre : 60 caractères au plus.' };
    demandes.push({ designation, quantite });
  }

  return { lignes, demandes, notes: nettoyer(body.notes).slice(0, 500) };
}

/**
 * Vérifie chaque produit en base et prépare les lignes de la commande (prix unitaire = prix VIP).
 * @returns {Promise<{ erreur } | { snapshots: Array }>} snapshots sans orderId
 */
async function preparerLignes(lignes) {
  if (!lignes.length) return { snapshots: [] };
  const produits = new Map((await Product.find({ ...FILTRE_PROPOSES, _id: { $in: lignes.map(l => l.productId) } })
    .select('name unit type prixVip').lean()).map(p => [String(p._id), p]));

  const snapshots = [];
  for (const { productId, quantite } of lignes) {
    const produit = produits.get(productId);
    if (!produit) return { erreur: 'Un produit n\'est plus proposé en achat libre : actualisez la liste.' };
    const pas = pasDeQuantite(produit.unit);
    if (!quantiteValide(quantite, pas)) {
      return {
        erreur: pas === 0.5
          ? `${produit.name} : quantité par pas de 0,5 ${produit.unit} (de 0,5 à ${MAX_QUANTITE}).`
          : `${produit.name} : quantité entière de 1 à ${MAX_QUANTITE}.`
      };
    }
    snapshots.push({
      productId: produit._id, name: produit.name, quantity: quantite, unit: produit.unit,
      unitPrice: produit.prixVip, totalPrice: produit.prixVip * quantite,
      isExtra: produit.type === 'extra'
    });
  }
  return { snapshots };
}

// Demandes encore à chiffrer (ni prix ni retrait) : elles bloquent la confirmation
const demandesAChiffrer = (demandes) => (demandes || []).filter(d => !d.retiree && (d.prix === null || d.prix === undefined)).length;
// Demandes chiffrées et gardées : elles comptent dans le total et se livrent (sans sortie de stock)
const demandesChiffrees = (demandes) => (demandes || []).filter(d => !d.retiree && d.prix !== null && d.prix !== undefined);

// Total serveur : lignes (prix VIP × quantité, arrondi au franc) + demandes chiffrées
function totalAchatLibre(snapshots, demandes) {
  const lignes = (snapshots || []).reduce((s, l) => s + (l.totalPrice || 0), 0);
  return Math.round(lignes) + demandesChiffrees(demandes).reduce((s, d) => s + d.prix, 0);
}

// Produit du catalogue VIP, tel que renvoyé au client : jamais le prix du catalogue
const versCatalogue = (p) => ({
  productId: p._id, reference: p.reference, nom: p.name, unite: p.unit, famille: FAMILLES[p.type],
  prixVip: p.prixVip, pas: pasDeQuantite(p.unit), maximum: MAX_QUANTITE
});

module.exports = {
  SLUG_ACHAT_LIBRE, NOM_ACHAT_LIBRE, MAX_LIGNES, MAX_DEMANDES, MAX_QUANTITE, MAX_PRIX, FILTRE_PROPOSES,
  pasDeQuantite, nombre, nettoyer, lireAchatLibre, preparerLignes,
  demandesAChiffrer, demandesChiffrees, totalAchatLibre, versCatalogue
};
