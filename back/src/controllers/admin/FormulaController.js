const Formule = require('../../models/formules');
const { calculerCompositionPack } = require('../../services/compositionService');
const { TYPE_PACK, listerPacks } = require('../../services/packService');
const { journaliser } = require('../../services/journalService');
const { lienWhatsAppFormule } = require('../../services/formuleService');

// Composition et valeur catalogue d'un pack (lecture seule, voir services/compositionService.js)
async function getPackDetails(req, res) {
  try {
    const type = String(req.params.packType).toLowerCase(); // 'essentiel', 'equilibre', 'confort', 'reserve' ou 'fraicheur'

    if (!TYPE_PACK.test(type)) {
      return res.status(400).json({ message: "Type de pack invalide." });
    }

    const composition = await calculerCompositionPack(type);
    if (!composition) {
      return res.status(404).json({ message: `Configuration de la formule pour ${type} introuvable.` });
    }

    // Le prix de vente (prixActuel / prixCommercial) n'est jamais modifié ici :
    // la valeur issue du catalogue est renvoyée à part, dans prixCalcule.
    return res.status(200).json(composition);
  } catch (error) {
    console.error("Erreur getPackDetails:", error);
    return res.status(500).json({ message: "Erreur lors de la génération du pack." });
  }
}

async function updateFormulaPrice(req, res) {
  try {
    const { packType } = req.params;
    const { prixFixe } = req.body;

    const type = packType.toLowerCase();

    if (typeof prixFixe !== 'number' || !Number.isFinite(prixFixe) || prixFixe < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le prix proposé est invalide' 
      });
    }

    // Mise à jour de la formule en BDD MongoDB
    const updatedFormula = await Formule.findOne(
      { slug: `ahi-${type}`, statut: 'actif' },
    );

    if (!updatedFormula) {
      return res.status(404).json({ success: false, message: 'Formule introuvable' });
    }

    const ancienPrix = updatedFormula.prixCommercial ?? updatedFormula.prixActuel ?? 'à définir';
    updatedFormula.prixCommercial = prixFixe;
    updatedFormula.lienWhatsApp = lienWhatsAppFormule(updatedFormula);
    await updatedFormula.save();

    // Journal des modifications : qui a changé le prix de vente, et quand
    await journaliser(req, {
      action: 'Modification', entite: 'Prix formule', entiteId: updatedFormula._id,
      resume: `Prix de ${updatedFormula.nom} : ${ancienPrix} -> ${prixFixe} FCFA`,
      avant: { prix: ancienPrix }, apres: { prix: prixFixe }
    });

    res.status(200).json({
      success: true,
      message: 'Prix commercial mis à jour avec succès',
      data: updatedFormula
    });
  } catch (error) {
    console.error('Erreur updateFormulaPrice:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du prix.' });
  }
}

// Cycle de relance : jours entre la livraison et la relance du client (alerte à J-5 au tableau de bord).
// Réglé par l'admin ; il ne change pas les textes du site (« par mois »), qui restent dans front/src/config/formules.ts.
const CYCLE_MIN = 1;
const CYCLE_MAX = 365;

async function updateFormulaCycle(req, res) {
  try {
    const type = String(req.params.packType).toLowerCase();
    if (!TYPE_PACK.test(type)) {
      return res.status(400).json({ success: false, message: 'Type de pack invalide.' });
    }

    const { cycleJours } = req.body;
    if (!Number.isInteger(cycleJours) || cycleJours < CYCLE_MIN || cycleJours > CYCLE_MAX) {
      return res.status(400).json({
        success: false,
        message: `Le cycle doit être un nombre entier de jours, entre ${CYCLE_MIN} et ${CYCLE_MAX}.`
      });
    }

    const formule = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });
    if (!formule) {
      return res.status(404).json({ success: false, message: 'Formule introuvable' });
    }

    const avant = formule.cycleJours;
    if (avant === cycleJours) {
      return res.status(200).json({ success: true, message: 'Cycle de relance inchangé', data: formule });
    }
    formule.cycleJours = cycleJours;
    await formule.save();

    // Journal des modifications : qui a changé le cycle, et quand
    await journaliser(req, {
      action: 'Modification', entite: 'Formule', entiteId: formule._id,
      resume: `Cycle de relance de ${formule.nom} : ${avant} -> ${cycleJours} jours`,
      avant: { cycleJours: avant }, apres: { cycleJours }
    });

    return res.status(200).json({ success: true, message: 'Cycle de relance mis à jour', data: formule });
  } catch (error) {
    console.error('Erreur updateFormulaCycle:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du cycle.' });
  }
}

// Liste des packs (GET /api/admin/packs) : toute l'équipe (colonnes de quantités, simulateurs, prévision d'achats,
// idées de repas). Ordre de l'admin ; sans prix (le prix reste dans l'écran Formules, section données de base).
async function listerPacksEquipe(req, res) {
  try {
    return res.status(200).json(await listerPacks());
  } catch (error) {
    console.error('Erreur listerPacksEquipe:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des packs.' });
  }
}

