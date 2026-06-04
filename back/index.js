const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config(); // Charge les variables du fichier .env

const app = express();
const PORT = process.env.PORT || 5000;
const authRoutes = require('./src/routes/auth');

// Middlewares
app.use(cors({
    origin: 'http://localhost:5173', // ⚠️ L'URL exacte de ton front Vue (sans barre de fraction / à la fin)
    credentials: true,               // ⚠️ Indispensable pour autoriser l'échange de cookies
}));
app.use(express.json());

app.use(cookieParser());

// Route exemple
app.use('/api/auth', authRoutes);

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connecté avec succès à MongoDB Atlas !'))
  .catch((error) => console.error('❌ Erreur de connexion à MongoDB :', error));

app.listen(PORT, () => {
    console.log(`Serveur actif sur http://localhost:${PORT}`);
});
