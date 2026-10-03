const express = require('express');
const router = express.Router();
const postC = require('../controllers/public/PostController');

router.get('/posts', postC.getPosts);

module.exports = router;
