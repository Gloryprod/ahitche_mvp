const Zone = require('../models/zone');

// Tri d'affichage : Abomey-Calavi puis Cotonou, zone prioritaire en tête, puis ordre naturel (2e avant 10e)
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const trierZones = (zones) => zones.sort((a, b) =>
  collator.compare(a.commune, b.commune) || (b.prioritaire - a.prioritaire) || collator.compare(a.nom, b.nom)
);

// GET /api/public/zones : zones actives et leurs quartiers, pour le sélecteur d'adresse des clients
async function listerZonesPubliques(req, res) {
  try {
    const zones = await Zone.find({ actif: true })
      .select('code commune nom quartiers prioritaire -_id')
      .lean();
    return res.status(200).json(trierZones(zones));
  } catch (error) {
    console.error("Erreur listerZonesPubliques:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des zones de livraison." });
  }
}

// GET /api/admin/zones : toutes les zones, avec tarif de course et état
async function listerZonesAdmin(req, res) {
  try {
    const zones = await Zone.find().lean();
    return res.status(200).json(trierZones(zones));
  } catch (error) {
    console.error("Erreur listerZonesAdmin:", error);
    return res.status(500).json({ message: "Erreur lors du chargement des zones." });
  }
}

// PUT /api/admin/zones/:code : tarif de course, priorité, activation
async function modifierZone(req, res) {
  try {
    const maj = {};
    const { tarifCourse, prioritaire, actif } = req.body;

    if (tarifCourse !== undefined) {
      const tarif = Number(tarifCourse);
      if (!Number.isFinite(tarif) || tarif < 0) return res.status(400).json({ message: "Tarif de course invalide." });
      maj.tarifCourse = Math.round(tarif);
    }
    if (prioritaire !== undefined) maj.prioritaire = prioritaire === true;
    if (actif !== undefined) maj.actif = actif === true;

    const zone = await Zone.findOneAndUpdate({ code: String(req.params.code) }, { $set: maj }, { returnDocument: 'after' });
    if (!zone) return res.status(404).json({ message: "Zone introuvable." });

    return res.status(200).json(zone);
  } catch (error) {
    console.error("Erreur modifierZone:", error);
    return res.status(500).json({ message: "Erreur lors de la modification de la zone." });
  }
}

module.exports = { listerZonesPubliques, listerZonesAdmin, modifierZone };
