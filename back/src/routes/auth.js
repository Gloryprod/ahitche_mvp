const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const authC  = require('../controllers/AuthController');
const userC = require('../controllers/UserController');
const formuleC = require('../controllers/FormuleController');
const orderC = require('../controllers/OrderController');
const nutritionC = require('../controllers/NutritionController');
const avisC = require('../controllers/AvisController');
const ficheC = require('../controllers/FicheController');
const vipC = require('../controllers/VipController');
const { limiteTentatives } = require('../middlewares/limiteTentatives');

// Force brute : 5 échecs de connexion par compte en 15 minutes, 30 par adresse IP ;
// mot de passe oublié : 3 demandes par compte et 10 par IP en 1 heure ; inscription et réinitialisation : 10 par IP en 1 heure
const limiteConnexion = limiteTentatives({ nom: 'connexion', minutes: 15, maxParCompte: 5, maxParIp: 30, echecsSeulement: true });
const limiteOubli = limiteTentatives({ nom: 'oubli', minutes: 60, maxParCompte: 3, maxParIp: 10 });
const limiteInscription = limiteTentatives({ nom: 'inscription', minutes: 60, maxParCompte: 0, maxParIp: 10 });
const limiteReinitialisation = limiteTentatives({ nom: 'reinitialisation', minutes: 60, maxParCompte: 0, maxParIp: 10 });
// Commandes de l'espace client : contre l'envoi en masse (compte piraté, script), 10 par heure et par compte
const limiteCommandes = limiteTentatives({
  nom: 'commande', minutes: 60, maxParCompte: 10, maxParIp: 30,
  compteDe: (req) => (req.user?.id ? String(req.user.id) : ''),
  message: 'Trop de commandes envoyées en peu de temps. Contactez-nous sur WhatsApp si besoin.'
});
// Avis clients : 10 envois par heure et par compte
const limiteAvis = limiteTentatives({
  nom: 'avis', minutes: 60, maxParCompte: 10, maxParIp: 30,
  compteDe: (req) => (req.user?.id ? String(req.user.id) : ''),
  message: 'Trop d\'envois en peu de temps.'
});
// Codes VIP (force brute) : 5 codes refusés par heure et par compte, 30 par adresse IP ; un code accepté remet
// le compteur du compte à zéro
const limiteCodeVip = limiteTentatives({
  nom: 'code-vip', minutes: 60, maxParCompte: 5, maxParIp: 30, echecsSeulement: true,
  compteDe: (req) => (req.user?.id ? String(req.user.id) : ''),
  message: 'Trop de codes refusés.'
});

// Authentification
router.post('/register', limiteInscription, authC.register);
router.post('/login', limiteConnexion, authC.login);
router.post('/logout', authC.logout);
router.post('/forgot-password', limiteOubli, authC.forgotPassword);
router.post('/reset-password', limiteReinitialisation, authC.resetPassword);

// Profil
router.get('/session', authC.session); // Toujours 200 (visiteur : user null)
router.get('/me', verifyToken, authC.getUser);
router.post('/user/delivery-info', verifyToken, userC.saveUserDetails);

// Formules
router.get('/formules', verifyToken, formuleC.index);
router.put('/user/preference-formule', verifyToken, userC.updateFormulePreference);

// Commandes 
router.post('/save/orders', verifyToken, limiteCommandes, orderC.saveOrder);
router.get('/my-orders', verifyToken, orderC.index);
router.delete('/delete/order/:id', verifyToken, orderC.deleteOrder);

// Suivi alimentaire (questionnaire, recommandations, menus ; suppression à la demande)
router.route('/nutrition')
  .get(verifyToken, nutritionC.monSuivi)
  .put(verifyToken, nutritionC.enregistrerProfil)
  .delete(verifyToken, nutritionC.supprimerMonSuivi);

// Mon avis (publié sur l'accueil après validation de l'admin ; un avis par client)
router.route('/avis')
  .get(verifyToken, avisC.monAvis)
  .put(verifyToken, limiteAvis, avisC.enregistrerAvis)
  .delete(verifyToken, avisC.supprimerMonAvis);

// Fiches produits (bandeau publicitaire de l'espace client)
router.get('/fiches', verifyToken, ficheC.fichesPubliees);

// VIP : saisie d'un code, catalogue au prix VIP et achat libre (même limite que les autres commandes)
router.post('/vip/code', verifyToken, limiteCodeVip, vipC.utiliserCode);
router.get('/vip/catalogue', verifyToken, vipC.catalogueVip);
router.post('/vip/commande', verifyToken, limiteCommandes, orderC.saveAchatLibre);

module.exports = router;
        