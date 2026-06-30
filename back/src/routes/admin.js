const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Category = require('../models/category');
const userC = require('../controllers/admin/UserController');
const categoryC = require('../controllers/admin/CategoryController');
const compositionRuleC = require('../controllers/admin/CompositionRuleController');
const productC = require('../controllers/admin/ProductController');
const formulaC = require('../controllers/admin/FormulaController');
const orderC = require('../controllers/admin/OrderController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);

// Users
router.get('/users', userC.index);

// Commandes
router.get('/commandes', userC.getOrders)
router.post('/orders', orderC.createAdminOrder);
router.get('/orders', orderC.getAllOrders);

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

// --- Formules / Packs ---
router.get('/formulas/:packType', formulaC.getPackDetails);


module.exports = router;
        