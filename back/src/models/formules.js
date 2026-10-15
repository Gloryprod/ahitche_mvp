const mongoose = require('mongoose');

// Formules (packs) du référentiel packs v4 (30/06/2026). Les valeurs absentes restent vides : prix de Fraîcheur
// « à définir », accroches de Réserve et Fraîcheur à valider (D-05), etc. Plus de prix barré (D-03).
const formuleSchema = new mongoose.Schema({
  // Identifiant unique textuel (ex: "ahi-essentiel", "ahi-equilibre")
  slug: { type: String, required: true, unique: true, trim: true },
  nom: { type: String, required: true, trim: true },
  emoji: { type: String, default: '🌾' },
  cible: { type: String, required: true }, // Ex : "1 personne · par mois"
  phraseAccroche: { type: String, default: '' }, // Vide : à valider (D-05)
  promesse: { type: String, default: '' },
  foyersCibles: { type: String, default: '' },
  logiqueCommande: { type: String, default: '' }, // Ex : "Quantités pour 1 personne et 1 mois"
  // Limites de personnalisation par pack (Architecture des offres) ; vide = non fixé
  changementsMax: { type: Number, min: 0, default: null },
  variationQuantitePct: { type: Number, min: 0, default: null },
  // Repas possibles et heures gagnées, par mois (étude marketing) ; vide pour Réserve et Fraîcheur
  estimationRepas: {
    min: { type: Number, default: null },
    max: { type: Number, default: null }
  },
  heuresEconomisees: {
    min: { type: Number, default: null },
    max: { type: Number, default: null }
  },
  ancienPrix: { type: Number, default: null }, // Ancien prix barré : n'est plus affiché (D-03)
  prixActuel: { type: Number, min: 0, default: null }, // Prix affiché du référentiel ; vide = à définir (Fraîcheur)
  prixCommercial: { type: Number, min: 0, required: false }, // Prix fixé par l'admin (journalisé)
  estRecommandee: { type: Boolean, default: false },
  statut: { type: String, enum: ['actif', 'inactif'], default: 'actif' },
  // Cycle du pack en jours : 30 (Essentiel, Équilibré, Confort, Réserve) ou 7 (Fraîcheur) ; relance du client à l'échéance (alerte à J-5)
  cycleJours: { type: Number, default: 7, min: 1 },
  // Formule annoncée mais pas encore ouverte : visible côté client, non commandable
  bientotDisponible: { type: Boolean, default: false },
  // Lien WhatsApp pré-rempli
  lienWhatsApp: { type: String, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Formule', formuleSchema);
