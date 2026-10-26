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
 * @param {function} [o.compteDe] - Identifiant du compte à partir de la requête (par défaut : l'e-mail saisi)
 * @param {string} [o.message] - Message en cas de dépassement (« Réessayez dans … » est ajouté)
 */
function limiteTentatives({ nom, minutes, maxParCompte, maxParIp, echecsSeulement = false, compteDe = emailDe, message = 'Trop de tentatives.' }) {
  const fenetreMs = minutes * 60 * 1000;
  return (req, res, next) => {
    const email = compteDe(req);
    const cles = [
      ...(maxParCompte && email ? [[`${nom}:compte:${email}`, maxParCompte]] : []),
      [`${nom}:ip:${req.ip}`, maxParIp]
    ];
    const bloque = cles.map(([cle, max]) => depasse(cle, max)).find(Boolean);
    if (bloque) {
      const attente = Math.max(1, Math.ceil((bloque.finLe - Date.now()) / 60000));
      res.set('Retry-After', String(attente * 60));
      return res.status(429).json({ message: `${message} Réessayez dans ${attente} minute${attente > 1 ? 's' : ''}.` });
    }
    if (!echecsSeulement) {
      for (const [cle] of cles) enregistrer(cle, fenetreMs);
      return next();
    }
    // Connexion, code VIP : un échec compte, un succès efface le compteur du compte. L'essai est compté dès son
    // arrivée (des requêtes envoyées en même temps ne passent pas toutes avant la fin de la première), puis
    // décompté si la réponse est un succès.
    for (const [cle] of cles) enregistrer(cle, fenetreMs);
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const ip = compteurs.get(`${nom}:ip:${req.ip}`);
      if (ip && ip.nombre > 0) ip.nombre--;
      if (email) compteurs.delete(`${nom}:compte:${email}`);
    });
    next();
  };
}

module.exports = { limiteTentatives };
