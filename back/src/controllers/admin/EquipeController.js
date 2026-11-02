const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const Partner = require('../../models/partner');
const { EQUIPE } = require('../../config/roles');
const { journaliser } = require('../../services/journalService');
const { ouvrirSession } = require('../../services/sessionService');
const { echapperRegex, normaliserEmail, EMAIL_VALIDE } = require('../../utils/texte');
const { MOT_DE_PASSE_MIN, envoyerLienReinitialisation } = require('../AuthController');

// Écran « Équipe et accès » (docs-internes/equipe/CONCEPT.md), section « equipe » : rôle admin (admin principal et
// autres admins). Comptes de l'équipe seulement (tout rôle sauf client) ; un compte client ne s'édite jamais ici.
// Garde-fous :
//  - le compte admin principal n'est modifié, désactivé ou doté d'un mot de passe provisoire que par lui-même ;
//  - personne ne se désactive soi-même ni ne retire son propre rôle d'admin ; l'admin principal reste admin ;
//  - mot de passe ou e-mail changé, compte désactivé : sessions ouvertes coupées (User.versionSession + 1).
// Les mots de passe ne sont jamais lisibles : le provisoire est renvoyé une seule fois, jamais journalisé.

const ALPHABET_MOT_DE_PASSE = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // Sans 0/O/o, 1/I/l/i
const LONGUEUR_PROVISOIRE = 10;
const MOT_DE_PASSE_MAX = 200;
const NOM_MAX = 60;

const nettoyer = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

function genererMotDePasse() {
  let mot = '';
  for (let i = 0; i < LONGUEUR_PROVISOIRE; i++) mot += ALPHABET_MOT_DE_PASSE[crypto.randomInt(ALPHABET_MOT_DE_PASSE.length)];
  return mot;
}

// Membre tel que renvoyé à l'écran : jamais de mot de passe, de jeton ni de version de session
const versEcran = (u, req) => ({
  _id: u._id, username: u.username, email: u.email, role: u.role, adminPrincipal: !!u.adminPrincipal,
  livreurId: u.livreurId?._id ?? u.livreurId ?? null, livreurNom: u.livreurId?.nom ?? '',
  actif: u.actif !== false, derniereConnexion: u.derniereConnexion ?? null, motDePasseModifieLe: u.motDePasseModifieLe ?? null,
  creeLe: u.createdAt, estMoi: String(u._id) === String(req.user.id)
});

// Ce que le journal garde d'un compte : jamais de mot de passe, même haché
const versJournal = (u) => ({
  username: u.username, email: u.email, role: u.role, livreurId: u.livreurId ? String(u.livreurId._id ?? u.livreurId) : null, actif: u.actif !== false
});

const CHAMPS = 'username email role adminPrincipal livreurId actif derniereConnexion motDePasseModifieLe createdAt';
const peupler = (requete) => requete.select(CHAMPS).populate('livreurId', 'nom');

// Membre de l'équipe ciblé ; envoie l'erreur et renvoie null s'il est introuvable, client, ou admin principal
// d'un autre que lui-même
async function membreCible(req, res) {
  const membre = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
  if (!membre || membre.role === 'user') {
    res.status(404).json({ message: "Membre de l'équipe introuvable (les comptes clients se gèrent dans Clients)." });
    return null;
  }
  if (membre.adminPrincipal && String(membre._id) !== String(req.user.id)) {
    res.status(403).json({ message: "Seul l'admin principal peut modifier son propre compte." });
    return null;
  }
  return membre;
}

/**
 * Lit nom, e-mail, rôle et fiche livreur (création et modification), sans toucher au compte.
 * @returns {Promise<{ erreur, statut } | { champs }>}
 */
