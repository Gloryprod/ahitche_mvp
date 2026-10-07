// Session de connexion : jeton JWT dans un cookie HttpOnly.
//  - Clients et admin principal : session de 1 jour.
//  - Autres comptes de l'équipe : déconnexion après une période d'inactivité (INACTIVITE_MINUTES, 60 par défaut),
//    utile sur les appareils partagés. Le jeton expire au bout de cette durée et chaque requête le prolonge
//    (session glissante) ; le navigateur déconnecte de son côté après la même durée sans clic, frappe ni
//    défilement (front : composables/useDeconnexionInactivite.ts).
const jwt = require('jsonwebtoken');
const { EQUIPE } = require('../config/roles');

// Options communes du cookie de session.
// SameSite=Lax suffit : le site (ahitchebj.com) et l'API (api.ahitchebj.com) sont sur le même site.
// Secure uniquement en production : en local (http), un cookie Secure serait refusé par le navigateur.
const OPTIONS_COOKIE = {
    httpOnly: true,                                 // Invisible en JS (protège contre le vol par XSS)
    secure: process.env.NODE_ENV === 'production',  // HTTPS requis en production
    sameSite: 'lax',                                // Pas envoyé depuis un autre site (protection CSRF)
    path: '/'
};

const DUREE_SESSION_LONGUE = 24 * 60 * 60; // 1 jour, en secondes

// Durée d'inactivité tolérée, en minutes (lue à chaque appel : la variable peut être réduite pour un test)
function minutesInactivite() {
    const minutes = Number(process.env.INACTIVITE_MINUTES);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

// Minutes d'inactivité avant déconnexion pour ce compte, ou null (session de 1 jour)
function politiqueInactivite(user) {
    const adminPrincipal = user.role === 'admin' && user.adminPrincipal === true;
    return EQUIPE.includes(user.role) && !adminPrincipal ? minutesInactivite() : null;
}

// Le jeton d'un compte soumis à l'inactivité dure un peu plus que la limite (2 minutes au plus) : le navigateur
// déconnecte toujours le premier, avec le bon message ; le serveur reste le filet de sécurité (onglet fermé…).
function dureeJeton(inactivite) {
    if (!inactivite) return DUREE_SESSION_LONGUE;
    const limite = inactivite * 60;
    return limite + Math.min(2 * 60, limite / 4);
}

function poserJeton(res, contenu) {
    const duree = dureeJeton(contenu.inactivite);
    const token = jwt.sign(contenu, process.env.JWT_SECRET, { expiresIn: duree });
    res.cookie('token', token, { ...OPTIONS_COOKIE, maxAge: duree * 1000 }); // Le cookie expire avec le jeton
}

// Ouvre (ou rouvre) la session du compte ; renvoie la politique d'inactivité appliquée
function ouvrirSession(res, user) {
    const inactivite = politiqueInactivite(user);
    poserJeton(res, inactivite ? { id: String(user._id), inactivite } : { id: String(user._id) });
    return inactivite;
}

// Session glissante : une requête d'un compte soumis à l'inactivité repousse l'expiration.
// Le jeton n'est réémis qu'après quelques minutes (5 au plus), pas à chaque requête.
function prolongerSessionSiBesoin(res, decoded) {
    if (!decoded.inactivite) return;
    const age = Math.floor(Date.now() / 1000) - decoded.iat;
    if (age >= Math.min(5 * 60, (decoded.inactivite * 60) / 4)) {
        poserJeton(res, { id: decoded.id, inactivite: decoded.inactivite });
    }
}

// Jeton valide d'un compte relu en base : réémis si la politique a changé depuis la connexion
// (rôle, admin principal, durée configurée), sinon prolongé si besoin. Renvoie la politique en vigueur.
function actualiserSession(res, decoded, user) {
    const inactivite = politiqueInactivite(user);
    if ((decoded.inactivite ?? null) !== inactivite) return ouvrirSession(res, user);
    prolongerSessionSiBesoin(res, decoded);
    return inactivite;
}

module.exports = { OPTIONS_COOKIE, politiqueInactivite, ouvrirSession, prolongerSessionSiBesoin, actualiserSession };
