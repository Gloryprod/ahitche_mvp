const CompositionRule = require('../../models/compositionRule');

// 1. Récupérer toutes les règles (Paginées et Filtrées)
async function getAllRules(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // Filtre de base : Exclure les éléments supprimés logiquement
    const queryFilter = {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    };

    // Recherche par nom si un terme est fourni
    if (search.trim() !== '') {
      queryFilter.name = { $regex: search.trim(), $options: 'i' };
    }

    // Exécution parallèle pour maximiser les performances
    const [rules, total] = await Promise.all([
      CompositionRule.find(queryFilter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      CompositionRule.countDocuments(queryFilter)
    ]);

    const hasMore = skip + rules.length < total;

    return res.status(200).json({
      rules,
      hasMore,
      total
    });
  } catch (error) {
    console.error("Erreur getAllRules:", error);
    return res.status(500).json({ 
      message: "Erreur lors de la récupération des règles de composition." 
    });
  }
}

// 2. Créer une nouvelle règle de composition
async function createRule(req, res) {
  try {
    const { name, multiplierEquilibre, multiplierConfort, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Le nom de la règle est obligatoire." });
    }

    if (multiplierEquilibre === undefined || multiplierConfort === undefined) {
      return res.status(400).json({ message: "Les multiplicateurs Équilibré et Confort sont obligatoires." });
    }

    // Anti-doublon sur le nom
    const existingRule = await CompositionRule.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      deletedAt: null
    });

    if (existingRule) {
      return res.status(400).json({ message: "Une règle avec ce nom existe déjà." });
    }

    const newRule = new CompositionRule({
      name: name.trim(),
      multiplierEquilibre: Number(multiplierEquilibre),
      multiplierConfort: Number(multiplierConfort),
      description: description ? description.trim() : ''
    });

    await newRule.save();
    return res.status(201).json(newRule);
  } catch (error) {
    console.error("Erreur createRule:", error);
    return res.status(500).json({ message: "Erreur lors de la création de la règle." });
  }
}

// 3. Modifier une règle existante
async function updateRule(req, res) {
  try {
    const { id } = req.params;
    const { name, multiplierEquilibre, multiplierConfort, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Le nom de la règle ne peut pas être vide." });
    }

    // Vérifier si le nouveau nom n'est pas pris par une autre règle active
    const duplicate = await CompositionRule.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      deletedAt: null
    });

    if (duplicate) {
      return res.status(400).json({ message: "Une autre règle porte déjà ce nom." });
    }

    const updatedRule = await CompositionRule.findByIdAndUpdate(
      id,
      { 
        name: name.trim(), 
        multiplierEquilibre: Number(multiplierEquilibre),
        multiplierConfort: Number(multiplierConfort),
        description: description ? description.trim() : ''
      },
      { new: true } // Retourne l'objet mis à jour
    );

    if (!updatedRule) {
      return res.status(404).json({ message: "Règle introuvable." });
    }

    return res.status(200).json(updatedRule);
  } catch (error) {
    console.error("Erreur updateRule:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la règle." });
  }
}

// 4. Suppression logique (Soft Delete)
async function deleteRule(req, res) {
  try {
    const { id } = req.params;

    // Optionnel : Tu pourras ajouter plus tard une vérification dans le modèle Product 
    // pour s'assurer qu'aucun produit n'est lié à cette règle avant de la flagger comme supprimée.

    const deletedRule = await CompositionRule.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!deletedRule) {
      return res.status(404).json({ message: "Règle introuvable." });
    }

    return res.status(200).json({ message: "Règle supprimée avec succès." });
  } catch (error) {
    console.error("Erreur deleteRule:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression." });
  }
}

module.exports = {
  getAllRules,
  createRule,
  updateRule,
  deleteRule
};