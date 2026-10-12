const express = require('express');
const router = express.Router();
const postC = require('../controllers/public/PostController');
const zoneC = require('../controllers/ZoneController');
const formuleC = require('../controllers/public/FormuleController');
const complementC = require('../controllers/public/ComplementController');

router.get('/posts', postC.getPosts);
router.get('/zones', zoneC.listerZonesPubliques);
router.get('/formules/valeurs', formuleC.valeursEstimees); // Prix barrés de l'accueil (D-03)
router.get('/complements', complementC.complementsDeLaSemaine); // « Disponible cette semaine » de l'accueil

module.exports = router;
