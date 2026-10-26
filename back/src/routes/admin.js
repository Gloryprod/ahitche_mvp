const express = require('express');
const router = express.Router();
const userC = require('../controllers/admin/UserController');
const categoryC = require('../controllers/admin/CategoryController');
const compositionRuleC = require('../controllers/admin/CompositionRuleController');
const productC = require('../controllers/admin/ProductController');
const formulaC = require('../controllers/admin/FormulaController');
const orderC = require('../controllers/admin/OrderController');
const stockC = require('../controllers/admin/StockController');
const invC = require('../controllers/admin/InventoryController');
const postC = require('../controllers/admin/PostController');
const partnerC = require('../controllers/admin/PartnerController');
const zoneC = require('../controllers/ZoneController');
const logistiqueC = require('../controllers/admin/LogistiqueController');
const financeC = require('../controllers/admin/FinanceController');
const simulateurC = require('../controllers/admin/SimulateurController');
const parametresC = require('../controllers/admin/ParametresController');
const nutritionC = require('../controllers/NutritionController');
const complementC = require('../controllers/admin/ComplementController');
const mesureC = require('../controllers/admin/MesureController');
const avisC = require('../controllers/AvisController');
const ficheC = require('../controllers/FicheController');
const vipC = require('../controllers/VipController');
const { verifyToken, checkRole, acces } = require('../middlewares/auth');
const { EQUIPE, ACCES } = require('../config/roles');
const uploadC  = require('../controllers/admin/UploadController');
// Importation du middleware Multer/Cloudinary
const upload = require('../config/cloudinary');

// Toutes les routes admin exigent une session valide ET un rôle de l'équipe
router.use(verifyToken, checkRole(EQUIPE));

// Droits par section (lecture = GET, écriture = autres méthodes), voir config/roles.js
router.use('/users', acces(ACCES.clients));
router.use(['/commandes', '/orders'], acces(ACCES.commandes));
router.use(['/categories', '/composition-rules', '/products', '/formulas'], acces(ACCES.donneesBase));
router.use(['/posts', '/upload'], acces(ACCES.contenus));
router.use('/complements', acces(ACCES.complements));
router.use('/mesures', acces(ACCES.mesures));
router.use(['/stock', '/inventory', '/mouvements', '/bons-commande'], acces(ACCES.stock));
router.use('/prestataires', acces(ACCES.prestataires));
router.use(['/zones', '/logistique'], acces(ACCES.logistique));
router.use('/finances', acces(ACCES.finances));
router.use('/simulateurs', acces(ACCES.simulateurs));
router.use('/nutrition', acces(ACCES.nutrition));
router.use('/parametres', acces(ACCES.parametres));
router.use('/repas', acces(ACCES.repas));
router.use('/avis', acces(ACCES.avis));
router.use('/fiches', acces(ACCES.fiches));
router.use('/vip', acces(ACCES.vip));

// Users
router.get('/users', userC.index);

// Commandes
router.get('/commandes', userC.getOrders)
// Achat libre VIP saisi par l'équipe au nom d'un client VIP : réservé aux rôles qui écrivent dans les Commandes (admin,
// gestionnaires), y compris les deux listes du formulaire. Chemins fixes, à garder avant toute route /commandes/:id.
const saisieCommandes = (req, res, next) => (ACCES.commandes.ecriture.includes(req.user.role)
  ? next()
  : res.status(403).json({ message: 'Votre rôle ne permet pas de saisir une commande.' }));
router.get('/commandes/achat-libre/clients', saisieCommandes, orderC.clientsAchatLibre); // Clients VIP du périmètre
router.get('/commandes/achat-libre/catalogue', saisieCommandes, orderC.catalogueAchatLibre); // Prix VIP, jamais priceUnit
router.post('/commandes/achat-libre', saisieCommandes, orderC.creerAchatLibre);
router.post('/orders', orderC.createAdminOrder);
router.put('/orders/:id', orderC.updateAdminOrder);
router.patch('/orders/:id/status', orderC.updateOrderStatus);
router.patch('/orders/:id/remise', orderC.deciderRemise); // Admin seulement (contrôlé dans le contrôleur)
router.patch('/orders/:id/demandes', orderC.chiffrerDemandes); // Achat libre VIP : chiffrage ou retrait des demandes libres (écriture de la section vip, contrôlée dans le contrôleur)
router.patch('/orders/:id/paiement', orderC.changerModePaiement); // Achat libre VIP : Mobile Money ou Espèces, avant le paiement (écriture des Commandes)
router.delete('/orders/:id', orderC.deleteAdminOrder);

