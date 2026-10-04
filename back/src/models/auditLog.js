const mongoose = require('mongoose');

// Journal « qui a modifié quoi, et quand » sur les finances et les prix (conception, question 36)
const auditLogSchema = new mongoose.Schema({
  utilisateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String },
  action: { type: String, enum: ['Création', 'Modification', 'Suppression', 'Validation', 'Import'], required: true },
  entite: { type: String, required: true }, // Ex : "Dépense", "Ligne budgétaire", "Taux USD/FCFA", "Prix formule"
  entiteId: { type: String, default: '' },
  resume: { type: String, required: true }, // Phrase lisible : « Dépense "Loyer" marquée effectuée (150 000 FCFA) »
  avant: { type: mongoose.Schema.Types.Mixed, default: null },
  apres: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('AuditLog', auditLogSchema);
