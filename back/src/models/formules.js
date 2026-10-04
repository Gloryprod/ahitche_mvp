const mongoose = require('mongoose'); 

const formuleSchema = new mongoose.Schema({
  // Identifiant unique textuel (ex: "ahi-essentiel", "ahi-equilibre")
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  nom: { 
    type: String, 
    required: true,
    trim: true 
  },
  emoji: { 
    type: String, 
    default: '🌾' 
  },
  cible: { 
    type: String, 
    required: true // Ex: "1 personne · par mois"
  },
  phraseAccroche: { 
    type: String, 
    required: true // Ex: "Les bases de votre semaine..."
  },
  // Données chiffrées pour le tableau et les cartes
  estimationRepas: {
    min: { type: Number, required: true }, // Ex: 20
    max: { type: Number, required: true }  // Ex: 30
  },
  heuresEconomisees: {
    min: { type: Number, required: true }, // Ex: 2
    max: { type: Number, required: true }  // Ex: 4
  },
  // Tarification
  ancienPrix: { 
    type: Number, // Stocker en Number (24000) c'est mieux pour des calculs futurs
    required: true 
  },
  prixActuel: { 
    type: Number, // Ex: 10800
    required: true 
  },
  prixCommercial: { 
    type: Number, // Ex: 10800
    required: false // Peut être null si pas de prix personnalisé
  },
  // Gestion d'affichage
  estRecommandee: { 
    type: Boolean, 
    default: false 
  },
  statut: {
    type: String,
    enum: ['actif', 'inactif'],
    default: 'actif'
  },
  // Formule annoncée mais pas encore ouverte : visible côté client, non commandable
  bientotDisponible: {
    type: Boolean,
    default: false
  },
  // Lien WhatsApp pré-généré ou généré dynamiquement
  lienWhatsApp: { 
    type: String,
    required: true
  }
}, {
  timestamps: true // Crée automatiquement createdAt et updatedAt
});

module.exports = mongoose.model('Formule', formuleSchema);