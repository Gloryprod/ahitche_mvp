const mongoose = require('mongoose');
const User = require('../models/user');
const Formule = require('../models/formules');
const { ProfilNutrition, SuiviNutrition, MenuType, TRANCHES_AGE, OBJECTIFS, JOURS, VERSION_CONSENTEMENT } = require('../models/nutrition');
const { echapperRegex } = require('../utils/texte');

// ------------------------------------------------------------------
// Espace client : questionnaire, recommandations, menus
// ------------------------------------------------------------------

// GET /api/auth/nutrition
async function monSuivi(req, res) {
  try {
    const [profil, recommandations, client] = await Promise.all([
      ProfilNutrition.findOne({ userId: req.user.id }).lean(),
      SuiviNutrition.find({ userId: req.user.id, visibleClient: true }).sort({ createdAt: -1 }).limit(20).lean(),
      User.findById(req.user.id).select('formuleHabituelle').lean()
    ]);

    // Menus de la formule habituelle du client (sinon de toutes les formules ouvertes)
    const formule = client?.formuleHabituelle ? await Formule.findOne({ nom: client.formuleHabituelle }).select('slug').lean() : null;
    const menus = await MenuType.find({ actif: true, ...(formule ? { formuleSlug: formule.slug } : {}) }).sort({ updatedAt: -1 }).limit(4).lean();

    return res.status(200).json({ profil, recommandations: recommandations.map(r => ({ type: r.type, contenu: r.contenu, date: r.createdAt })), menus, objectifsPossibles: OBJECTIFS, tranches: TRANCHES_AGE });
  } catch (error) {
    console.error("Erreur monSuivi:", error);
    return res.status(500).json({ message: "Erreur lors du chargement de votre suivi alimentaire." });
  }
}

// PUT /api/auth/nutrition  { foyer, objectifs, platsAimes, alimentsNonAimes, consentement: true }
async function enregistrerProfil(req, res) {
  try {
    const { foyer = {}, objectifs = [], platsAimes = '', alimentsNonAimes = '', consentement } = req.body;
    if (consentement !== true) {
      return res.status(400).json({ message: "Votre accord est nécessaire pour enregistrer le questionnaire." });
    }

    const foyerPropre = {};
    for (const t of TRANCHES_AGE) {
      const n = Number(foyer[t] ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > 20) return res.status(400).json({ message: "Composition du foyer invalide." });
      foyerPropre[t] = n;
    }
    if (!Object.values(foyerPropre).some(n => n > 0)) return res.status(400).json({ message: "Indiquez au moins une personne dans le foyer." });
    if (!Array.isArray(objectifs) || objectifs.some(o => !OBJECTIFS.includes(o))) return res.status(400).json({ message: "Objectif invalide." });
    if (typeof platsAimes !== 'string' || typeof alimentsNonAimes !== 'string' || platsAimes.length > 500 || alimentsNonAimes.length > 500) {
      return res.status(400).json({ message: "Réponses trop longues (500 caractères maximum)." });
    }

    const existant = await ProfilNutrition.findOne({ userId: req.user.id });
    const profil = await ProfilNutrition.findOneAndUpdate(
      { userId: req.user.id },
      {
        $set: {
          foyer: foyerPropre, objectifs: [...new Set(objectifs)], platsAimes: platsAimes.trim(), alimentsNonAimes: alimentsNonAimes.trim(),
          consentement: { date: new Date(), version: VERSION_CONSENTEMENT }
        },
        // Premier questionnaire : un premier point avec la nutritionniste sous 7 jours
        $setOnInsert: { prochainPoint: new Date(Date.now() + 7 * 86400 * 1000) }
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    return res.status(existant ? 200 : 201).json({ message: existant ? "Questionnaire mis à jour." : "Merci ! Notre nutritionniste vous recontacte bientôt.", profil });
  } catch (error) {
    console.error("Erreur enregistrerProfil:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement du questionnaire." });
  }
}

// DELETE /api/auth/nutrition : droit de suppression (profil et tout le journal de suivi)
async function supprimerMonSuivi(req, res) {
  try {
    await Promise.all([
      ProfilNutrition.deleteOne({ userId: req.user.id }),
      SuiviNutrition.deleteMany({ userId: req.user.id })
    ]);
    return res.status(200).json({ message: "Vos réponses et votre suivi alimentaire ont été supprimés." });
  } catch (error) {
    console.error("Erreur supprimerMonSuivi:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression." });
  }
}

