const jwt = require('jsonwebtoken');
const User = require('../models/user');

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


// Vérifie le rôle de l'utilisateur connecté (à placer après verifyToken)
// Le rôle est relu en base : le JWT ne contient que l'id, et un changement de rôle s'applique immédiatement
exports.checkRole = (roles) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select('role');

      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ message: 'Action non autorisée pour votre rôle' });
      }

      req.user.role = user.role;
      next();
    } catch (error) {
      console.error("Erreur checkRole:", error);
      return res.status(500).json({ message: "Erreur serveur lors de la vérification des droits." });
    }
  };
};
