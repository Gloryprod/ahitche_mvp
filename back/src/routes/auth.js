const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const authC  = require('../controllers/AuthController');
const userC = require('../controllers/UserController');
const formuleC = require('../controllers/FormuleController');
const orderC = require('../controllers/OrderController');
const nutritionC = require('../controllers/NutritionController');

// Authentification
router.post('/register', authC.register);
router.post('/login', authC.login);
router.post('/logout', authC.logout);
router.post('/forgot-password', authC.forgotPassword);
router.post('/reset-password', authC.resetPassword);

// Profil
router.get('/session', authC.session); // Toujours 200 (visiteur : user null)
router.get('/me', verifyToken, authC.getUser);
router.post('/user/delivery-info', verifyToken, userC.saveUserDetails);

// Formules
router.get('/formules', verifyToken, formuleC.index);
router.put('/user/preference-formule', verifyToken, userC.updateFormulePreference);

// Commandes 
router.post('/save/orders', verifyToken, orderC.saveOrder);
router.get('/my-orders', verifyToken, orderC.index);
router.delete('/delete/order/:id', verifyToken, orderC.deleteOrder);

// Suivi alimentaire (questionnaire, recommandations, menus ; suppression à la demande)
router.route('/nutrition')
  .get(verifyToken, nutritionC.monSuivi)
  .put(verifyToken, nutritionC.enregistrerProfil)
  .delete(verifyToken, nutritionC.supprimerMonSuivi);

module.exports = router;
        