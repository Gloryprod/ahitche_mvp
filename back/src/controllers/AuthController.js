const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailServices');
const crypto = require('crypto');

async function register(req, res) {
    try {
        const { username, email, password, telephone } = req.body;

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
        emailService.sendWelcomeEmail(email, username);

        res.status(201).json({ message: "Utilisateur créé avec succès !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Identifiants incorrects." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Identifiants incorrects." });

        // Générer le jeton JWT (on utilise user._id au lieu de user._index qui n'existe pas par défaut)
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // 💡 ENVOI DU TOKEN DANS UN COOKIE HTTPONLY
        res.cookie('token', token, {
            httpOnly: true,                         // Protège contre les attaques XSS (invisible en JS)
            secure: process.env.NODE_ENV === 'production', // true en production (HTTPS requis)
            sameSite: 'none',                        // Protection CSRF basique
            maxAge: 24 * 60 * 60 * 1000            // Expire au bout de 1 jour (comme le JWT)
        });

        // On renvoie l'utilisateur au front, MAIS SANS LE TOKEN textuel
        res.json({
            user: { id: user._id, username: user.username, email: user.email, role: user.role || 'user' },
            message: "Connexion réussie !"
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la connexion." });
    }
}

async function logout(req, res) {
    // Supprime le cookie contenant le token
    res.clearCookie('token');
    res.json({ message: "Déconnexion réussie !" });
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
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 heure dans le futur
    await user.save();

    // 4. Créer le lien de réinitialisation qui pointe vers ton Frontend Vue
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    emailService.sendForgotPasswordMail(user, resetUrl);

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

        // 1. Chercher l'utilisateur avec le jeton valide ET non expiré
        // $gt: Date.now() vérifie que la date d'expiration est supérieure à l'heure actuelle
        const user = await User.findOne({
        resetPasswordToken: token,
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

module.exports = { register, login, logout, getUser, forgotPassword, resetPassword };
