const Product = require('../../models/product');

// 1. Récupérer tous les produits (Paginés, Filtrés et Populés)
async function getAllProducts(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    const queryFilter = {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    };

    if (search.trim() !== '') {
      queryFilter.name = { $regex: search.trim(), $options: 'i' };
    }

    // On lance la recherche et le compte en parallèle
    const [products, total] = await Promise.all([
      Product.find(queryFilter)
        .populate('category', 'name') // Récupère uniquement le nom de la catégorie
        .populate('compositionRule', 'name multiplierEquilibre multiplierConfort') // Récupère la règle et ses coefficients
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(queryFilter)
    ]);

    const hasMore = skip + products.length < total;

    return res.status(200).json({
      products,
      hasMore,
      total
    });
  } catch (error) {
    console.error("Erreur getAllProducts:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des produits." });
  }
}

// 2. Créer un nouveau produit
async function createProduct(req, res) {
  try {
    const { name, category, compositionRule, baseQuantity, unit, priceUnit } = req.body;

    if (!name || !category || !compositionRule || !baseQuantity || !unit || !priceUnit) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires." });
    }

    const newProduct = new Product({
      name: name.trim(),
      category,
      compositionRule,
      baseQuantity: Number(baseQuantity),
      unit: unit.trim(),
      priceUnit: Number(priceUnit)
    });

    await newProduct.save();
    return res.status(201).json(newProduct);
  } catch (error) {
    console.error("Erreur createProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la création du produit." });
  }
}

// 3. Modifier un produit
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, category, compositionRule, baseQuantity, unit, priceUnit } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        category,
        compositionRule,
        baseQuantity: Number(baseQuantity),
        unit: unit.trim(),
        priceUnit: Number(priceUnit)
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    return res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Erreur updateProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du produit." });
  }
}

// 4. Suppression logique (Soft Delete)
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!deletedProduct) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    return res.status(200).json({ message: "Produit supprimé avec succès." });
  } catch (error) {
    console.error("Erreur deleteProduct:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du produit." });
  }
}

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct
};