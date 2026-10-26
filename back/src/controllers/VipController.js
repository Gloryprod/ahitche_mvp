const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/user');
const CodeVip = require('../models/codeVip');
const { TYPES_CODE_VIP } = require('../models/codeVip');
const { journaliser } = require('../services/journalService');
const { nettoyer, nombre, catalogueVip: listerCatalogueVip } = require('../services/achatLibreService');

// Codes VIP et comptes VIP (docs-internes/vip/CAHIER-DES-CHARGES.md, partie B).
// Espace client : saisie d'un code (limite de tentatives dans routes/auth.js), catalogue au prix VIP.
// Back-office (section « vip » : lecture admin et coordinateur, écriture admin) : codes, comptes VIP, retrait.

const CODE_VALIDE = /^[A-Z0-9][A-Z0-9-]{3,29}$/;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Sans 0/O, 1/I/L : lisible et facile à taper sur téléphone
const PLAFOND_MAX = 10000;
const CODE_REFUSE = "Ce code n'est pas valable ou a déjà servi. Vérifiez-le, ou écrivez-nous sur WhatsApp."; // Même message dans tous les cas : on ne dit jamais si un code existe

// Code saisi : sans espaces autour, en majuscules
const normaliserCode = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
// Dans le journal (lu aussi par la comptabilité et l'audit), un code n'apparaît jamais en entier
const codeMasque = (code) => `…${String(code).slice(-2)}`;
const nomCode = (c) => `${codeMasque(c.code)}${c.libelle ? ` « ${c.libelle} »` : ''}`;

function genererCode() {
  let suffixe = '';
  for (let i = 0; i < 6; i++) suffixe += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `AHI-VIP-${suffixe}`;
}

// Compte client connecté ; `vip` : exige le statut VIP. Envoie l'erreur et renvoie null sinon.
async function compteClient(req, res, { vip = false } = {}) {
  const compte = await User.findById(req.user.id).select('username role vip').lean();
  if (!compte) {
    res.status(401).json({ message: "Session expirée, reconnectez-vous." });
    return null;
  }
  if (compte.role !== 'user') {
    res.status(403).json({ message: "Les codes et achats VIP sont réservés aux clients." });
    return null;
  }
  if (vip && compte.vip?.actif !== true) {
    res.status(403).json({ message: "Les achats libres sont réservés aux comptes VIP." });
    return null;
  }
  return compte;
}

// ------------------------------------------------------------------
// Espace client
// ------------------------------------------------------------------

// POST /api/auth/vip/code  { code } -> le compte devient VIP
// Code actif, non archivé, plafond non atteint, compte pas déjà VIP ni déjà inscrit sur ce code. L'inscription est
// atomique (deux comptes ne peuvent pas prendre la dernière place d'un code au même instant).
async function utiliserCode(req, res) {
  try {
    const compte = await compteClient(req, res);
    if (!compte) return;
    if (compte.vip?.actif === true) return res.status(409).json({ message: "Votre compte a déjà le statut VIP." });

    const code = normaliserCode(req.body?.code);
    if (!CODE_VALIDE.test(code)) return res.status(400).json({ message: CODE_REFUSE });

    const maintenant = new Date();
    const codeVip = await CodeVip.findOneAndUpdate(
      {
        code, actif: true, deletedAt: null,
        'utilisations.userId': { $ne: compte._id },
        $expr: { $lt: [{ $size: '$utilisations' }, '$plafond'] }
      },
      { $push: { utilisations: { userId: compte._id, date: maintenant } } },
      { returnDocument: 'after' }
    );
    if (!codeVip) return res.status(400).json({ message: CODE_REFUSE });

    const resultat = await User.updateOne(
      { _id: compte._id, 'vip.actif': { $ne: true } },
      { $set: { vip: { actif: true, depuis: maintenant, codeId: codeVip._id, retireLe: null, retirePar: null } } }
    );
    if (!resultat.modifiedCount) {
      // Le compte est devenu VIP entre-temps (autre code saisi au même instant) : la place est rendue
      await CodeVip.updateOne({ _id: codeVip._id }, { $pull: { utilisations: { userId: compte._id, date: maintenant } } });
      return res.status(409).json({ message: "Votre compte a déjà le statut VIP." });
    }

    await journaliser(req, {
      action: 'Validation', entite: 'Compte VIP', entiteId: compte._id,
      resume: `${compte.username} devient VIP avec le code ${nomCode(codeVip)} (${codeVip.utilisations.length}/${codeVip.plafond})`
    });
    return res.status(200).json({ message: "Bienvenue ! Votre compte a maintenant le statut VIP.", vip: { actif: true, depuis: maintenant } });
  } catch (error) {
    console.error("Erreur utiliserCode:", error);
    return res.status(500).json({ message: "Erreur lors de la vérification du code." });
  }
}