async function lireMembre(body, idExistant = null) {
  const username = nettoyer(body?.username);
  if (!username || username.length > NOM_MAX) return { statut: 400, erreur: `Indiquez le nom (${NOM_MAX} caractères au plus).` };
  if (typeof body.email !== 'string') return { statut: 400, erreur: 'Adresse e-mail invalide.' };
  const email = normaliserEmail(body.email);
  if (!EMAIL_VALIDE.test(email) || email.length > 120) return { statut: 400, erreur: 'Adresse e-mail invalide.' };
  if (body.role === 'user') return { statut: 400, erreur: "Un compte client ne se crée ni ne se gère ici : choisissez un rôle de l'équipe." };
  if (!EQUIPE.includes(body.role)) return { statut: 400, erreur: "Rôle inconnu : choisissez un rôle de l'équipe." };

  let livreurId = null;
  const ficheDemandee = body.livreurId !== undefined && body.livreurId !== null && body.livreurId !== '';
  if (ficheDemandee) {
    if (body.role !== 'gestionnaire') return { statut: 400, erreur: "Une fiche livreur ne se relie qu'à un gestionnaire." };
    if (!mongoose.isValidObjectId(body.livreurId)) return { statut: 400, erreur: 'Fiche livreur invalide.' };
    const fiche = await Partner.exists({ _id: body.livreurId, type: 'Livreur', actif: true, deletedAt: null });
    if (!fiche) return { statut: 400, erreur: 'Fiche livreur introuvable ou inactive (voir Prestataires).' };
    livreurId = body.livreurId;
  }

  // Adresse et nom uniques (les anciens comptes enregistrés avec des majuscules comptent aussi)
  const autre = idExistant ? { _id: { $ne: idExistant } } : {};
  if (await User.exists({ ...autre, $or: [{ email }, { email: { $regex: `^${echapperRegex(email)}$`, $options: 'i' } }] })) {
    return { statut: 409, erreur: 'Cette adresse e-mail est déjà utilisée par un autre compte.' };
  }
  if (await User.exists({ ...autre, username })) return { statut: 409, erreur: 'Ce nom est déjà utilisé par un autre compte : ajoutez par exemple un prénom.' };

  return { champs: { username, email, role: body.role, livreurId } };
}

