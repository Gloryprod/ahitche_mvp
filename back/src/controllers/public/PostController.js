const Post = require('../../models/post');
const { echapperRegex } = require('../../utils/texte');

const SITE = 'https://ahitchebj.com';
const NON_SUPPRIME = { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] };
const TYPES = ['article', 'blog', 'video'];

// Liste publique : seulement les contenus publiés (les brouillons ne sortent jamais par cette route)
async function getPosts(req, res) {
  try {
    const { type, category, search } = req.query;
    const filtres = [NON_SUPPRIME, { isPublished: true }];
    if (TYPES.includes(type)) filtres.push({ type });
    if (typeof category === 'string' && category) filtres.push({ category });
    if (typeof search === 'string' && search.trim()) {
      const motif = new RegExp(echapperRegex(search.trim()), 'i');
      filtres.push({ $or: [{ title: motif }, { category: motif }, { summary: motif }] });
    }
    const query = { $and: filtres };

    const pageNumber = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNumber = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const [total, posts] = await Promise.all([
      Post.countDocuments(query),
      Post.find(query).populate('author', 'nom prenom').sort({ createdAt: -1 }).skip(skip).limit(limitNumber)
    ]);

    res.status(200).json({ success: true, total, page: pageNumber, limit: limitNumber, hasMore: skip + posts.length < total, posts });
  } catch (error) {
    console.error('Erreur getPosts (public):', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des contenus.' });
  }
}

// Un contenu publié, par son adresse (/blog/:slug) : page propre, partageable et indexable
async function getPostParSlug(req, res) {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const post = await Post.findOne({ $and: [NON_SUPPRIME, { slug, isPublished: true }] }).populate('author', 'nom prenom');
    if (!post) return res.status(404).json({ message: 'Contenu introuvable.' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ post });
  } catch (error) {
    console.error('Erreur getPostParSlug (public):', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la récupération du contenu.' });
  }
}

// Plan du site pour les moteurs de recherche : pages publiques et contenus publiés (servi sur ahitchebj.com/sitemap.xml)
async function planDuSite(req, res) {
  try {
    const posts = await Post.find({ $and: [NON_SUPPRIME, { isPublished: true }] }).select('slug updatedAt').sort({ updatedAt: -1 }).lean();
    const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = (chemin, frequence, priorite, modifie) =>
      `  <url>\n    <loc>${echapper(SITE + chemin)}</loc>\n${modifie ? `    <lastmod>${new Date(modifie).toISOString().slice(0, 10)}</lastmod>\n` : ''}    <changefreq>${frequence}</changefreq>\n    <priority>${priorite}</priority>\n  </url>`;
    const urls = [
      url('/', 'weekly', '1.0'),
      url('/blog', 'weekly', '0.6', posts[0]?.updatedAt),
      ...posts.map(p => url(`/blog/${encodeURIComponent(p.slug)}`, 'monthly', '0.5', p.updatedAt)),
      url('/mentions-legales', 'yearly', '0.2')
    ];
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  } catch (error) {
    console.error('Erreur planDuSite:', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la génération du plan du site.' });
  }
}

module.exports = { getPosts, getPostParSlug, planDuSite };
