const Category = require('../../models/category');

async function getAllCategories(req, res) {
  try {
    // Récupération des paramètres de pagination (valeurs par défaut : page 1, 10 éléments par page)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Récupération du terme de recherche si présent (pour l'aligner avec ton champ de recherche front)
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

    // Exécution parallèle pour de meilleures performances (compte total + récupération paginée)
    const [categories, total] = await Promise.all([
      Category.find(queryFilter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Category.countDocuments(queryFilter)
    ]);

    // Déterminer s'il y a d'autres pages après celle-ci
    const hasMore = skip + categories.length < total;

    // Renvoi au format respectant l'interface PaginatedCategoryResponse
    return res.status(200).json({
      categories,
      hasMore,
      total
    });

  } catch (error) {
    console.error("Erreur getAllCategories:", error);
    return res.status(500).json({ 
      message: "Erreur lors de la récupération des catégories." 
    });
  }
}

// 2. Créer une nouvelle catégorie (avec sécurité anti-doublon)
async function createCategory(req, res) {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Le nom de la catégorie est obligatoire." });
    }

    // Sécurité : On vérifie si le nom existe déjà (insensible à la casse)
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      deletedAt: null
    });

    if (existingCategory) {
      return res.status(400).json({ message: "Cette catégorie existe déjà." });
    }

    const newCategory = new Category({
      name: name.trim(),
      description: description ? description.trim() : ''
    });

    await newCategory.save();
    return res.status(201).json(newCategory);
  } catch (error) {
    console.error("Erreur createCategory:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la catégorie." });
  }
}

// 3. Modifier une catégorie
async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, description, active } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Le nom de la catégorie ne peut pas être vide." });
    }

    // Sécurité : Vérifier si le nouveau nom n'est pas déjà pris par UNE AUTRE catégorie
    const duplicate = await Category.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      deletedAt: null
    });

    if (duplicate) {
      return res.status(400).json({ message: "Un autre groupe porte déjà ce nom." });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        name: name.trim(), 
        description: description ? description.trim() : '',
        active: active !== undefined ? active : true
      },
      { new: true } // Renvoie l'objet modifié
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    return res.status(200).json(updatedCategory);
  } catch (error) {
    console.error("Erreur updateCategory:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la catégorie." });
  }
}

// 4. Supprimer une catégorie
async function deleteCategory(req, res) {
  try {
    const { id } = req.params;

    // TODO Optionnel : Vérifier si des produits sont liés à cette catégorie avant de supprimer !
    // const productsLinked = await Product.countDocuments({ cat: id });
    // if (productsLinked > 0) { return res.status(400).json({ message: "Impossible de supprimer : des produits y sont rattachés." }); }

    const deletedCategory = await Category.findByIdAndUpdate(
            req.params.id,
            { 
                $set: { deletedAt: new Date() } 
            },
            { new: true } 
        );

    if (!deletedCategory) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    return res.status(200).json({ message: "Catégorie supprimée avec succès." });
  } catch (error) {
    console.error("Erreur deleteCategory:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression." });
  }
}

module.exports = {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory
};