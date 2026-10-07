const Partner = require('../../models/partner');
const { TYPES_PRESTATAIRE, MODES_PAIEMENT_PRESTATAIRE } = require('../../models/partner');
const { echapperRegex } = require('../../utils/texte');
const { journaliser } = require('../../services/journalService');

const COORDONNEES = ['telephone', 'ifuRccm', 'quartier', 'notes'];

const CHAMPS_MODIFIABLES = ['nom', 'type', 'telephone', 'quartier', 'ifuRccm', 'modePaiement', 'notes', 'actif'];

// Ne garde que les champs attendus, en chaînes (ou booléen pour actif)
function lireFiche(body) {
  const fiche = {};
  for (const champ of CHAMPS_MODIFIABLES) {
    if (body[champ] === undefined) continue;
    fiche[champ] = champ === 'actif' ? body[champ] === true : String(body[champ]).trim();
  }
  return fiche;
}

function verifierFiche(fiche, creation) {
  if (creation && !fiche.nom) return "Le nom du prestataire est obligatoire.";
  if (fiche.nom !== undefined && fiche.nom === '') return "Le nom du prestataire ne peut pas être vide.";
  if (creation && !fiche.type) return "Le type de prestataire est obligatoire.";
  if (fiche.type !== undefined && !TYPES_PRESTATAIRE.includes(fiche.type)) return "Type de prestataire invalide.";
  if (fiche.modePaiement !== undefined && !MODES_PAIEMENT_PRESTATAIRE.includes(fiche.modePaiement)) return "Mode de paiement invalide.";
  return null;
}

async function nomDejaPris(nom, idExclu) {
  const filtre = { nom: { $regex: `^${echapperRegex(nom)}$`, $options: 'i' }, deletedAt: null };
  if (idExclu) filtre._id = { $ne: idExclu };
  return !!(await Partner.exists(filtre));
}

// GET /api/admin/prestataires?page&limit&search&type&actif
async function listerPrestataires(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 200);
    const skip = (page - 1) * limit;
    const { search, type, actif } = req.query;

    const filtre = { deletedAt: null };
    if (type && TYPES_PRESTATAIRE.includes(type)) filtre.type = type;
    if (actif === 'true') filtre.actif = true;
    if (search && search.trim()) {
      const motif = { $regex: echapperRegex(search.trim()), $options: 'i' };
      filtre.$or = [{ nom: motif }, { telephone: motif }, { quartier: motif }];
    }

    const [prestataires, total] = await Promise.all([
      Partner.find(filtre).sort({ actif: -1, nom: 1 }).skip(skip).limit(limit),
      Partner.countDocuments(filtre)
    ]);

    return res.status(200).json({ prestataires, total, hasMore: skip + prestataires.length < total });
  } catch (error) {
    console.error("Erreur listerPrestataires:", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des prestataires." });
  }
}

// POST /api/admin/prestataires
async function creerPrestataire(req, res) {
  try {
    const fiche = lireFiche(req.body);
    const erreur = verifierFiche(fiche, true);
    if (erreur) return res.status(400).json({ message: erreur });
    if (await nomDejaPris(fiche.nom)) return res.status(400).json({ message: "Un prestataire porte déjà ce nom." });

    const prestataire = await Partner.create(fiche);
    await journaliser(req, { action: 'Création', entite: 'Prestataire', entiteId: prestataire._id, resume: `Fiche « ${prestataire.nom} » (${prestataire.type}) créée` });
    return res.status(201).json(prestataire);
  } catch (error) {
    console.error("Erreur creerPrestataire:", error);
    return res.status(500).json({ message: "Erreur lors de la création du prestataire." });
  }
}

// PUT /api/admin/prestataires/:id
async function modifierPrestataire(req, res) {
  try {
    const fiche = lireFiche(req.body);
    const erreur = verifierFiche(fiche, false);
    if (erreur) return res.status(400).json({ message: erreur });
    if (fiche.nom && await nomDejaPris(fiche.nom, req.params.id)) {
      return res.status(400).json({ message: "Un autre prestataire porte déjà ce nom." });
    }

    const avant = await Partner.findOne({ _id: req.params.id, deletedAt: null }).lean();
    const prestataire = await Partner.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: fiche },
      { returnDocument: 'after', runValidators: true }
    );
    if (!prestataire) return res.status(404).json({ message: "Prestataire introuvable." });

    const changes = Object.keys(fiche).filter(c => String(avant?.[c] ?? '') !== String(prestataire[c] ?? ''));
    if (changes.length) {
      await journaliser(req, {
        action: 'Modification', entite: 'Prestataire', entiteId: prestataire._id,
        resume: `Fiche « ${prestataire.nom} » modifiée : ${changes.join(', ')}`,
        // Coordonnées (téléphone, IFU, quartier, notes) : le journal cite le champ, pas sa valeur
        avant: Object.fromEntries(changes.filter(c => !COORDONNEES.includes(c)).map(c => [c, avant?.[c] ?? null])),
        apres: Object.fromEntries(changes.filter(c => !COORDONNEES.includes(c)).map(c => [c, prestataire[c] ?? null]))
      });
    }
    return res.status(200).json(prestataire);
  } catch (error) {
    console.error("Erreur modifierPrestataire:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du prestataire." });
  }
}

// DELETE /api/admin/prestataires/:id (suppression logique : l'historique des lots et dépenses reste lisible)
async function supprimerPrestataire(req, res) {
  try {
    const prestataire = await Partner.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $set: { deletedAt: new Date(), actif: false } },
      { returnDocument: 'after' }
    );
    if (!prestataire) return res.status(404).json({ message: "Prestataire introuvable." });

    await journaliser(req, { action: 'Suppression', entite: 'Prestataire', entiteId: prestataire._id, resume: `Fiche « ${prestataire.nom} » supprimée` });
    return res.status(200).json({ message: "Prestataire supprimé." });
  } catch (error) {
    console.error("Erreur supprimerPrestataire:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du prestataire." });
  }
}

module.exports = { listerPrestataires, creerPrestataire, modifierPrestataire, supprimerPrestataire };
