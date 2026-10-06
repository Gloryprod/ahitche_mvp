// Limite les tentatives sur les routes sensibles (connexion, mot de passe oublié, inscription) : force brute.
// Compteurs en mémoire (une instance de serveur), par compte (e-mail) et par adresse IP.
// Derrière un proxy (hébergeur), définir TRUST_PROXY pour que l'adresse IP du visiteur soit la bonne.

const compteurs = new Map(); // cle -> { nombre, finLe }

function enregistrer(cle, fenetreMs) {
  const maintenant = Date.now();
  const c = compteurs.get(cle);
  if (!c || c.finLe <= maintenant) compteurs.set(cle, { nombre: 1, finLe: maintenant + fenetreMs });
  else c.nombre++;
}

function depasse(cle, max) {
  const c = compteurs.get(cle);
  return c && c.finLe > Date.now() && c.nombre >= max ? c : null;
}

// Purge des compteurs expirés
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, c] of compteurs) if (c.finLe <= maintenant) compteurs.delete(cle);
}, 10 * 60 * 1000).unref();

const emailDe = (req) => String(req.body?.email ?? '').trim().toLowerCase();

/**
 * @param {object} o
 * @param {string} o.nom - Préfixe des compteurs (ex. 'connexion')
 * @param {number} o.minutes - Fenêtre de comptage
 * @param {number} o.maxParCompte - Tentatives par e-mail dans la fenêtre (0 : pas de limite par compte)
 * @param {number} o.maxParIp - Tentatives par adresse IP dans la fenêtre
 * @param {boolean} [o.echecsSeulement] - Ne compter que les réponses en erreur ; un succès remet le compte à zéro
 */
function limiteTentatives({ nom, minutes, maxParCompte, maxParIp, echecsSeulement = false }) {
  const fenetreMs = minutes * 60 * 1000;
  return (req, res, next) => {
    const email = emailDe(req);
    const cles = [
      ...(maxParCompte && email ? [[`${nom}:compte:${email}`, maxParCompte]] : []),
      [`${nom}:ip:${req.ip}`, maxParIp]
    ];
    const bloque = cles.map(([cle, max]) => depasse(cle, max)).find(Boolean);
    if (bloque) {
      const attente = Math.max(1, Math.ceil((bloque.finLe - Date.now()) / 60000));
      res.set('Retry-After', String(attente * 60));
      return res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${attente} minute${attente > 1 ? 's' : ''}.` });
    }
    if (!echecsSeulement) {
      for (const [cle] of cles) enregistrer(cle, fenetreMs);
      return next();
    }
    // Connexion : un échec compte, un succès efface le compteur du compte
    res.on('finish', () => {
      if (res.statusCode >= 400 && res.statusCode !== 429) for (const [cle] of cles) enregistrer(cle, fenetreMs);
      else if (res.statusCode < 400 && email) compteurs.delete(`${nom}:compte:${email}`);
    });
    next();
  };
}

module.exports = { limiteTentatives };
