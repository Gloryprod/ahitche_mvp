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

// Prix VIP dans le journal (modifications de produits) : lus seulement par la section « vip » (admin, coordinateur).
// Pour les autres rôles qui lisent le journal (comptable, auditeur), ils sont masqués à la lecture, anciennes entrées
// comprises : « prix VIP : 525 → 600 » devient « prix VIP modifié », « prix VIP 410 » (création) « prix VIP fixé »,
// et prixVip disparaît de avant et après.
const sansPrixVip = (valeur) => {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur) || !('prixVip' in valeur)) return valeur;
  const { prixVip, ...reste } = valeur;
  return reste;
};
function masquerPrixVip(entree) {
  return {
    ...entree,
    resume: String(entree.resume ?? '')
      .replace(/prix VIP : \S+ → \S+/g, 'prix VIP modifié')
      .replace(/prix VIP \d[\d.,]*/g, 'prix VIP fixé'),
    avant: sansPrixVip(entree.avant),
    apres: sansPrixVip(entree.apres)
  };
}

// Taux USD/FCFA en vigueur : le plus récent enregistré, sinon celui de la convention
async function tauxCourant() {
  const dernier = await ExchangeRate.findOne().sort({ createdAt: -1 });
  return dernier?.tauxUsdFcfa ?? TAUX_CONVENTION;
}

module.exports = { journaliser, masquerPrixVip, tauxCourant, TAUX_CONVENTION };
