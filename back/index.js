const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const dns = require('node:dns')
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();

const app = express();
// Derrière un proxy (hébergeur) : TRUST_PROXY=1 pour lire la vraie adresse IP du visiteur (limite des tentatives)
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
const PORT = process.env.PORT || 5000;
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const publicRoutes = require('./src/routes/public');

// Middlewares
// En-têtes de sécurité HTTP (nosniff, HSTS, frameguard, etc.)
app.use(helmet());

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // PATCH : statuts, remises, paiements…
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use(cookieParser());
// Route exemple
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

// Erreurs non gérées par les routes (téléversement, CORS…) : message en français, jamais de page HTML ni de détail technique
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Fichier trop lourd.' });
  if (err.name === 'MulterError') return res.status(400).json({ message: 'Fichier refusé : ' + err.message });
  if (/CORS/.test(err.message || '')) return res.status(403).json({ message: 'Origine non autorisée.' });
  console.error('Erreur non gérée :', err.message || err.error?.message || JSON.stringify(err));
  // Échec du stockage des fichiers (Cloudinary) : le fichier n'a pas été enregistré
  if (err.http_code || err.error?.http_code || /\/justificatifs|\/upload$/.test(req.path)) return res.status(502).json({ message: "Le fichier n'a pas pu être enregistré. Réessayez dans un instant." });
  return res.status(500).json({ message: 'Erreur serveur.' });
});

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connecté avec succès à MongoDB Atlas !'))
  .catch((error) => console.error('❌ Erreur de connexion à MongoDB :', error));

app.listen(PORT, () => {
    console.log(`Serveur actif sur http://localhost:${PORT}`);
});