// ------------------------------------------------------------------
// Back-office : clients suivis, fiche, journal
// ------------------------------------------------------------------

// GET /api/admin/nutrition/clients?search : clients ayant rempli le questionnaire (avec leur accord)
async function listerClientsSuivis(req, res) {
  try {
    const profils = await ProfilNutrition.find().populate('userId', 'username telephone quartier formuleHabituelle').sort({ prochainPoint: 1 }).lean();
    const recherche = typeof req.query.search === 'string' && req.query.search.trim() ? new RegExp(echapperRegex(req.query.search.trim()), 'i') : null;

    const derniersSuivis = await SuiviNutrition.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', date: { $first: '$createdAt' }, type: { $first: '$type' } } }
    ]);
    const dernierParClient = new Map(derniersSuivis.map(s => [String(s._id), s]));

    const clients = profils
      .filter(p => p.userId && (!recherche || recherche.test(p.userId.username) || recherche.test(p.userId.telephone || '')))
      .map(p => ({
        userId: p.userId._id,
        nom: p.userId.username,
        telephone: p.userId.telephone || '',
        quartier: p.userId.quartier || '',
        formule: p.userId.formuleHabituelle || '',
        personnes: TRANCHES_AGE.reduce((s, t) => s + (p.foyer?.[t] || 0), 0),
        prochainPoint: p.prochainPoint,
        dernierSuivi: dernierParClient.get(String(p.userId._id)) || null
      }));
    return res.status(200).json(clients);
  } catch (error) {
    console.error("Erreur listerClientsSuivis:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des clients suivis." });
  }
}

// GET /api/admin/nutrition/clients/:userId : fiche (profil + journal)
async function ficheClient(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: "Client introuvable." });
    const [client, profil, journal] = await Promise.all([
      User.findOne({ _id: req.params.userId, role: 'user' }).select('username telephone quartier adresse formuleHabituelle').lean(),
      ProfilNutrition.findOne({ userId: req.params.userId }).lean(),
      SuiviNutrition.find({ userId: req.params.userId }).populate('auteur', 'username').sort({ createdAt: -1 }).lean()
    ]);
    if (!client || !profil) return res.status(404).json({ message: "Ce client n'a pas rempli le questionnaire de suivi." });
    return res.status(200).json({ client, profil, journal });
  } catch (error) {
    console.error("Erreur ficheClient:", error);
    return res.status(500).json({ message: "Erreur lors du chargement de la fiche." });
  }
}

// POST /api/admin/nutrition/clients/:userId/suivi  { type, contenu, visibleClient }
async function ajouterSuivi(req, res) {
  try {
    const { type, contenu } = req.body;
    if (!['Point mensuel', 'Recommandation', 'Note interne'].includes(type)) return res.status(400).json({ message: "Type de suivi invalide." });
    if (typeof contenu !== 'string' || !contenu.trim() || contenu.length > 2000) return res.status(400).json({ message: "Le contenu est obligatoire (2000 caractères maximum)." });

    const profil = mongoose.isValidObjectId(req.params.userId) ? await ProfilNutrition.findOne({ userId: req.params.userId }) : null;
    if (!profil) return res.status(404).json({ message: "Ce client n'a pas rempli le questionnaire de suivi." });

    // Une note interne n'est jamais montrée au client ; les autres le sont par défaut
    const visibleClient = type === 'Note interne' ? false : req.body.visibleClient !== false;
    const suivi = await SuiviNutrition.create({ userId: profil.userId, auteur: req.user.id, type, contenu: contenu.trim(), visibleClient });

    // Point mensuel fait : le suivant dans 30 jours (question 33)
    if (type === 'Point mensuel') {
      profil.prochainPoint = new Date(Date.now() + 30 * 86400 * 1000);
      await profil.save();
    }
    return res.status(201).json({ message: `${type} enregistré${type === 'Recommandation' ? 'e' : ''}.`, suivi, prochainPoint: profil.prochainPoint });
  } catch (error) {
    console.error("Erreur ajouterSuivi:", error);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement du suivi." });
  }
}

