const mongoose = require('mongoose');
const Product = require('../../models/product');
const { TYPES_PRODUIT, TYPES_VENDUS, STATUTS_PRODUIT, PACKS } = require('../../models/product');
const { LotStockFifo } = require('../../models/stock');
const { echapperRegex } = require('../../utils/texte');
const { journaliser } = require('../../services/journalService');
const { ACCES } = require('../../config/roles');

// Champs suivis au journal : prix, prix VIP, quantités par pack, statut, seuil d'alerte, type
function differences(avant, apres) {
  const lignes = [];
  const comparer = (libelle, a, b) => { if ((a ?? null) !== (b ?? null)) lignes.push(`${libelle} : ${a ?? 'vide'} → ${b ?? 'vide'}`); };
  comparer('prix', avant.priceUnit, apres.priceUnit);
  comparer('prix VIP', avant.prixVip, apres.prixVip);
  for (const pack of PACKS) comparer(`quantité ${pack}`, avant.quantites?.[pack], apres.quantites?.[pack]);
  comparer('statut', avant.statut, apres.statut);
  comparer('seuil', avant.seuilAlerte, apres.seuilAlerte);
  comparer('type', avant.type, apres.type);
  comparer('affiché cette semaine', avant.cetteSemaine ? 'oui' : 'non', apres.cetteSemaine ? 'oui' : 'non');
  return lignes;
}

// Nombre positif ou vide (null) : une cellule vide n'est jamais transformée en 0
function nombreOuVide(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return { valeur: null };
  const n = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? { valeur: n } : { erreur: true };
}

const idOuVide = (v) => (v && mongoose.isValidObjectId(v) ? v : null);
const PRIX_VIP_MAX = 10000000; // Garde-fou de saisie (FCFA)

// Valide et normalise un produit saisi dans l'admin.
// Type : un type fourni mais inconnu est refusé ; un type absent garde celui du produit modifié (typeExistant) et vaut
// « base fixe » à la création (comportement de l'écran actuel).
function lireProduit(body, typeExistant = null) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
  if (!name || !unit) return { erreur: "Le nom et l'unité du produit sont obligatoires." };

  const typeFourni = body.type !== undefined && body.type !== null && body.type !== '';
  if (typeFourni && !TYPES_PRODUIT.includes(body.type)) {
    return { erreur: 'Type de produit inconnu : base fixe, extra, matière première ou fourniture.' };
  }
  const type = typeFourni ? body.type : (typeExistant || 'base fixe');
  const statut = STATUTS_PRODUIT.includes(body.statut) ? body.statut : 'disponible';

  const prix = nombreOuVide(body.priceUnit);
  const seuil = nombreOuVide(body.seuilAlerte);
  if (prix.erreur) return { erreur: 'Prix unitaire invalide.' };
  if (seuil.erreur) return { erreur: "Seuil d'alerte invalide." };
  // Prix VIP (achats libres) : absent du formulaire = inchangé (un écran sans ce champ ne l'efface jamais) ;
  // vide = produit retiré des achats libres
  const prixVipFourni = body.prixVip !== undefined;
  const prixVip = nombreOuVide(body.prixVip);
  if (prixVip.erreur || (prixVip.valeur !== null && prixVip.valeur > PRIX_VIP_MAX)) return { erreur: 'Prix VIP invalide (FCFA, 0 ou plus, ou vide).' };

  // Matière première et fourniture (type résolu ci-dessus) : jamais vendues, donc hors packs et jamais sur le site
  const vendu = TYPES_VENDUS.includes(type);
  const quantites = {};
  for (const pack of PACKS) {
    const q = nombreOuVide(body.quantites?.[pack]);
    if (q.erreur) return { erreur: `Quantité ${pack} invalide.` };
    quantites[pack] = vendu ? q.valeur : null;
  }

  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim().toUpperCase() : null;

  return {
    produit: {
      reference, name, unit, type, statut, quantites,
      category: idOuVide(body.category),
      compositionRule: idOuVide(body.compositionRule),
      priceUnit: prix.valeur,
      seuilAlerte: seuil.valeur,
      commentaire: typeof body.commentaire === 'string' ? body.commentaire.trim().slice(0, 500) : '',
      ...(vendu ? {} : { cetteSemaine: false }),
      // Matière première et fourniture : jamais proposées en achat libre
      ...(!vendu ? { prixVip: null } : prixVipFourni ? { prixVip: prixVip.valeur === null ? null : Math.round(prixVip.valeur) } : {})
    }
  };
}

// Le prix VIP n'est lu que par les rôles de la section « vip » (admin, coordinateur)
const voitPrixVip = (req) => ACCES.vip.lecture.includes(req.user?.role);

