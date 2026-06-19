const express = require('express');
const router = express.Router();
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middlewares/auth');
const authC  = require('../controllers/AuthController');

// 1. ROUTE D'INSCRIPTION (REGISTER)
router.post('/register', authC.register);

// 2. ROUTE DE CONNEXION (LOGIN)
router.post('/login', authC.login);

router.post('/logout', authC.logout);

router.get('/me', verifyToken, authC.getUser);
    

module.exports = router;
        