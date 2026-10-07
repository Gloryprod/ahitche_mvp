const AuditLog = require('../models/auditLog');
const ExchangeRate = require('../models/exchangeRate');

const TAUX_CONVENTION = 571; // Taux USD/FCFA de la Convention N°171, utilisé tant qu'aucun taux n'est enregistré

/**
 * Enregistre une ligne dans le journal des modifications (finances et prix).
 * N'interrompt jamais l'action principale : une erreur de journal est seulement loguée.
 */
async function journaliser(req, { action, entite, entiteId = '', resume, avant = null, apres = null }, session = null) {
  try {
    await AuditLog.create([{
      utilisateur: req.user.id,
      role: req.user.role,
      action, entite, entiteId: String(entiteId), resume, avant, apres
    }], { session });
  } catch (error) {
    console.error("Erreur journaliser:", error);
  }
}

// Taux USD/FCFA en vigueur : le plus récent enregistré, sinon celui de la convention
async function tauxCourant() {
  const dernier = await ExchangeRate.findOne().sort({ createdAt: -1 });
  return dernier?.tauxUsdFcfa ?? TAUX_CONVENTION;
}

module.exports = { journaliser, tauxCourant, TAUX_CONVENTION };
