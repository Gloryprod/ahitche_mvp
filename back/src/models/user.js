const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true }, // Toujours en minuscules (migrerDonnees pour l'existant)
    password: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: 'user' }, // client ('user') ou membre de l'équipe, voir config/roles.js
    telephone: { type: String, required: false }, // unique seulement s'il est renseigné (index plus bas)
    quartier: { type: String, required: false },
    adresse: { type: String, required: false }, // Repères (maison, rue…)
    zone: { type: String, default: null }, // Code de la zone de livraison (null : « Autre quartier »)
    lienLocalisation: { type: String, default: '' }, // Lien Google Maps ou position WhatsApp, facultatif
    formuleHabituelle: { type: String, required: false },
    // Admin principal : seul compte de l'équipe sans déconnexion après 1 h d'inactivité (services/sessionService.js).
    // Posé par scripts/createAdmin.js, ou par scripts/migrerDonnees.js sur le plus ancien admin.
    adminPrincipal: { type: Boolean, default: false },
    // Gestionnaire qui livre (D-17) : fiche livreur reliée ; il ne voit alors que les clients de ses livraisons
    livreurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Un même numéro ne peut servir qu'à un compte, mais les comptes sans téléphone (équipe, anciens clients)
// ne se bloquent plus entre eux. Remplace l'ancien index unique : voir scripts/migrerDonnees.js.
userSchema.index(
    { telephone: 1 },
    { unique: true, name: 'telephone_unique_si_renseigne', partialFilterExpression: { telephone: { $gt: '' } } }
);

module.exports = mongoose.model('User', userSchema);
