const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], required: true, default: 'user' }, // 'user' ou 'admin'
    telephone: { type: String, required: false, unique: true },
    quartier: { type: String, required: false },
    adresse: { type: String, required: false },
    formuleHabituelle: { type: String, required: false },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
