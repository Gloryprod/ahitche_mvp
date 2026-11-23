const mongoose = require('mongoose');
const Product = require('../../models/product');
const { ReponseEnquete, FORMULES_ENQUETE, PRODUITS_ENQUETE } = require('../../models/reponseEnquete');
const { lireDate } = require('../../utils/dates');
const { journaliser } = require('../../services/journalService');

// Enquête de satisfaction, back-office (section « enquete » : lecture admin et coordinateur, suppression admin).
// Contrat : docs-internes/enquete/CONTRAT.md.

const PAR_PAGE = 20;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const UN_JOUR = 24 * 3600 * 1000;

// Période ?du=&au= (jours compris, heure de Cotonou, UTC+1 toute l'année) ; null si une date est invalide
function filtrePeriode(query) {
  const createdAt = {};
  for (const [cle, operateur, decalage] of [['du', '$gte', 0], ['au', '$lt', UN_JOUR]]) {
    const v = query[cle];
    if (v === undefined || v === '') continue;
    const debut = typeof v === 'string' && JOUR.test(v) ? lireDate(`${v}T00:00:00+01:00`) : null;
    if (!debut) return null;
    createdAt[operateur] = new Date(debut.getTime() + decalage);
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
}

function moyenne(reponses, champ) {
  const notes = reponses.map(r => r[champ]).filter(Number.isInteger);
  return notes.length ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10 : null;
}

// GET /api/admin/enquete/synthese?du=AAAA-MM-JJ&au=AAAA-MM-JJ
async function synthese(req, res) {
  try {
    const filtre = filtrePeriode(req.query);
    if (!filtre) return res.status(400).json({ message: 'Date invalide (format AAAA-MM-JJ).' });
    // shortcut: toutes les réponses de la période en mémoire (quelques centaines par an, effacées après un an) ; passer à une agrégation au-delà de quelques milliers
    const reponses = await ReponseEnquete.find(filtre).sort({ createdAt: -1 }).lean();

    const parFormule = Object.fromEntries(FORMULES_ENQUETE.map(f => [f, 0]));
    for (const r of reponses) if (r.formule) parFormule[r.formule]++;

    // Une réponse compte une fois par produit et par avis : un produit voulu « en plus » dans la question courte
    // et dans le détail d'une même réponse compte 1 ; cité « en plus » par deux réponses, il compte 2.
    const parProduit = new Map();
    const compte = (id) => {
      if (!parProduit.has(id)) parProduit.set(id, { plus: 0, moins: 0, bien: 0, autre: 0, remplacements: [] });
      return parProduit.get(id);
    };
    for (const r of reponses) {
      const avis = new Set([
        ...r.produitsPlus.map(id => `${id}|plus`),
        ...r.produitsMoins.map(id => `${id}|moins`),
        ...r.detail.map(d => `${d.produit}|${d.avis}`),
      ]);
      for (const cle of avis) { const [id, a] = cle.split('|'); compte(id)[a]++; }
      for (const d of r.detail) if (d.avis === 'autre' && d.remplacement) compte(String(d.produit)).remplacements.push(d.remplacement);
    }
    // Tous les produits de base, même jamais cités, et les produits cités supprimés depuis
    const produits = await Product.find({ $or: [PRODUITS_ENQUETE, { _id: { $in: [...parProduit.keys()] } }] }).select('name').lean();

    const textes = (champ) => reponses.filter(r => r[champ]).map(r => ({ texte: r[champ], date: r.createdAt }));
    return res.status(200).json({
      total: reponses.length,
      moyennes: { globale: moyenne(reponses, 'noteGlobale'), livraison: moyenne(reponses, 'noteLivraison'), qualite: moyenne(reponses, 'noteQualite') },
      parFormule,
      produits: produits
        .map(p => ({ id: p._id, nom: p.name, ...(parProduit.get(String(p._id)) || { plus: 0, moins: 0, bien: 0, autre: 0, remplacements: [] }) }))
        .sort((a, b) => b.plus - a.plus || a.nom.localeCompare(b.nom, 'fr')),
      produitsSouhaites: textes('produitSouhaite'),
      suggestions: textes('suggestion'),
    });
  } catch (error) {
    console.error('Erreur synthese (enquête):', error);
    return res.status(500).json({ message: "Erreur lors du chargement de la synthèse de l'enquête." });
  }
}

const nom = (p) => p?.name ?? 'Produit supprimé';

// GET /api/admin/enquete/reponses?page=1 : 20 par page, plus récentes d'abord
async function listerReponses(req, res) {
  try {
    const page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
    const [total, reponses] = await Promise.all([
      ReponseEnquete.countDocuments(),
      ReponseEnquete.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAR_PAGE).limit(PAR_PAGE)
        .populate('produitsPlus produitsMoins detail.produit', 'name').lean(),
    ]);
    return res.status(200).json({
      total, page,
      reponses: reponses.map(r => ({
        id: r._id, date: r.createdAt,
        noteGlobale: r.noteGlobale, noteLivraison: r.noteLivraison ?? null, noteQualite: r.noteQualite ?? null,
        formule: r.formule ?? null,
        produitsPlus: r.produitsPlus.map(nom), produitsMoins: r.produitsMoins.map(nom),
        produitSouhaite: r.produitSouhaite ?? '',
        detail: r.detail.map(d => ({ nom: nom(d.produit), avis: d.avis, remplacement: d.remplacement ?? '' })),
        suggestion: r.suggestion ?? '',
        contact: r.contact
          ? { prenom: r.contact.prenom ?? '', telephone: r.contact.telephone ?? '', accordRecontact: r.contact.accordRecontact === true }
          : null,
      })),
    });
  } catch (error) {
    console.error('Erreur listerReponses (enquête):', error);
    return res.status(500).json({ message: "Erreur lors du chargement des réponses de l'enquête." });
  }
}

// DELETE /api/admin/enquete/:id -> 204 (sur demande du client, ou réponse indésirable)
async function supprimerReponse(req, res) {
  try {
    const reponse = mongoose.isValidObjectId(req.params.id) ? await ReponseEnquete.findByIdAndDelete(req.params.id).lean() : null;
    if (!reponse) return res.status(404).json({ message: 'Réponse introuvable.' });
    const date = new Date(reponse.createdAt).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' });
    // Ni prénom ni téléphone dans le journal
    await journaliser(req, { action: 'Suppression', entite: "Réponse à l'enquête", entiteId: reponse._id, resume: `Réponse à l'enquête du ${date} supprimée` });
    return res.status(204).end();
  } catch (error) {
    console.error('Erreur supprimerReponse (enquête):', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la réponse.' });
  }
}

module.exports = { synthese, listerReponses, supprimerReponse };
