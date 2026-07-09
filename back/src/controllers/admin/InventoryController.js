const { LotStockFifo, MouvementStock } = require('../../models/stock');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Product = require('../../models/product');

/**
 * 1. ÉTAT DE L'INVENTAIRE GLOBAL & ALERTES
 * Calcule la quantité totale disponible par produit (somme des lots actifs)
 */
async function obtenirInventaireGlobal(req, res) {
  try {
    // Agrégation Mongoose pour grouper le stock restant par produit
    const etatStock = await LotStockFifo.aggregate([
      { $match: { deletedAt: null, quantiteRestante: { $gt: 0 } } },
      {
        $group: {
          _id: "$product",
          stockTotal: { $sum: "$quantiteRestante" },
          nbLotsActifs: { $sum: 1 }
        }
      }
    ]);

    // Remplir les détails des produits et vérifier les seuils d'alerte
    // Note : On suppose que ton modèle Product possède un champ 'seuilAlerte' (ex: 10 kg)
    const inventaireComplet = await Promise.all(etatStock.map(async (item) => {
      const produit = await Product.findById(item._id).select('name unit seuilAlerte');
      const seuil = produit?.seuilAlerte || 15; // Seuil par défaut si non défini

      return {
        productId: item._id,
        nom: produit ? produit.name : "Produit inconnu",
        unite: produit ? produit.unit : "unité",
        stockTotal: item.stockTotal,
        nbLotsActifs: item.nbLotsActifs,
        seuilAlerte: seuil,
        enAlerte: item.stockTotal <= seuil // Flag pour l'affichage UI (badge rouge)
      };
    }));

    return res.status(200).json(inventaireComplet);
  } catch (error) {
    console.error("Erreur obtenirInventaireGlobal:", error);
    return res.status(500).json({ message: "Erreur lors du calcul de l'inventaire." });
  }
}

/**
 * 2. HISTORIQUE DES MOUVEMENTS (GET /api/stock/mouvements)
 * Liste chronologique des flux avec pagination et filtre par type
 */
async function obtenirHistoriqueMouvements(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const { type, productId } = req.query; // Filtres optionnels
    const skip = (page - 1) * limit;

    let filtre = {};
    if (type) filtre.type = type; // 'entree', 'sortie', 'correction_negative'
    if (productId) filtre.product = productId;

    const mouvements = await MouvementStock.find(filtre)
      .populate('product', 'name unit')
      .populate('lotId', 'numeroLot')
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(skip)
      .limit(limit + 1);

    const hasMore = mouvements.length > limit;
    if (hasMore) mouvements.pop();

    return res.status(200).json({ mouvements, hasMore });
  } catch (error) {
    console.error("Erreur obtenirHistoriqueMouvements:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des mouvements." });
  }
}

/**
 * 3. CRÉER UN BON DE COMMANDE FOURNISSEUR (POST /api/stock/bons-commande)
 */
async function creerBonCommande(req, res) {
  try {
    const { fournisseur, items } = req.body;

    if (!fournisseur || !items || items.length === 0) {
      return res.status(400).json({ message: "Données du bon de commande incomplètes." });
    }

    const numeroBon = `BC-${Date.now().toString().slice(-6)}`; // Identifiant court unique

    const nouveauBon = await PurchaseOrder.create({
      numeroBon,
      fournisseur,
      items
    });

    return res.status(201).json({ message: "Bon de commande généré !", bon: nouveauBon });
  } catch (error) {
    console.error("Erreur creerBonCommande:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * 4. OBTENIR LES BONS DE COMMANDE (GET /api/stock/bons-commande)
 */
async function obtenirBonsCommande(req, res) {
  try {
    const bons = await PurchaseOrder.find()
      .populate('items.productId', 'name unit')
      .sort({ dateEmission: -1 });
    return res.status(200).json(bons);
  } catch (error) {
    return res.status(500).json({ message: "Erreur de récupération." });
  }
}

module.exports = {
  obtenirInventaireGlobal,
  obtenirHistoriqueMouvements,
  creerBonCommande,
  obtenirBonsCommande
};