// GET /api/auth/vip/catalogue (comptes VIP) -> { produits: [{ productId, reference, nom, unite, famille, prixVip, pas, maximum }] }
// Famille P : produits de base (liste principale) ; V : produits variables (option « Autre »). Jamais le prix du catalogue.
async function catalogueVip(req, res) {
  try {
    if (!(await compteClient(req, res, { vip: true }))) return;
    const produits = await listerCatalogueVip(); // Même liste que le formulaire de l'équipe (achatLibreService)
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ produits });
  } catch (error) {
    console.error("Erreur catalogueVip:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des produits." });
  }
}

// ------------------------------------------------------------------
// Back-office (section « vip »)
// ------------------------------------------------------------------

const versAdmin = (c) => ({
  _id: c._id, code: c.code, type: c.type, plafond: c.plafond, libelle: c.libelle, actif: c.actif,
  utilisees: c.utilisations.length, restantes: Math.max(0, c.plafond - c.utilisations.length),
  utilisations: c.utilisations.map(u => ({ userId: u.userId?._id ?? u.userId, client: u.userId?.username ?? 'Compte supprimé', telephone: u.userId?.telephone ?? '', date: u.date })),
  creePar: c.creePar?.username ?? '', creeLe: c.createdAt
});

// GET /api/admin/vip/codes : tous les codes non archivés, avec leurs utilisations
async function listerCodes(req, res) {
  try {
    const codes = await CodeVip.find({ deletedAt: null })
      .populate('utilisations.userId', 'username telephone')
      .populate('creePar', 'username')
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ codes: codes.map(versAdmin) });
  } catch (error) {
    console.error("Erreur listerCodes:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des codes VIP." });
  }
}

// POST /api/admin/vip/codes  { type: 'personnel' | 'partage', plafond, libelle, code? } : code vide = généré
async function creerCode(req, res) {
  try {
    const corps = req.body || {};
    const { type } = corps;
    if (!TYPES_CODE_VIP.includes(type)) return res.status(400).json({ message: "Type de code invalide (personnel ou partagé)." });

    let plafond = 1;
    if (type === 'partage') {
      plafond = nombre(corps.plafond);
      if (!Number.isInteger(plafond) || plafond < 1 || plafond > PLAFOND_MAX) {
        return res.status(400).json({ message: `Plafond d'un code partagé : nombre entier de 1 à ${PLAFOND_MAX}.` });
      }
    }
    if (corps.libelle !== undefined && corps.libelle !== null && typeof corps.libelle !== 'string') {
      return res.status(400).json({ message: "Libellé invalide." });
    }
    const libelle = nettoyer(corps.libelle);
    if (libelle.length > 80) return res.status(400).json({ message: "Libellé : 80 caractères au plus." });

    if (corps.code !== undefined && corps.code !== null && typeof corps.code !== 'string') {
      return res.status(400).json({ message: "Code invalide." });
    }
    const saisi = normaliserCode(corps.code);
    if (saisi && !CODE_VALIDE.test(saisi)) {
      return res.status(400).json({ message: "Code : 4 à 30 caractères, lettres, chiffres et tirets (ex. AHI-VIP-7K2Q)." });
    }

    let codeVip = null;
    for (let essai = 1; !codeVip; essai++) {
      const code = saisi || genererCode();
      try {
        codeVip = await CodeVip.create({ code, type, plafond, libelle, creePar: req.user.id });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        if (saisi) return res.status(409).json({ message: "Ce code existe déjà : choisissez-en un autre." });
        if (essai >= 5) throw error;
      }
    }

    await journaliser(req, {
      action: 'Création', entite: 'Code VIP', entiteId: codeVip._id,
      resume: `Code VIP ${nomCode(codeVip)} créé : ${type === 'personnel' ? 'personnel, 1 utilisation' : `partagé, ${plafond} utilisation(s) au plus`}`,
      apres: { type, plafond, libelle, actif: true }
    });
    return res.status(201).json({ message: "Code VIP créé.", code: versAdmin({ ...codeVip.toObject(), creePar: null }) });
  } catch (error) {
    console.error("Erreur creerCode:", error);
    return res.status(500).json({ message: "Erreur lors de la création du code VIP." });
  }
}

