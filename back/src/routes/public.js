const express = require('express');
const router = express.Router();
const postC = require('../controllers/public/PostController');
const zoneC = require('../controllers/ZoneController');

router.get('/posts', postC.getPosts);
router.get('/zones', zoneC.listerZonesPubliques);

module.exports = router;
