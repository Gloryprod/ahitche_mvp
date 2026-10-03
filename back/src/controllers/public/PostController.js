const Post = require('../../models/post');

async function getPosts(req, res) {
  try {
    const { type, category, published, search, page = 1, limit = 10 } = req.query;
    
    let query = {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    };

    // Filtres
    if (type) query.type = type;
    if (category) query.category = category;
    if (published === 'true') query.isPublished = true;

    // Recherche par mot-clé (Titre, Catégorie ou Résumé)
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { category: searchRegex },
        { summary: searchRegex },
      ];
    }

    // Calcul des valeurs de pagination
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Exécution des requêtes en parallèle (Total + Données paginées)
    const [total, posts] = await Promise.all([
      Post.countDocuments(query),
      Post.find(query)
        .populate('author', 'nom prenom')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
    ]);

    const hasMore = skip + posts.length < total;

    res.status(200).json({
      success: true,
      total,
      page: pageNumber,
      limit: limitNumber,
      hasMore,
      posts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getPosts,
};