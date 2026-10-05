const { LotStockFifo } = require('../../models/stock');
const { TYPES_PACK, calculerCompositionPack } = require('../../services/compositionService');

// Simulateurs en lecture seule (conception, questions 9 à 14) : rien n'est enregistré, aucun prix n'est modifié.
// Logique de composition : celle du calcul de pack existant (services/compositionService.js).

const arrondir = (n) => Math.round(n);
const nombrePositif = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/**
 * Prix d'achat réel par produit : moyenne des lots en stock pondérée par la quantité restante,
 * sinon prix du dernier lot reçu. Absent si le produit n'a jamais été acheté.
 */
async function prixAchatReels() {
  const [enStock, derniers] = await Promise.all([
    LotStockFifo.aggregate([
      { $match: { deletedAt: null, quantiteRestante: { $gt: 0 } } },
      { $group: { _id: '$product', valeur: { $sum: { $multiply: ['$quantiteRestante', '$prixAchatUnitaire'] } }, quantite: { $sum: '$quantiteRestante' } } }
    ]),
    LotStockFifo.aggregate([
      { $match: { deletedAt: null } },
      { $sort: { dateReception: -1 } },
      { $group: { _id: '$product', prix: { $first: '$prixAchatUnitaire' } } }
    ])
  ]);
  const prix = new Map(derniers.map(d => [String(d._id), d.prix]));
  for (const s of enStock) prix.set(String(s._id), s.valeur / s.quantite);
  return prix;
}

async function stockDisponible() {
  const stock = await LotStockFifo.aggregate([
    { $match: { deletedAt: null, quantiteRestante: { $gt: 0 } } },
    { $group: { _id: '$product', quantite: { $sum: '$quantiteRestante' } } }
  ]);
  return new Map(stock.map(s => [String(s._id), s.quantite]));
}

// GET /api/admin/simulateurs/pack/:type?livraison=&emballage=&commission=
// Coût et marge d'un pack, au prix catalogue et au prix d'achat réel, côte à côte
async function simulerPack(req, res) {
  try {
    const type = String(req.params.type).toLowerCase();
    if (!TYPES_PACK.includes(type)) return res.status(400).json({ message: "Type de pack invalide." });

    const composition = await calculerCompositionPack(type);
    if (!composition) return res.status(404).json({ message: "Formule introuvable ou inactive." });

    const prixReels = await prixAchatReels();
    const prixVente = composition.formule.prixCommercial ?? composition.formule.prixActuel;
    const frais = {
      livraison: nombrePositif(req.query.livraison),
      emballage: nombrePositif(req.query.emballage),
      // Commission Mobile Money en % du prix de vente
      commission: arrondir(prixVente * Math.min(nombrePositif(req.query.commission), 100) / 100)
    };
    const totalFrais = frais.livraison + frais.emballage + frais.commission;

    const lignes = composition.items.filter(i => i.quantity > 0).map(i => {
      const reel = prixReels.get(String(i.productId));
      return {
        produit: i.name,
        unite: i.unit,
        quantite: i.quantity,
        prixCatalogue: i.priceUnit,
        coutCatalogue: i.totalPrice === null ? null : arrondir(i.totalPrice),
        prixAchatReel: reel !== undefined ? arrondir(reel) : null,
        // Sans achat enregistré, le coût réel reprend le prix catalogue (signalé à l'écran)
        coutReel: (reel ?? i.priceUnit) === null ? null : arrondir(i.quantity * (reel ?? i.priceUnit))
      };
    });

    const coutCatalogue = lignes.reduce((s, l) => s + (l.coutCatalogue ?? 0), 0);
    const coutReel = lignes.reduce((s, l) => s + (l.coutReel ?? 0), 0);
    const margeCatalogue = prixVente - coutCatalogue - totalFrais;
    const margeReelle = prixVente - coutReel - totalFrais;

    return res.status(200).json({
      formule: { nom: composition.formule.nom, slug: composition.formule.slug, prixVente },
      lignes,
      produitsSansAchat: lignes.filter(l => l.prixAchatReel === null).length,
      prixManquants: lignes.filter(l => l.coutCatalogue === null).length, // Prix à renseigner : coût incomplet
      frais,
      totaux: {
        coutCatalogue, coutReel, frais: totalFrais,
        margeCatalogue, margeReelle,
        tauxMargeCatalogue: prixVente ? Math.round((margeCatalogue / prixVente) * 1000) / 10 : 0,
        tauxMargeReelle: prixVente ? Math.round((margeReelle / prixVente) * 1000) / 10 : 0
      }
    });
  } catch (error) {
    console.error("Erreur simulerPack:", error);
    return res.status(500).json({ message: "Erreur lors de la simulation du pack." });
  }
}

// POST /api/admin/simulateurs/achats  { quantites: { essentiel: 10, equilibre: 5, ... } }
// Prévision d'achats pour N commandes : besoins par produit, stock disponible, quantité et coût à acheter
async function simulerAchats(req, res) {
  try {
    const quantites = req.body?.quantites || {};
    const packs = TYPES_PACK.map(t => ({ type: t, nombre: Math.min(Math.floor(nombrePositif(quantites[t])), 10000) })).filter(p => p.nombre > 0);
    if (!packs.length) return res.status(400).json({ message: "Indiquez au moins une commande à simuler." });

    const [prixReels, stock] = await Promise.all([prixAchatReels(), stockDisponible()]);
    const besoins = new Map();

    for (const { type, nombre } of packs) {
      const composition = await calculerCompositionPack(type);
      if (!composition) continue;
      for (const item of composition.items.filter(i => i.quantity > 0)) {
        const cle = String(item.productId);
        const ligne = besoins.get(cle) || { produit: item.name, unite: item.unit, besoin: 0, prixCatalogue: item.priceUnit };
        ligne.besoin += item.quantity * nombre;
        besoins.set(cle, ligne);
      }
    }

    const lignes = [...besoins.entries()].map(([id, l]) => {
      const disponible = stock.get(id) || 0;
      const aAcheter = Math.max(0, l.besoin - disponible);
      const prix = prixReels.get(id) ?? l.prixCatalogue;
      return { ...l, besoin: Math.round(l.besoin * 100) / 100, disponible, aAcheter: Math.round(aAcheter * 100) / 100, prixEstime: arrondir(prix), coutEstime: arrondir(aAcheter * prix) };
    }).sort((a, b) => b.coutEstime - a.coutEstime || a.produit.localeCompare(b.produit, 'fr'));

    return res.status(200).json({
      packs,
      lignes,
      coutTotal: lignes.reduce((s, l) => s + l.coutEstime, 0),
      produitsARacheter: lignes.filter(l => l.aAcheter > 0).length
    });
  } catch (error) {
    console.error("Erreur simulerAchats:", error);
    return res.status(500).json({ message: "Erreur lors de la prévision d'achats." });
  }
}

module.exports = { simulerPack, simulerAchats };