// PATCH /api/admin/vip/codes/:id  { actif: true | false } : désactiver (plus de nouvelle utilisation) ou réactiver
async function modifierCode(req, res) {
  try {
    if (typeof req.body?.actif !== 'boolean') return res.status(400).json({ message: "Indiquez si le code est actif (oui ou non)." });
    const codeVip = mongoose.isValidObjectId(req.params.id) ? await CodeVip.findOne({ _id: req.params.id, deletedAt: null }) : null;
    if (!codeVip) return res.status(404).json({ message: "Code VIP introuvable." });
    if (codeVip.actif === req.body.actif) {
      return res.status(400).json({ message: req.body.actif ? "Ce code est déjà actif." : "Ce code est déjà désactivé." });
    }

    codeVip.actif = req.body.actif;
    await codeVip.save();
    await journaliser(req, {
      action: 'Modification', entite: 'Code VIP', entiteId: codeVip._id,
      resume: `Code VIP ${nomCode(codeVip)} ${codeVip.actif ? 'réactivé' : 'désactivé'}`,
      avant: { actif: !codeVip.actif }, apres: { actif: codeVip.actif }
    });
    const peuple = await CodeVip.findById(codeVip._id).populate('utilisations.userId', 'username telephone').populate('creePar', 'username').lean();
    return res.status(200).json({ message: codeVip.actif ? "Code réactivé." : "Code désactivé : les comptes déjà VIP le restent.", code: versAdmin(peuple) });
  } catch (error) {
    console.error("Erreur modifierCode:", error);
    return res.status(500).json({ message: "Erreur lors de la modification du code VIP." });
  }
}

// GET /api/admin/vip/comptes : comptes VIP, actuels et retirés
async function listerComptes(req, res) {
  try {
    const comptes = await User.find({ 'vip.depuis': { $ne: null } })
      .select('username telephone quartier vip')
      .populate('vip.codeId', 'code type libelle')
      .populate('vip.retirePar', 'username')
      .sort({ 'vip.actif': -1, 'vip.depuis': -1 })
      .lean();
    return res.status(200).json({
      comptes: comptes.map(c => ({
        _id: c._id, username: c.username, telephone: c.telephone || '', quartier: c.quartier || '',
        vip: {
          actif: !!c.vip.actif, depuis: c.vip.depuis,
          code: c.vip.codeId?.code ?? '', typeCode: c.vip.codeId?.type ?? '', libelleCode: c.vip.codeId?.libelle ?? '',
          retireLe: c.vip.retireLe, retirePar: c.vip.retirePar?.username ?? ''
        }
      }))
    });
  } catch (error) {
    console.error("Erreur listerComptes:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des comptes VIP." });
  }
}

// POST /api/admin/vip/comptes/:id/retrait  { motif? } : le compte perd le statut VIP (ses commandes restent)
async function retirerVip(req, res) {
  try {
    if (req.body?.motif !== undefined && req.body.motif !== null && typeof req.body.motif !== 'string') {
      return res.status(400).json({ message: "Motif invalide." });
    }
    const motif = nettoyer(req.body?.motif).slice(0, 300);
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Compte introuvable." });

    const maintenant = new Date();
    const compte = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'user', 'vip.actif': true },
      { $set: { 'vip.actif': false, 'vip.retireLe': maintenant, 'vip.retirePar': req.user.id } },
      { returnDocument: 'after' }
    ).select('username vip').lean();
    if (!compte) return res.status(404).json({ message: "Aucun compte VIP actif ne correspond." });

    await journaliser(req, {
      action: 'Modification', entite: 'Compte VIP', entiteId: compte._id,
      resume: `Statut VIP retiré à ${compte.username}${motif ? ` : ${motif}` : ''}`,
      avant: { actif: true }, apres: { actif: false }
    });
    return res.status(200).json({ message: `${compte.username} n'a plus le statut VIP.` });
  } catch (error) {
    console.error("Erreur retirerVip:", error);
    return res.status(500).json({ message: "Erreur lors du retrait du statut VIP." });
  }
}

module.exports = { utiliserCode, catalogueVip, listerCodes, creerCode, modifierCode, listerComptes, retirerVip };