// Category
router.route('/categories')
  .get(categoryC.getAllCategories)
  .post(categoryC.createCategory);

router.route('/categories/:id')
  .put(categoryC.updateCategory)
  .delete(categoryC.deleteCategory);

// Règles
router.route('/composition-rules')
  .get(compositionRuleC.getAllRules)
  .post(compositionRuleC.createRule);

router.route('/composition-rules/:id')
  .put(compositionRuleC.updateRule)
  .delete(compositionRuleC.deleteRule);

// Produits
router.route('/products')
  .get(productC.getAllProducts)
  .post(productC.createProduct);

router.route('/products/:id')
  .put(productC.updateProduct)
  .delete(productC.deleteProduct);

// Fréquentation du site (mesure d'audience sans cookie)
router.get('/mesures', mesureC.resumeFrequentation);

// Compléments de la semaine (extras du catalogue affichés sur l'accueil)
router.route('/complements')
  .get(complementC.listerComplements)
  .post(complementC.creerComplement);
router.post('/complements/photo', upload.uploadPhotoProduit.single('photo'), complementC.televerserPhoto);
router.route('/complements/:id')
  .put(complementC.modifierComplement)
  .patch(complementC.modifierComplement);

// Fiches produits (publicité du bandeau de l'espace client ; sans lien avec les commandes ni le stock)
router.route('/fiches')
  .get(ficheC.listerFiches)
  .post(ficheC.creerFiche);
router.get('/fiches/produits', ficheC.produitsPourFiches); // Produits vendus proposés dans le formulaire, sans prix
router.post('/fiches/photo', upload.uploadPhotoFiche.single('photo'), ficheC.televerserPhoto);
router.route('/fiches/:id')
  .put(ficheC.modifierFiche)
  .patch(ficheC.modifierFiche)
  .delete(ficheC.supprimerFiche);

// Codes VIP et comptes VIP (achats libres au prix VIP)
router.route('/vip/codes')
  .get(vipC.listerCodes)
  .post(vipC.creerCode);
router.patch('/vip/codes/:id', vipC.modifierCode); // { actif } : désactivation ou réactivation
router.get('/vip/comptes', vipC.listerComptes);
router.post('/vip/comptes/:id/retrait', vipC.retirerVip);

// --- Formules / Packs ---
router.get('/formulas/:packType', formulaC.getPackDetails);
router.patch('/formulas/:packType/price', formulaC.updateFormulaPrice);
router.patch('/formulas/:packType/cycle', formulaC.updateFormulaCycle); // cycle de relance, réglé par l'admin

// --- Posts / Contenus ---
router.get('/posts', postC.getPosts);
router.post('/posts', postC.createPost);
router.put('/posts/:id', postC.updatePost);
router.delete('/posts/:id', postC.deletePost);
// Route d'upload : attend un champ nommé 'image'
router.post('/upload', upload.single('image'), uploadC.uploadImage);

// Stocks
router.route('/stock/lots')
  .get(stockC.obtenirLotsStock)
  .post(stockC.enregistrerEntreeStock);

router.route('/stock/lots/:id')
  .put(stockC.modifierLotStock)
  .delete(stockC.supprimerLotStock);
router.post('/stock/lots/:id/comptage', stockC.compterLot);
router.post('/stock/lots/:id/correction', stockC.corrigerLot);
router.post('/stock/essais', stockC.enregistrerEssai);
router.get('/stock/prevision-achats', simulateurC.simulerAchats); // Besoins et achats pour N commandes, sans marge
router.post('/stock/transformations', stockC.enregistrerTransformation);

// État et Historique
router.get('/inventory/global', invC.obtenirInventaireGlobal); // ?famille=P|V|MP|EMB
router.get('/mouvements', invC.obtenirHistoriqueMouvements);

