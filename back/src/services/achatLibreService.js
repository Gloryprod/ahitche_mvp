const mongoose = require('mongoose');
const Product = require('../models/product');
const { TYPES_VENDUS, FAMILLES } = require('../models/product');
const Order = require('../models/order');
const OrderProductSnapshot = require('../models/orderProductSnapshot');
const { genererReferenceCommande } = require('./orderReferenceService');

// Achats libres VIP (docs-internes/vip/CAHIER-DES-CHARGES.md, parties B et C) : un compte VIP commande des produits du
// catalogue au prix VIP, et des « demandes libres » sans prix que l'admin chiffre ensuite. Le serveur fixe le total :
//   total = Σ (prix VIP × quantité) des lignes, arrondi au franc + Σ prix des demandes chiffrées (non retirées)
// Le prix du catalogue (priceUnit) n'est jamais utilisé ni renvoyé au client. Même parcours qu'un pack : référence
// CMD-xxx, statuts, paiement à la livraison, sortie de stock FIFO des lignes à la livraison.
// L'équipe peut aussi saisir un achat libre au nom d'un client VIP (mêmes contrôles, même calcul) ; seul l'admin
// chiffre alors des demandes dès la saisie.

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

// Nombre saisi : un nombre fini, ou un texte décimal (« 2 », « 1,5 », « 0.5 », « -1 ») ; NaN sinon (absent, tableau,
// objet, Infinity, et formes hexadécimales ou exponentielles écrites en texte comme « 0x10 » ou « 1e2 »)
const DECIMAL = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const nombre = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || !DECIMAL.test(v.trim())) return NaN;
  return Number(v.trim().replace(',', '.'));
};

// Texte d'une saisie : espaces et retours à la ligne ramenés à un seul espace
const nettoyer = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// Multiple du pas, entre le pas et 100 (0,5 · 1 · 1,5… pour kg et L ; 1 · 2 · 3… sinon)
const quantiteValide = (q, pas) => q >= pas && q <= MAX_QUANTITE && Number.isInteger(q / pas);

/**
 * Lit et valide la commande envoyée par le client (ou saisie par l'équipe), sans toucher à la base. Un prix envoyé avec
 * une demande libre est ignoré ici : seule la saisie de l'admin le lit (lirePrixDemande).
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
    if (!produit) return { erreur: "Un produit n'est plus proposé : nous l'avons retiré de la liste. Vérifiez la commande, puis envoyez-la à nouveau." };
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

// Prix d'une demande libre fixé par l'admin (chiffrage ou saisie) : FCFA de 0 à MAX_PRIX, arrondi au franc
function lirePrixDemande(valeur) {
  const prix = nombre(valeur);
  return prix >= 0 && prix <= MAX_PRIX ? { prix: Math.round(prix) } : { erreur: true };
}
// Champ prix laissé vide : la demande reste « à chiffrer »
const prixVide = (valeur) => valeur === undefined || valeur === null || valeur === '';

// Produit du catalogue VIP, tel que renvoyé au client : jamais le prix du catalogue
const versCatalogue = (p) => ({
  productId: p._id, reference: p.reference, nom: p.name, unite: p.unit, famille: FAMILLES[p.type],
  prixVip: p.prixVip, pas: pasDeQuantite(p.unit), maximum: MAX_QUANTITE
});

// Catalogue VIP (espace client et formulaire de l'équipe) : produits de base (P) puis variables (V), au prix VIP
async function catalogueVip() {
  const produits = await Product.find(FILTRE_PROPOSES).select('reference name unit type prixVip').sort({ reference: 1, name: 1 }).lean();
  return produits.map(versCatalogue);
}

// Deux commandes au même instant peuvent recevoir la même référence : l'index unique refuse la seconde,
// qui reprend alors la référence suivante (3 essais)
const doublonDeReference = (error) => error?.code === 11000 && /reference/.test(String(error.message || ''));

/**
 * Enregistre un achat libre déjà vérifié (lignes préparées par preparerLignes) : référence CMD-xxx fixée par le serveur,
 * lignes au prix VIP dans productsSnapshot, demandes libres (prix vide = à chiffrer), total serveur, « En attente ».
 * Les lignes sont effacées si la commande ne peut pas être enregistrée.
 * @param {object} p
 * @param {string} p.userId - client de la commande
 * @param {Array} p.snapshots - lignes préparées (sans orderId)
 * @param {Array} p.demandes - [{ designation, quantite, prix? }] ; prix seulement s'il a été fixé par l'admin
 * @param {string} p.notes
 * @param {string} p.par - auteur, consigné dans l'historique des statuts (le client, ou le membre de l'équipe)
 * @param {string} [p.modePaiement] - Mobile Money par défaut
 * @returns {Promise<{ commande, lignes }>}
 */
async function enregistrerAchatLibre({ userId, snapshots, demandes, notes, par, modePaiement }) {
  const orderId = new mongoose.Types.ObjectId();
  const lignes = snapshots.length ? await OrderProductSnapshot.insertMany(snapshots.map(s => ({ ...s, orderId }))) : [];
  const demandesLibres = demandes.map(d => ({ designation: d.designation, quantite: d.quantite, prix: d.prix ?? null, retiree: false, motif: '' }));
  try {
    for (let essai = 1; ; essai++) {
      const commande = new Order({
        _id: orderId,
        userId,
        reference: await genererReferenceCommande(),
        formule: NOM_ACHAT_LIBRE,
        formuleSlug: SLUG_ACHAT_LIBRE,
        typeCommande: 'achat-libre',
        total: totalAchatLibre(lignes, demandesLibres),
        prixFormule: null,
        montantExtras: 0,
        ...(modePaiement ? { modePaiement } : {}),
        notes,
        productsSnapshot: lignes.map(l => l._id),
        demandesLibres,
        statut: 'En attente',
        historique: [{ statut: 'En attente', date: new Date(), par }]
      });
      try {
        return { commande: await commande.save(), lignes };
      } catch (error) {
        if (!doublonDeReference(error) || essai >= 3) throw error;
      }
    }
  } catch (error) {
    await OrderProductSnapshot.deleteMany({ orderId }); // Pas de lignes orphelines
    throw error;
  }
}

module.exports = {
  SLUG_ACHAT_LIBRE, NOM_ACHAT_LIBRE, MAX_LIGNES, MAX_DEMANDES, MAX_QUANTITE, MAX_PRIX, FILTRE_PROPOSES,
  pasDeQuantite, nombre, nettoyer, lireAchatLibre, preparerLignes,
  demandesAChiffrer, demandesChiffrees, totalAchatLibre, lirePrixDemande, prixVide, versCatalogue, catalogueVip,
  enregistrerAchatLibre
};