// Créer un pack (POST /api/admin/formulas) : admin seulement, journalisé. Le pack est aussitôt reconnu partout
// (quantités du catalogue, import du référentiel, composition, prévision d'achats) ; « bientôt disponible » par
// défaut : visible côté client mais pas commandable tant que l'admin ne l'ouvre pas.
async function creerPack(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin peut créer un pack." });
    const { type, nom, cible, prix = null, cycleJours = 30, bientotDisponible = true } = req.body ?? {};
    if (typeof type !== 'string' || !TYPE_PACK.test(type)) {
      return res.status(400).json({ message: 'Identifiant du pack : minuscules et chiffres, sans accent ni espace, 2 à 20 caractères (ex. etudiant).' });
    }
    const nomPack = typeof nom === 'string' ? nom.trim() : '';
    if (nomPack.length < 2 || nomPack.length > 40) return res.status(400).json({ message: 'Nom du pack : 2 à 40 caractères (ex. AHI Étudiant).' });
    const ciblePack = typeof cible === 'string' ? cible.trim() : '';
    if (!ciblePack || ciblePack.length > 80) return res.status(400).json({ message: 'Cible du pack : 1 à 80 caractères (ex. 1 étudiant · par mois).' });
    if (prix !== null && (typeof prix !== 'number' || !Number.isFinite(prix) || prix < 0 || prix > 10000000)) {
      return res.status(400).json({ message: 'Prix invalide : nombre de FCFA, ou vide (à définir).' });
    }
    if (!Number.isInteger(cycleJours) || cycleJours < CYCLE_MIN || cycleJours > CYCLE_MAX) {
      return res.status(400).json({ message: `Le cycle doit être un nombre entier de jours, entre ${CYCLE_MIN} et ${CYCLE_MAX}.` });
    }
    if (typeof bientotDisponible !== 'boolean') return res.status(400).json({ message: '« bientotDisponible » doit valoir true ou false.' });
    const slug = `ahi-${type}`;
    if (await Formule.exists({ slug })) return res.status(409).json({ message: `Le pack ${slug} existe déjà.` });

    const packs = await listerPacks();
    const ordre = Math.max(packs.length, ...packs.map(p => (p.ordre ?? -1) + 1)); // Après les packs existants
    const formule = new Formule({ slug, nom: nomPack, cible: ciblePack, prixActuel: prix, cycleJours, bientotDisponible, statut: 'actif', ordre, lienWhatsApp: '-' });
    formule.lienWhatsApp = lienWhatsAppFormule(formule);
    await formule.save();
    await journaliser(req, {
      action: 'Création', entite: 'Formule', entiteId: formule._id,
      resume: `Pack ${nomPack} (${slug}) créé : prix ${prix ?? 'à définir'}, cycle ${cycleJours} jours${bientotDisponible ? ', bientôt disponible' : ', ouvert'}`
    });
    return res.status(201).json({ message: `Pack ${nomPack} créé.`, pack: (await listerPacks()).find(p => p.slug === slug) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Ce pack existe déjà.' });
    console.error('Erreur creerPack:', error.name, error.code ?? '');
    return res.status(500).json({ message: 'Erreur lors de la création du pack.' });
  }
}

// Ouvrir un pack à la commande, ou le repasser « bientôt disponible » (PATCH /api/admin/formulas/:packType/disponibilite) :
// admin seulement, journalisé. Un pack « bientôt disponible » est visible mais pas commandable, et n'a pas de prix
// public : sa carte n'apparaît pas sur l'accueil.
async function updateFormulaDisponibilite(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Seul l'admin peut ouvrir un pack à la commande." });
    const type = String(req.params.packType).toLowerCase();
    if (!TYPE_PACK.test(type)) return res.status(400).json({ message: 'Type de pack invalide.' });
    const { bientotDisponible } = req.body ?? {};
    if (typeof bientotDisponible !== 'boolean') return res.status(400).json({ message: '« bientotDisponible » doit valoir true ou false.' });
    const formule = await Formule.findOne({ slug: `ahi-${type}`, statut: 'actif' });
    if (!formule) return res.status(404).json({ message: 'Formule introuvable' });
    if (formule.bientotDisponible !== bientotDisponible) {
      formule.bientotDisponible = bientotDisponible;
      await formule.save();
      await journaliser(req, {
        action: 'Modification', entite: 'Formule', entiteId: formule._id,
        resume: `${formule.nom} : ${bientotDisponible ? 'repassé « bientôt disponible » (non commandable)' : 'ouvert à la commande'}`,
        avant: { bientotDisponible: !bientotDisponible }, apres: { bientotDisponible }
      });
    }
    return res.status(200).json({ message: bientotDisponible ? `${formule.nom} : bientôt disponible.` : `${formule.nom} : ouvert à la commande.`, data: formule });
  } catch (error) {
    console.error('Erreur updateFormulaDisponibilite:', error.name, error.code ?? '');
    return res.status(500).json({ message: 'Erreur lors du changement de disponibilité.' });
  }
}

module.exports = {
  getPackDetails,
  updateFormulaPrice,
  updateFormulaCycle,
  updateFormulaDisponibilite,
  listerPacksEquipe,
  creerPack
};