// Bons de commande fournisseurs (ancien format : items ; nouveau format : lignes de la facture d'achat)
router.post('/bons-commande', invC.creerBonCommande);
router.get('/bons-commande', invC.obtenirBonsCommande);
router.put('/bons-commande/:id', invC.modifierBonCommande);
router.delete('/bons-commande/:id', invC.supprimerBonCommande);
router.post('/bons-commande/:id/reception', invC.receptionnerBon); // Un lot par ligne reçue, en transaction

// Prestataires (fournisseurs, livreurs, autres)
router.route('/prestataires')
  .get(partnerC.listerPrestataires)
  .post(partnerC.creerPrestataire);

router.route('/prestataires/:id')
  .put(partnerC.modifierPrestataire)
  .delete(partnerC.supprimerPrestataire);

// Zones de livraison (tarif de course, priorité, activation)
router.get('/zones', zoneC.listerZonesAdmin);
router.put('/zones/:code', zoneC.modifierZone);

// Logistique : planning du jour et planification (créneau + livreur)
router.get('/logistique', logistiqueC.obtenirPlanning);
router.patch('/logistique/commandes/:id/planification', logistiqueC.planifierCommande);

// Finances : budget Next Impact, exploitation, taux USD/FCFA, journal des modifications
router.get('/finances/synthese', financeC.obtenirSynthese);
router.get('/finances/journal', financeC.obtenirJournal);
router.route('/finances/taux')
  .get(financeC.obtenirTaux)
  .post(financeC.enregistrerTaux);
router.post('/finances/lignes/import', financeC.importerLignes);
router.route('/finances/lignes')
  .get(financeC.listerLignes)
  .post(financeC.creerLigne);
router.route('/finances/lignes/:id')
  .put(financeC.modifierLigne)
  .delete(financeC.supprimerLigne);
router.get('/finances/depenses/export', financeC.exporterDepenses);
// Registres obligatoires (livre de caisse, factures, achats) et clôture mensuelle
router.get('/finances/registres/caisse', financeC.exporterLivreCaisse);
router.get('/finances/registres/factures', financeC.exporterRegistreFactures);
router.get('/finances/registres/achats', financeC.exporterRegistreAchats);
router.get('/finances/clotures', financeC.listerClotures);
router.post('/finances/clotures/:mois', financeC.changerCloture);
router.route('/finances/depenses')
  .get(financeC.listerDepenses)
  .post(financeC.creerDepense);
router.route('/finances/depenses/:id')
  .put(financeC.modifierDepense)
  .delete(financeC.supprimerDepense);
router.patch('/finances/depenses/:id/effectuer', financeC.effectuerDepense);
router.patch('/finances/depenses/:id/audit', financeC.changerValiditeAudit);
// Justificatifs en stockage privé : ajout, lien signé temporaire, suppression
router.post('/finances/depenses/:id/justificatifs', upload.uploadJustificatif.single('fichier'), financeC.ajouterJustificatif);
router.get('/finances/depenses/:id/justificatifs/:jid/lien', financeC.lienJustificatif);
router.delete('/finances/depenses/:id/justificatifs/:jid', financeC.supprimerJustificatif);

// Simulateurs (lecture seule : aucun enregistrement, aucun prix modifié)
router.get('/simulateurs/pack/:type', simulateurC.simulerPack);
router.route('/parametres')
  .get(parametresC.obtenirParametres)
  .put(parametresC.modifierParametres);

// Nutrition : clients suivis (avec leur accord), journal de suivi, menus types
router.get('/nutrition/clients', nutritionC.listerClientsSuivis);
router.get('/nutrition/clients/:userId', nutritionC.ficheClient);
router.post('/nutrition/clients/:userId/suivi', nutritionC.ajouterSuivi);
// Idées de repas (D-18) : section séparée, sans accès aux données des clients
router.route('/repas')
  .get(nutritionC.listerMenus)
  .post(nutritionC.creerMenu);
router.route('/repas/:id')
  .put(nutritionC.modifierMenu)
  .delete(nutritionC.supprimerMenu);
router.post('/repas/:id/decision', nutritionC.deciderMenu); // Admin seulement (contrôlé dans le contrôleur)

// Avis clients : publication ou refus motivé (admin), suppression des indésirables
router.get('/avis', avisC.listerAvis);
router.post('/avis/:id/decision', avisC.deciderAvis);
router.delete('/avis/:id', avisC.supprimerAvis);

module.exports = router;
        