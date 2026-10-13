const express = require('express');
const router = express.Router();
const postC = require('../controllers/public/PostController');
const zoneC = require('../controllers/ZoneController');
const formuleC = require('../controllers/public/FormuleController');
const complementC = require('../controllers/public/ComplementController');
const mesureC = require('../controllers/public/MesureController');
const { limiteTentatives } = require('../middlewares/limiteTentatives');

// Mesure d'audience : 300 comptages par heure et par adresse IP (l'adresse n'est jamais enregistrée)
const limiteMesure = limiteTentatives({ nom: 'mesure', minutes: 60, maxParCompte: 0, maxParIp: 300, message: 'Trop de mesures.' });

router.get('/posts', postC.getPosts);
router.get('/posts/:slug', postC.getPostParSlug); // Page d'un contenu (/blog/:slug)
router.get('/sitemap.xml', postC.planDuSite); // Servi sur ahitchebj.com/sitemap.xml (vercel.json)
router.get('/zones', zoneC.listerZonesPubliques);
router.get('/formules/valeurs', formuleC.valeursEstimees); // Prix barrés de l'accueil (D-03)
router.get('/complements', complementC.complementsDeLaSemaine); // « Disponible cette semaine » de l'accueil
router.post('/mesure', limiteMesure, express.text({ type: 'text/plain', limit: '1kb' }), mesureC.enregistrerMesure); // Mesure d'audience (sendBeacon : texte JSON)

module.exports = router;