// ------------------------------------------------------------------
// Menus types par formule
// ------------------------------------------------------------------

function lireMenu(body) {
  const formuleSlug = String(body.formuleSlug || '');
  const titre = typeof body.titre === 'string' ? body.titre.trim() : '';
  if (!['ahi-essentiel', 'ahi-equilibre', 'ahi-confort', 'ahi-reserve', 'ahi-fraicheur'].includes(formuleSlug)) return { erreur: "Formule invalide." };
  if (!titre) return { erreur: "Le titre du menu est obligatoire." };
  const jours = JOURS.map(jour => {
    const saisi = Array.isArray(body.jours) ? body.jours.find(j => j?.jour === jour) : null;
    return { jour, dejeuner: String(saisi?.dejeuner ?? '').trim().slice(0, 200), diner: String(saisi?.diner ?? '').trim().slice(0, 200) };
  });
  if (!jours.some(j => j.dejeuner || j.diner)) return { erreur: "Renseignez au moins un repas." };
  return { menu: { formuleSlug, titre, jours, conseil: String(body.conseil ?? '').trim().slice(0, 500), actif: body.actif !== false } };
}

// GET /api/admin/nutrition/menus
async function listerMenus(req, res) {
  try {
    const menus = await MenuType.find().populate('auteur', 'username').sort({ formuleSlug: 1, updatedAt: -1 }).lean();
    return res.status(200).json(menus);
  } catch (error) {
    console.error("Erreur listerMenus:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des menus." });
  }
}

// POST /api/admin/nutrition/menus
async function creerMenu(req, res) {
  try {
    const { menu, erreur } = lireMenu(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    const cree = await MenuType.create({ ...menu, auteur: req.user.id });
    return res.status(201).json(cree);
  } catch (error) {
    console.error("Erreur creerMenu:", error);
    return res.status(500).json({ message: "Erreur lors de la création du menu." });
  }
}

// PUT /api/admin/nutrition/menus/:id
async function modifierMenu(req, res) {
  try {
    const { menu, erreur } = lireMenu(req.body);
    if (erreur) return res.status(400).json({ message: erreur });
    const maj = mongoose.isValidObjectId(req.params.id)
      ? await MenuType.findByIdAndUpdate(req.params.id, { $set: { ...menu, auteur: req.user.id } }, { returnDocument: 'after', runValidators: true })
      : null;
    if (!maj) return res.status(404).json({ message: "Menu introuvable." });
    return res.status(200).json(maj);
  } catch (error) {
    console.error("Erreur modifierMenu:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du menu." });
  }
}

// DELETE /api/admin/nutrition/menus/:id
async function supprimerMenu(req, res) {
  try {
    const supprime = mongoose.isValidObjectId(req.params.id) ? await MenuType.findByIdAndDelete(req.params.id) : null;
    if (!supprime) return res.status(404).json({ message: "Menu introuvable." });
    return res.status(200).json({ message: "Menu supprimé." });
  } catch (error) {
    console.error("Erreur supprimerMenu:", error);
    return res.status(500).json({ message: "Erreur lors de la suppression du menu." });
  }
}

module.exports = {
  monSuivi, enregistrerProfil, supprimerMonSuivi,
  listerClientsSuivis, ficheClient, ajouterSuivi,
  listerMenus, creerMenu, modifierMenu, supprimerMenu
};
