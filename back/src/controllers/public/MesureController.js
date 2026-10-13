const Mesure = require('../../models/mesure');
const { EVENEMENTS } = require('../../models/mesure');

// Robots d'indexation et outils : non comptés (l'en-tête est lu puis oublié, jamais enregistré)
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|lighthouse|headless|curl|wget|python|node-fetch|axios/i;
const DETAIL_VALIDE = /^[\p{L}\p{N}/:._-]{0,80}$/u;

const jourACotonou = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' });

// POST /api/public/mesure  { evenement, detail } (texte JSON envoyé par navigator.sendBeacon) -> 204
// Ajoute 1 au total du jour ; aucune donnée sur le visiteur n'est gardée.
async function enregistrerMesure(req, res) {
  try {
    if (ROBOT.test(req.get('user-agent') || '')) return res.status(204).end();
    let corps = req.body;
    if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch { return res.status(400).end(); } }
    const evenement = corps?.evenement;
    const detail = typeof corps?.detail === 'string' ? corps.detail.trim().slice(0, 80) : '';
    if (!EVENEMENTS.includes(evenement) || !DETAIL_VALIDE.test(detail)) return res.status(400).end();
    await Mesure.updateOne({ jour: jourACotonou(), evenement, detail }, { $inc: { nombre: 1 } }, { upsert: true });
    return res.status(204).end();
  } catch (error) {
    console.error('Erreur enregistrerMesure:', error.message);
    return res.status(500).end();
  }
}

module.exports = { enregistrerMesure };
