const mongoose = require('mongoose');
const Product = require('../../models/product');
const { TYPES_PRODUIT, STATUTS_PRODUIT, PACKS } = require('../../models/product');
const { echapperRegex } = require('../../utils/texte');
const { journaliser } = require('../../services/journalService');

// Champs suivis au journal : prix, quantités par pack, statut, seuil d'alerte, type
function differences(avant, apres) {
  const lignes = [];
  const comparer = (libelle, a, b) => { if ((a ?? null) !== (b ?? null)) lignes.push(`${libelle} : ${a ?? 'vide'} → ${b ?? 'vide'}`); };
  comparer('prix', avant.priceUnit, apres.priceUnit);
  for (const pack of PACKS) comparer(`quantité ${pack}`, avant.quantites?.[pack], apres.quantites?.[pack]);
  comparer('statut', avant.statut, apres.statut);
  comparer('seuil', avant.seuilAlerte, apres.seuilAlerte);
  comparer('type', avant.type, apres.type);
  return lignes;
}

// Nombre positif ou vide (null) : une cellule vide n'est jamais transformée en 0
function nombreOuVide(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return { valeur: null };
  const n = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? { valeur: n } : { erreur: true };
}

const idOuVide = (v) => (v && mongoose.isValidObjectId(v) ? v : null);

// Valide et normalise un produit saisi dans l'admin
function lireProduit(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
  if (!name || !unit) return { erreur: "Le nom et l'unité du produit sont obligatoires." };

  const type = TYPES_PRODUIT.includes(body.type) ? body.type : 'base fixe';
  const statut = STATUTS_PRODUIT.includes(body.statut) ? body.statut : 'disponible';

  const prix = nombreOuVide(body.priceUnit);
  const seuil = nombreOuVide(body.seuilAlerte);
  if (prix.erreur) return { erreur: 'Prix unitaire invalide.' };
  if (seuil.erreur) return { erreur: "Seuil d'alerte invalide." };

  const quantites = {};
  for (const pack of PACKS) {
    const q = nombreOuVide(body.quantites?.[pack]);
    if (q.erreur) return { erreur: `Quantité ${pack} invalide.` };
    quantites[pack] = q.valeur;
  }

  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim().toUpperCase() : null;

  return {
    produit: {
      reference, name, unit, type, statut, quantites,
      category: idOuVide(body.category),
      compositionRule: idOuVide(body.compositionRule),
      priceUnit: prix.valeur,
      seuilAlerte: seuil.valeur,
      commentaire: typeof body.commentaire === 'string' ? body.commentaire.trim().slice(0, 500) : ''
    }
  };
}

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

    const [products, total] = await Promise.all([
      Product.find(queryFilter)
        .populate('category', 'name')
        .populate('compositionRule', 'name multiplierEquilibre multiplierConfort')
        .sort({ reference: 1, name: 1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(queryFilter)
    ]);

    return res.status(200).json({ products, hasMore: skip + products.length < total, total });
  } catch (error) {
    console.error("Erreur getAllProducts:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des produits." });
  }
}

// 2. Créer un nouveau produit
async function createProduct(req, res) {
  try {
    const { produit, erreur } = lireProduit(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    if (produit.reference && await Product.exists({ reference: produit.reference, deletedAt: null })) {
      return res.status(400).json({ message: `La référence ${produit.reference} existe déjà.` });
    }
    const newProduct = await Product.create(produit);
    await journaliser(req, { action: 'Création', entite: 'Produit', entiteId: newProduct._id, resume: `Produit ${[newProduct.reference, newProduct.name].filter(Boolean).join(' · ')} créé (prix ${newProduct.priceUnit ?? 'vide'})` });
    return res.status(201).json(newProduct);
  } catch (error) {
    console.error("Erreur createProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la création du produit." });
  }
}

// 3. Modifier un produit
async function updateProduct(req, res) {
  try {
    const { produit, erreur } = lireProduit(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    if (produit.reference && await Product.exists({ reference: produit.reference, deletedAt: null, _id: { $ne: req.params.id } })) {
      return res.status(400).json({ message: `La référence ${produit.reference} existe déjà.` });
    }
    const avant = await Product.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!avant) return res.status(404).json({ message: "Produit introuvable." });
    const updatedProduct = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, produit, { new: true, runValidators: true });
    if (!updatedProduct) return res.status(404).json({ message: "Produit introuvable." });
    const changements = differences(avant, updatedProduct.toObject());
    if (changements.length) {
      await journaliser(req, {
        action: 'Modification', entite: 'Produit', entiteId: updatedProduct._id,
        resume: `Produit ${[updatedProduct.reference, updatedProduct.name].filter(Boolean).join(' · ')} : ${changements.join(' ; ')}`,
        avant: { priceUnit: avant.priceUnit, quantites: avant.quantites, statut: avant.statut, seuilAlerte: avant.seuilAlerte },
        apres: { priceUnit: updatedProduct.priceUnit, quantites: updatedProduct.quantites, statut: updatedProduct.statut, seuilAlerte: updatedProduct.seuilAlerte }
      });
    }
    return res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Erreur updateProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du produit." });
  }
}

// 4. Suppression logique
async function deleteProduct(req, res) {
  try {
    const deletedProduct = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { deletedAt: new Date() }, { new: true });
    if (!deletedProduct) return res.status(404).json({ message: "Produit introuvable." });
    await journaliser(req, { action: 'Suppression', entite: 'Produit', entiteId: deletedProduct._id, resume: `Produit ${[deletedProduct.reference, deletedProduct.name].filter(Boolean).join(' · ')} supprimé` });
    return res.status(200).json({ message: "Produit supprimé avec succès." });
  } catch (error) {
    console.error("Erreur deleteProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du produit." });
  }
}

module.exports = { getAllProducts, createProduct, updateProduct, deleteProduct, lireProduit };
