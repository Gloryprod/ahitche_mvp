const jwt = require('jsonwebtoken');

// Vérifie si l'utilisateur est connecté
exports.verifyToken = (req, res, next) => {
    // 💡 On récupère le token stocké secrètement dans les cookies
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "Accès refusé. Aucun jeton fourni." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Contient l'ID utilisateur encodé à la connexion ({ id: ... })
        next();
    } catch (error) {
        res.status(401).json({ message: "Jeton invalide ou expiré." });
    }
};


exports.checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Action non autorisée pour votre rôle' });
    }
    next();
  };
};