const Post = require('../../models/post');

// Obtenir tous les posts (avec filtres côté public/admin)
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

// Créer un nouveau post (Admin uniquement)
async function createPost(req, res) {

  console.log("createPost req.body:", req); // Log pour vérifier le contenu de req.body
  try {
    const newPost = new Post({
      ...req.body,
      author: req.user.id,
      publishedAt: req.body.isPublished ? new Date() : null
    });

    await newPost.save();
    res.status(201).json({ success: true, data: newPost });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Mettre à jour / Publier un post (Admin uniquement)
async function updatePost(req, res) {
  try {
    if (req.body.isPublished && !req.body.publishedAt) {
      req.body.publishedAt = new Date();
    }

    const post = await Post.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Contenu non trouvé' });
    }

    res.status(200).json({ success: true, data: post });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

async function deletePost(req, res) {
  try {
    const { id } = req.params;

    const deletedPost = await Post.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!deletedPost) {
      return res.status(404).json({ success: false, message: 'Contenu non trouvé' });
    }

    res.status(200).json({ success: true, message: 'Contenu supprimé avec succès' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

module.exports = {
  getPosts,
  createPost,
  updatePost,
  deletePost
};