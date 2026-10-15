const Mesure = require('../../models/mesure');

// GET /api/admin/mesures?jours=30 : fréquentation du site (pages vues, clics WhatsApp) sur la période
async function resumeFrequentation(req, res) {
  try {
    const jours = Math.min(365, Math.max(1, parseInt(req.query.jours, 10) || 30));
    const debut = new Date(Date.now() - (jours - 1) * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Porto-Novo' });
    const lignes = await Mesure.find({ jour: { $gte: debut } }).lean();

    const total = (evenement) => lignes.filter(l => l.evenement === evenement).reduce((s, l) => s + l.nombre, 0);
    const classement = (evenement, n = 6) => {
      const parDetail = new Map();
      for (const l of lignes.filter(x => x.evenement === evenement)) parDetail.set(l.detail || '(non précisé)', (parDetail.get(l.detail || '(non précisé)') || 0) + l.nombre);
      return [...parDetail].map(([detail, nombre]) => ({ detail, nombre })).sort((a, b) => b.nombre - a.nombre).slice(0, n);
    };
    const parJour = new Map();
    for (const l of lignes) {
      const j = parJour.get(l.jour) || { jour: l.jour, visites: 0, clics: 0 };
      if (l.evenement === 'visite') j.visites += l.nombre; else j.clics += l.nombre;
      parJour.set(l.jour, j);
    }

    const visites = total('visite');
    const clics = total('clic_whatsapp');
    return res.status(200).json({
      jours, depuis: debut, visites, clicsWhatsApp: clics,
      tauxClic: visites ? Math.round((clics / visites) * 1000) / 10 : null, // % des pages vues suivies d'un clic
      pages: classement('visite'),
      origines: classement('clic_whatsapp'),
      parJour: [...parJour.values()].sort((a, b) => a.jour.localeCompare(b.jour))
    });
  } catch (error) {
    console.error('Erreur resumeFrequentation:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement de la fréquentation.' });
  }
}

module.exports = { resumeFrequentation };
