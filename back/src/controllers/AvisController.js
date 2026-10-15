const mongoose = require('mongoose');
const User = require('../models/user');
const Order = require('../models/order');
const { Avis, VERSION_CONSENTEMENT_AVIS } = require('../models/avis');
const { journaliser } = require('../services/journalService');

// Avis clients : le client rédige son avis dans son espace, l'admin le publie (ou le refuse avec un motif).
// Seul un avis « Publié » apparaît sur l'accueil (GET /api/public/avis).

const PRENOM_VALIDE = /^\p{L}[\p{L}' .-]{0,39}$/u;
const QUARTIER_VALIDE = /^[\p{L}\p{N}' .,-]{0,60}$/u;
const TEXTE_MIN = 15;
const TEXTE_MAX = 600;

// Texte d'une saisie : espaces et retours à la ligne ramenés à un seul espace
const nettoyer = (valeur) => (typeof valeur === 'string' ? valeur.replace(/\s+/g, ' ').trim() : '');

const pourClient = (avis) => avis && ({
  prenom: avis.prenom, quartier: avis.quartier, note: avis.note, texte: avis.texte,
  statut: avis.statut, motif: avis.statut === 'Refusé' ? avis.motif : '', modifieLe: avis.updatedAt
});

// ------------------------------------------------------------------
// Espace client
// ------------------------------------------------------------------

// Les avis sont réservés aux clients (pas aux comptes de l'équipe)
async function estClient(req, res) {
  const user = await User.findById(req.user.id).select('role').lean();
  if (!user) {
    res.status(401).json({ message: "Session expirée, reconnectez-vous." });
    return false;
  }
  if (user.role !== 'user') {
    res.status(403).json({ message: "Les avis sont réservés aux clients." });
    return false;
  }
  return true;
}

// GET /api/auth/avis -> { avis: {...} | null }
async function monAvis(req, res) {
  try {
    if (!(await estClient(req, res))) return;
    const avis = await Avis.findOne({ userId: req.user.id }).lean();
    return res.status(200).json({ avis: pourClient(avis) ?? null });
  } catch (error) {
    console.error("Erreur monAvis:", error);
    return res.status(500).json({ message: "Erreur lors du chargement de votre avis." });
  }
}

// PUT /api/auth/avis  { prenom, quartier, note, texte, consentement: true } : création ou modification, toujours « À valider »
async function enregistrerAvis(req, res) {
  try {
    if (!(await estClient(req, res))) return;
    const { note, consentement } = req.body;
    const prenom = nettoyer(req.body.prenom);
    const quartier = nettoyer(req.body.quartier);
    const texte = nettoyer(req.body.texte);

    if (consentement !== true) return res.status(400).json({ message: "Votre accord est nécessaire pour publier votre avis sur le site." });
    if (!Number.isInteger(note) || note < 1 || note > 5) return res.status(400).json({ message: "Choisissez une note de 1 à 5 étoiles." });
    if (!PRENOM_VALIDE.test(prenom)) return res.status(400).json({ message: "Indiquez le prénom à afficher (lettres seulement, 40 caractères au plus)." });
    if (!QUARTIER_VALIDE.test(quartier)) return res.status(400).json({ message: "Quartier invalide (60 caractères au plus)." });
    if (texte.length < TEXTE_MIN || texte.length > TEXTE_MAX) {
      return res.status(400).json({ message: `Votre avis doit faire entre ${TEXTE_MIN} et ${TEXTE_MAX} caractères.` });
    }

    const avis = await Avis.findOneAndUpdate(
      { userId: req.user.id },
      {
        $set: {
          prenom, quartier, note, texte, statut: 'À valider',
          consentement: { date: new Date(), version: VERSION_CONSENTEMENT_AVIS },
          decidePar: null, decideLe: null, motif: ''
        }
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(200).json({ message: "Merci ! Votre avis sera visible sur le site après validation.", avis: pourClient(avis) });
  } catch (error) {
    console.error("Erreur enregistrerAvis:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement de votre avis." });
  }
}

// DELETE /api/auth/avis : le client retire son avis (et son accord), qui disparaît aussitôt du site
async function supprimerMonAvis(req, res) {
  try {
    if (!(await estClient(req, res))) return;
    await Avis.deleteOne({ userId: req.user.id });
    return res.status(200).json({ message: "Votre avis a été supprimé." });
  } catch (error) {
    console.error("Erreur supprimerMonAvis:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression de votre avis." });
  }
}

// ------------------------------------------------------------------
// Back-office (section « avis » : lecture admin et coordinateur, décision admin)
// ------------------------------------------------------------------

// GET /api/admin/avis : tous les avis, avec le compte et le nombre de commandes livrées (pour juger de l'authenticité)
async function listerAvis(req, res) {
  try {
    const avis = await Avis.find()
      .populate('userId', 'username')
      .populate('decidePar', 'username')
      .sort({ updatedAt: -1 })
      .lean();
    const livrees = await Order.aggregate([
      { $match: { userId: { $in: avis.map(a => a.userId?._id).filter(Boolean) }, statut: 'Livrée' } },
      { $group: { _id: '$userId', nombre: { $sum: 1 } } }
    ]);
    const parClient = new Map(livrees.map(l => [String(l._id), l.nombre]));
    return res.status(200).json(avis.map(a => ({
      _id: a._id,
      compte: a.userId?.username ?? 'Compte supprimé',
      commandesLivrees: parClient.get(String(a.userId?._id)) ?? 0,
      prenom: a.prenom, quartier: a.quartier, note: a.note, texte: a.texte,
      statut: a.statut, motif: a.motif,
      decidePar: a.decidePar?.username ?? '', decideLe: a.decideLe,
      creeLe: a.createdAt, modifieLe: a.updatedAt
    })));
  } catch (error) {
    console.error("Erreur listerAvis:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des avis." });
  }
}

// POST /api/admin/avis/:id/decision  { decision: 'publier' | 'refuser', motif } : un avis publié se retire par un refus motivé
async function deciderAvis(req, res) {
  try {
    const { decision } = req.body;
    const motif = nettoyer(req.body.motif).slice(0, 300);
    if (!['publier', 'refuser'].includes(decision)) return res.status(400).json({ message: "Décision invalide." });
    if (decision === 'refuser' && motif.length < 3) return res.status(400).json({ message: "Indiquez le motif, il sera visible du client." });

    const avis = mongoose.isValidObjectId(req.params.id) ? await Avis.findById(req.params.id) : null;
    if (!avis) return res.status(404).json({ message: "Avis introuvable." });
    if (decision === 'publier' && avis.statut === 'Publié') return res.status(400).json({ message: "Cet avis est déjà publié." });

    const avant = avis.statut;
    Object.assign(avis, { statut: decision === 'publier' ? 'Publié' : 'Refusé', decidePar: req.user.id, decideLe: new Date(), motif: decision === 'publier' ? '' : motif });
    await avis.save();

    const resume = decision === 'publier'
      ? `Avis de ${avis.prenom} publié sur le site`
      : `Avis de ${avis.prenom} ${avant === 'Publié' ? 'retiré du site' : 'refusé'} : ${motif}`;
    await journaliser(req, { action: 'Validation', entite: 'Avis client', entiteId: avis._id, resume });
    return res.status(200).json({ message: decision === 'publier' ? "Avis publié sur le site." : (avant === 'Publié' ? "Avis retiré du site." : "Avis refusé.") });
  } catch (error) {
    console.error("Erreur deciderAvis:", error);
    return res.status(500).json({ message: "Erreur lors de la décision." });
  }
}

// DELETE /api/admin/avis/:id : indésirable (publicité, propos injurieux)
async function supprimerAvis(req, res) {
  try {
    const avis = mongoose.isValidObjectId(req.params.id) ? await Avis.findById(req.params.id) : null;
    if (!avis) return res.status(404).json({ message: "Avis introuvable." });
    await avis.deleteOne();
    await journaliser(req, { action: 'Suppression', entite: 'Avis client', entiteId: avis._id, resume: `Avis de ${avis.prenom} supprimé` });
    return res.status(200).json({ message: "Avis supprimé." });
  } catch (error) {
    console.error("Erreur supprimerAvis:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression de l'avis." });
  }
}

module.exports = { monAvis, enregistrerAvis, supprimerMonAvis, listerAvis, deciderAvis, supprimerAvis };