// 1. Récupérer tous les produits (paginés, filtrés et peuplés)
async function getAllProducts(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 200);
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const queryFilter = { deletedAt: null };
    if (search) {
      const motif = { $regex: echapperRegex(search), $options: 'i' };
      queryFilter.$or = [{ name: motif }, { reference: motif }];
    }
    if (TYPES_PRODUIT.includes(req.query.type)) queryFilter.type = req.query.type;

    const requete = Product.find(queryFilter)
      .populate('category', 'name')
      .populate('compositionRule', 'name multiplierEquilibre multiplierConfort')
      .sort({ reference: 1, name: 1 })
      .skip(skip)
      .limit(limit);
    if (!voitPrixVip(req)) requete.select('-prixVip');
    const [products, total] = await Promise.all([requete, Product.countDocuments(queryFilter)]);

    return res.status(200).json({ products, hasMore: skip + products.length < total, total });
  } catch (error) {
    console.error("Erreur getAllProducts:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des produits." });
  }
}

// 2. Créer un nouveau produit
async function createProduct(req, res) {
  try {
    const { produit, erreur } = lireProduit(req.body || {});
    if (erreur) return res.status(400).json({ message: erreur });
    if (produit.reference && await Product.exists({ reference: produit.reference, deletedAt: null })) {
      return res.status(400).json({ message: `La référence ${produit.reference} existe déjà.` });
    }
    const newProduct = await Product.create(produit);
    await journaliser(req, { action: 'Création', entite: 'Produit', entiteId: newProduct._id, resume: `Produit ${[newProduct.reference, newProduct.name].filter(Boolean).join(' · ')} créé (prix ${newProduct.priceUnit ?? 'vide'}${newProduct.prixVip !== null && newProduct.prixVip !== undefined ? `, prix VIP ${newProduct.prixVip}` : ''})` });
    return res.status(201).json(newProduct);
  } catch (error) {
    console.error("Erreur createProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la création du produit." });
  }
}

// 3. Modifier un produit
async function updateProduct(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Produit introuvable." });
    // Le produit d'abord : un type absent du formulaire garde le type existant
    const avant = await Product.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!avant) return res.status(404).json({ message: "Produit introuvable." });
    const { produit, erreur } = lireProduit(req.body || {}, avant.type);
    if (erreur) return res.status(400).json({ message: erreur });
    if (produit.reference && await Product.exists({ reference: produit.reference, deletedAt: null, _id: { $ne: req.params.id } })) {
      return res.status(400).json({ message: `La référence ${produit.reference} existe déjà.` });
    }
    const updatedProduct = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, produit, { returnDocument: 'after', runValidators: true });
    if (!updatedProduct) return res.status(404).json({ message: "Produit introuvable." });
    const changements = differences(avant, updatedProduct.toObject());
    if (changements.length) {
      await journaliser(req, {
        action: 'Modification', entite: 'Produit', entiteId: updatedProduct._id,
        resume: `Produit ${[updatedProduct.reference, updatedProduct.name].filter(Boolean).join(' · ')} : ${changements.join(' ; ')}`,
        avant: { priceUnit: avant.priceUnit, prixVip: avant.prixVip ?? null, quantites: avant.quantites, statut: avant.statut, seuilAlerte: avant.seuilAlerte, type: avant.type, cetteSemaine: !!avant.cetteSemaine },
        apres: { priceUnit: updatedProduct.priceUnit, prixVip: updatedProduct.prixVip ?? null, quantites: updatedProduct.quantites, statut: updatedProduct.statut, seuilAlerte: updatedProduct.seuilAlerte, type: updatedProduct.type, cetteSemaine: !!updatedProduct.cetteSemaine }
      });
    }
    return res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Erreur updateProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du produit." });
  }
}

// 4. Suppression logique, refusée tant que le produit a des lots actifs (stock restant ou lot à compter) :
// l'inventaire ne montre que les produits du catalogue, ce stock disparaîtrait de l'inventaire
async function deleteProduct(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Produit introuvable." });
    const lotsActifs = await LotStockFifo.countDocuments({
      product: req.params.id, deletedAt: null, $or: [{ quantiteRestante: { $gt: 0 } }, { quantiteRestante: null }]
    });
    if (lotsActifs) {
      return res.status(400).json({ message: `Ce produit a encore ${lotsActifs} lot(s) en stock : sortez, corrigez ou archivez ce stock avant de le retirer du catalogue.` });
    }
    const deletedProduct = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { deletedAt: new Date() }, { returnDocument: 'after' });
    if (!deletedProduct) return res.status(404).json({ message: "Produit introuvable." });
    await journaliser(req, { action: 'Suppression', entite: 'Produit', entiteId: deletedProduct._id, resume: `Produit ${[deletedProduct.reference, deletedProduct.name].filter(Boolean).join(' · ')} supprimé` });
    return res.status(200).json({ message: "Produit supprimé avec succès." });
  } catch (error) {
    console.error("Erreur deleteProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du produit." });
  }
}

module.exports = { getAllProducts, createProduct, updateProduct, deleteProduct, lireProduit };
