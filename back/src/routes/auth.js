const express = require('express');
const router = express.Router();
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middlewares/auth');

// 1. ROUTE D'INSCRIPTION (REGISTER)
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Cet email est déjà utilisé." });

        // Hacher le mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Créer et sauvegarder l'utilisateur
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "Utilisateur créé avec succès !" });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
    }
});

// 2. ROUTE DE CONNEXION (LOGIN)
router.post('/login', async (req, res) => {
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
});

router.post('/logout', (req, res) => {
    // Supprime le cookie contenant le token
    res.clearCookie('token');
    res.json({ message: "Déconnexion réussie !" });
});

router.get('/me', verifyToken, async (req, res) => {
    try {
        // req.user.id vient du middleware verifyToken juste au-dessus
        const user = await User.findById(req.user.id).select('-password'); // Exclut le mot de passe de la réponse
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé." });
        
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération du profil." });
    }
});

module.exports = router;
        