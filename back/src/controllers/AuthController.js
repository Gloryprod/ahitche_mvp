const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailServices');
const crypto = require('crypto');
const { OPTIONS_COOKIE, ouvrirSession, actualiserSession } = require('../services/sessionService');

// Les jetons de réinitialisation sont stockés hachés : une fuite de la base ne permet pas de les réutiliser
function hacherJeton(jeton) {
    return crypto.createHash('sha256').update(jeton).digest('hex');
}

// Vérifie que chaque valeur est une chaîne non vide.
// Bloque les injections d'opérateurs MongoDB envoyées en JSON (ex : { "$ne": null }).
function sontDesChaines(...valeurs) {
    return valeurs.every(v => typeof v === 'string' && v.length > 0);
}

async function register(req, res) {
    try {
        const { username, email, password, telephone } = req.body;

        if (!sontDesChaines(username, email, password) || (telephone !== undefined && typeof telephone !== 'string')) {
            return res.status(400).json({ message: "Données d'inscription invalides." });
        }

        // Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Cet email est déjà utilisé." });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Créer et sauvegarder l'utilisateur
        const newUser = new User({ username, email, password: hashedPassword, telephone });
        await newUser.save();

        // Appel de la fonction
        await emailService.sendWelcomeEmail(email, username);

        res.status(201).json({ message: "Utilisateur créé avec succès !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!sontDesChaines(email, password)) {
            return res.status(400).json({ message: "Identifiants incorrects." });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Identifiants incorrects." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Identifiants incorrects." });

        // Jeton JWT dans un cookie HttpOnly : 1 jour, ou 1 h glissante pour l'équipe (sauf l'admin principal)
        const inactivite = ouvrirSession(res, user);

        // On renvoie l'utilisateur au front, MAIS SANS LE TOKEN textuel
        res.json({
            user: { id: user._id, username: user.username, email: user.email, role: user.role || 'user' },
            message: "Connexion réussie !",
            inactivite // Minutes d'inactivité avant déconnexion automatique (null : pas de limite)
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la connexion." });
    }
}

async function logout(req, res) {
    // Supprime le cookie contenant le token
    res.clearCookie('token', OPTIONS_COOKIE);
    res.json({ message: "Déconnexion réussie !" });
}

// GET /api/auth/session : état de la session pour l'affichage (menu « Mon espace »…).
// Répond toujours 200, avec user: null pour un visiteur : aucune erreur dans la console des pages publiques.
async function session(req, res) {
    res.set('Cache-Control', 'no-store'); // Données personnelles : aucun cache (navigateur ni proxy d'opérateur)
    const sansSession = () => res.status(200).json({ user: null });
    const token = req.cookies?.token;
    if (!token) return sansSession();

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        // Jeton expiré ou invalide : on le retire du navigateur
        res.clearCookie('token', OPTIONS_COOKIE);
        return sansSession();
    }

    try {
        const user = await User.findById(decoded.id).select('-password -resetPasswordToken -resetPasswordExpires');
        if (!user) {
            res.clearCookie('token', OPTIONS_COOKIE);
            return sansSession();
        }
        // Session glissante prolongée, ou réémise si la politique du compte a changé (rôle, admin principal)
        const inactivite = actualiserSession(res, decoded, user);
        return res.status(200).json({ user, inactivite });
    } catch (error) {
        console.error("Erreur session:", error);
        return res.status(500).json({ message: "Erreur serveur lors de la vérification de la session." });
    }
}

async function getUser(req, res) {
    try {
        // req.user.id vient du middleware verifyToken juste au-dessus
        const user = await User.findById(req.user.id).select('-password'); // Exclut le mot de passe de la réponse
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé." });
        
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération du profil." });
    }   
}

async function forgotPassword(req, res) {
    try {
    const { email } = req.body;

    if (!sontDesChaines(email)) {
      return res.status(400).json({ message: "Adresse e-mail invalide." });
    }

    // 1. Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      // Sécurité : on renvoie un message générique pour éviter le "User Enumeration"
      return res.status(200).json({ 
        message: "Si ce compte existe, un lien de réinitialisation vous a été envoyé !" 
      });
    }

    // 2. Générer un jeton unique (hexadécimal de 32 octets)
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // 3. Sauvegarder le token et l'expiration (Valable 1 heure)
    user.resetPasswordToken = hacherJeton(resetToken); // Seul le lien envoyé par e-mail contient le jeton en clair
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 heure dans le futur
    await user.save();

    // 4. Créer le lien de réinitialisation qui pointe vers ton Frontend Vue
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    await emailService.sendForgotPasswordMail(user, resetUrl);

    return res.status(200).json({ 
      message: "Si ce mail existe, un lien de réinitialisation vous a été envoyé. Veuillez vérifier votre boîte mail !" 
    });

  } catch (error) {
    console.error("Erreur forgotPassword:", error);
    return res.status(500).json({ message: "Une erreur interne est survenue." });
  }
}

async function resetPassword(req, res) {
    try {
        const { token, password } = req.body;

        if (!sontDesChaines(token, password)) {
            return res.status(400).json({
                message: "Le lien de réinitialisation est invalide ou a expiré."
            });
        }

        // 1. Chercher l'utilisateur avec le jeton valide ET non expiré
        // $gt: Date.now() vérifie que la date d'expiration est supérieure à l'heure actuelle
        const user = await User.findOne({
        resetPasswordToken: hacherJeton(token),
        resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
        return res.status(400).json({ 
            message: "Le lien de réinitialisation est invalide ou a expiré." 
        });
        }

        // 2. Hacher le nouveau mot de passe
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // 3. Nettoyer les jetons pour qu'ils ne soient plus réutilisables
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;

        // 4. Sauvegarder les modifications
        await user.save();

        return res.status(200).json({ 
        message: "Votre mot de passe a été réinitialisé avec succès ! Vous pouvez maintenant vous connecter." 
        });

    } catch (error) {
        console.error("Erreur resetPassword:", error);
        return res.status(500).json({ message: "Une erreur interne est survenue." });
    }
}

module.exports = { register, login, logout, session, getUser, forgotPassword, resetPassword };