// Mot de passe provisoire : saisi (MOT_DE_PASSE_MIN caractères au moins) ou généré par le serveur
function lireMotDePasse(body) {
  const saisi = body?.motDePasse;
  if (saisi === undefined || saisi === null || saisi === '') return { motDePasse: genererMotDePasse(), genere: true };
  if (typeof saisi !== 'string' || saisi.length < MOT_DE_PASSE_MIN || saisi.length > MOT_DE_PASSE_MAX) {
    return { erreur: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères (ou laissez le champ vide pour en générer un).` };
  }
  return { motDePasse: saisi, genere: false };
}

// Le membre connecté vient de couper ses propres sessions (mot de passe, e-mail) : sa session actuelle est rouverte
// avec la nouvelle version, pour qu'il ne soit pas déconnecté de l'écran qu'il utilise
const garderMaSession = (req, res, membre) => { if (String(membre._id) === String(req.user.id)) ouvrirSession(res, membre); };

// GET /api/admin/equipe -> { membres: [...], fichesLivreur: [{ _id, nom }] }
async function listerEquipe(req, res) {
  try {
    const [membres, fiches] = await Promise.all([
      peupler(User.find({ role: { $ne: 'user' } })).sort({ adminPrincipal: -1, username: 1 }).lean(),
      Partner.find({ type: 'Livreur', actif: true, deletedAt: null }).select('nom').sort({ nom: 1 }).lean()
    ]);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ membres: membres.map(m => versEcran(m, req)), fichesLivreur: fiches.map(f => ({ _id: f._id, nom: f.nom })) });
  } catch (error) {
    console.error('Erreur listerEquipe:', error);
    return res.status(500).json({ message: "Erreur lors du chargement de l'équipe." });
  }
}

// POST /api/admin/equipe  { username, email, role, livreurId?, motDePasse? } -> 201 { message, membre, motDePasseProvisoire }
async function creerMembre(req, res) {
  try {
    const lu = await lireMembre(req.body || {});
    if (lu.erreur) return res.status(lu.statut).json({ message: lu.erreur });
    const mdp = lireMotDePasse(req.body);
    if (mdp.erreur) return res.status(400).json({ message: mdp.erreur });

    const membre = await User.create({
      ...lu.champs, password: await bcrypt.hash(mdp.motDePasse, 10), motDePasseModifieLe: new Date(), actif: true
    });
    await journaliser(req, {
      action: 'Création', entite: "Compte de l'équipe", entiteId: membre._id,
      resume: `Compte ${membre.role} créé pour ${membre.username} (${membre.email}), mot de passe provisoire ${mdp.genere ? 'généré' : 'saisi'}`,
      apres: versJournal(membre)
    });
    return res.status(201).json({
      message: `Compte de ${membre.username} créé. Transmettez-lui le mot de passe provisoire : il ne sera plus affiché.`,
      membre: versEcran(await peupler(User.findById(membre._id)).lean(), req),
      motDePasseProvisoire: mdp.motDePasse
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Cette adresse e-mail ou ce nom est déjà utilisé par un autre compte.' });
    console.error('Erreur creerMembre:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du compte.' });
  }
}

// PUT /api/admin/equipe/:id  { username, email, role, livreurId } -> { message, membre }
// Un nouvel e-mail coupe les sessions du compte ; l'ancienne adresse redevient libre (compte client possible)
async function modifierMembre(req, res) {
  try {
    const membre = await membreCible(req, res);
    if (!membre) return;
    const lu = await lireMembre(req.body || {}, membre._id);
    if (lu.erreur) return res.status(lu.statut).json({ message: lu.erreur });
    const { champs } = lu;

    const soiMeme = String(membre._id) === String(req.user.id);
    if (soiMeme && membre.role === 'admin' && champs.role !== 'admin') {
      return res.status(400).json({ message: "Vous ne pouvez pas retirer votre propre rôle d'admin." });
    }
    if (membre.adminPrincipal && champs.role !== 'admin') {
      return res.status(400).json({ message: "Le compte admin principal garde toujours le rôle admin." });
    }

    const avant = versJournal(membre);
    const emailChange = champs.email !== membre.email;
    Object.assign(membre, champs);
    if (emailChange) {
      membre.versionSession = (membre.versionSession ?? 0) + 1;
      membre.resetPasswordToken = null; // Un lien de réinitialisation envoyé à l'ancienne adresse ne sert plus
      membre.resetPasswordExpires = null;
    }
    const apres = versJournal(membre);
    const changements = Object.keys(apres).filter(cle => avant[cle] !== apres[cle]);
    if (!changements.length) {
      return res.status(200).json({ message: 'Aucune modification.', membre: versEcran(await peupler(User.findById(membre._id)).lean(), req) });
    }

    await membre.save();
    if (emailChange) garderMaSession(req, res, membre);
    await journaliser(req, {
      action: 'Modification', entite: "Compte de l'équipe", entiteId: membre._id,
      resume: `Compte de ${membre.username} modifié (${changements.join(', ')})${emailChange ? ' : sessions coupées' : ''}`,
      avant, apres
    });
    return res.status(200).json({
      message: emailChange ? 'Compte modifié. Le membre se reconnecte avec sa nouvelle adresse.' : 'Compte modifié.',
      membre: versEcran(await peupler(User.findById(membre._id)).lean(), req)
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Cette adresse e-mail ou ce nom est déjà utilisé par un autre compte.' });
    console.error('Erreur modifierMembre:', error);
    return res.status(500).json({ message: 'Erreur lors de la modification du compte.' });
  }
}

// POST /api/admin/equipe/:id/mot-de-passe  { motDePasse? } -> { message, membre, motDePasseProvisoire }
// Saisi ou généré ; le membre n'est pas obligé de le changer. Sessions ouvertes coupées.
async function definirMotDePasse(req, res) {
  try {
    const membre = await membreCible(req, res);
    if (!membre) return;
    const mdp = lireMotDePasse(req.body);
    if (mdp.erreur) return res.status(400).json({ message: mdp.erreur });

    const avant = membre.motDePasseModifieLe ?? null;
    membre.password = await bcrypt.hash(mdp.motDePasse, 10);
    membre.motDePasseModifieLe = new Date();
    membre.versionSession = (membre.versionSession ?? 0) + 1;
    membre.resetPasswordToken = null; // Un lien de réinitialisation déjà envoyé ne sert plus
    membre.resetPasswordExpires = null;
    await membre.save();
    garderMaSession(req, res, membre);
    await journaliser(req, {
      action: 'Modification', entite: "Compte de l'équipe", entiteId: membre._id,
      resume: `Mot de passe provisoire ${mdp.genere ? 'généré' : 'saisi'} pour ${membre.username} : sessions coupées`,
      avant: { motDePasseModifieLe: avant }, apres: { motDePasseModifieLe: membre.motDePasseModifieLe }
    });
    return res.status(200).json({
      message: `Mot de passe provisoire de ${membre.username} enregistré. Transmettez-le-lui : il ne sera plus affiché.`,
      membre: versEcran(await peupler(User.findById(membre._id)).lean(), req),
      motDePasseProvisoire: mdp.motDePasse
    });
  } catch (error) {
    console.error('Erreur definirMotDePasse:', error);
    return res.status(500).json({ message: 'Erreur lors du changement de mot de passe.' });
  }
}

// PATCH /api/admin/equipe/:id/statut  { actif: true | false } -> { message, membre }
// Désactivé : plus de connexion et sessions coupées tout de suite ; rien n'est supprimé
async function changerStatut(req, res) {
  try {
    if (typeof req.body?.actif !== 'boolean') return res.status(400).json({ message: 'Indiquez si le compte est actif (oui ou non).' });
    const membre = await membreCible(req, res);
    if (!membre) return;
    const { actif } = req.body;
    if (!actif && String(membre._id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas désactiver votre propre compte.' });
    }
    if ((membre.actif !== false) === actif) {
      return res.status(200).json({ message: 'Aucune modification.', membre: versEcran(await peupler(User.findById(membre._id)).lean(), req) });
    }

    membre.actif = actif;
    if (!actif) membre.versionSession = (membre.versionSession ?? 0) + 1;
    await membre.save();
    await journaliser(req, {
      action: 'Modification', entite: "Compte de l'équipe", entiteId: membre._id,
      resume: `Compte de ${membre.username} ${actif ? 'réactivé' : 'désactivé : sessions coupées'}`,
      avant: { actif: !actif }, apres: { actif }
    });
    return res.status(200).json({
      message: actif ? `Compte de ${membre.username} réactivé.` : `Compte de ${membre.username} désactivé : il ne peut plus se connecter.`,
      membre: versEcran(await peupler(User.findById(membre._id)).lean(), req)
    });
  } catch (error) {
    console.error('Erreur changerStatut:', error);
    return res.status(500).json({ message: 'Erreur lors du changement de statut.' });
  }
}

// POST /api/admin/equipe/:id/lien-reinitialisation -> { message } : même lien que « mot de passe oublié » (1 heure)
async function envoyerLien(req, res) {
  try {
    const membre = await membreCible(req, res);
    if (!membre) return;
    if (membre.actif === false) return res.status(400).json({ message: "Ce compte est désactivé : réactivez-le d'abord." });
    await envoyerLienReinitialisation(membre);
    await journaliser(req, {
      action: 'Modification', entite: "Compte de l'équipe", entiteId: membre._id,
      resume: `Lien de réinitialisation du mot de passe envoyé à ${membre.username} (${membre.email})`
    });
    return res.status(200).json({ message: `Lien envoyé à ${membre.email} (valable 1 heure).` });
  } catch (error) {
    console.error('Erreur envoyerLien:', error);
    return res.status(500).json({ message: "Erreur lors de l'envoi du lien." });
  }
}

module.exports = { listerEquipe, creerMembre, modifierMembre, definirMotDePasse, changerStatut, envoyerLien };
