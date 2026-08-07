const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const dns = require('node:dns')
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');

// Middlewares
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://ahitche-mvp.vercel.app',
    'https://ahitchebj.com',   
    'https://www.ahitchebj.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permet aux requêtes sans origine (comme Postman ou les outils internes) de passer
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bloqué par la politique CORS de l\'application'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use(cookieParser());
// Route exemple
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connecté avec succès à MongoDB Atlas !'))
  .catch((error) => console.error('❌ Erreur de connexion à MongoDB :', error));

app.listen(PORT, () => {
    console.log(`Serveur actif sur http://localhost:${PORT}`);
});
