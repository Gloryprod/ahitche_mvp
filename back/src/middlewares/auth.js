const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { politiqueInactivite, ouvrirSession, prolongerSessionSiBesoin } = require('../services/sessionService');

// Vérifie si l'utilisateur est connecté
exports.verifyToken = (req, res, next) => {
    // 💡 On récupère le token stocké secrètement dans les cookies
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "Accès refusé. Aucun jeton fourni." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, inactivite? } : voir services/sessionService.js
        prolongerSessionSiBesoin(res, decoded); // Session glissante des comptes soumis à l'inactivité
        next();
    } catch (error) {
        res.status(401).json({ message: "Jeton invalide ou expiré." });
    }
};


// Vérifie le rôle de l'utilisateur connecté (à placer après verifyToken)
// Le rôle est relu en base : le JWT ne contient que l'id, et un changement de rôle s'applique immédiatement.
// Il en va de même pour la politique d'inactivité de la session (rôle ou admin principal modifié).
exports.checkRole = (roles) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select('role adminPrincipal');

      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ message: 'Action non autorisée pour votre rôle' });
      }

      if ((req.user.inactivite ?? null) !== politiqueInactivite(user)) ouvrirSession(res, user);

      req.user.role = user.role;
      next();
    } catch (error) {
      console.error("Erreur checkRole:", error);
      return res.status(500).json({ message: "Erreur serveur lors de la vérification des droits." });
    }
  };
};

// Droits d'une section selon la méthode HTTP (à placer après checkRole, qui renseigne req.user.role) :
// GET = lecture, toute autre méthode = écriture. Voir config/roles.js.
exports.acces = ({ lecture, ecriture }) => {
  return (req, res, next) => {
    const roles = req.method === 'GET' ? lecture : ecriture;
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: req.method === 'GET'
          ? 'Cette section ne fait pas partie de vos accès.'
          : 'Votre rôle permet seulement de consulter cette section.'
      });
    }
    next();
  };
};
