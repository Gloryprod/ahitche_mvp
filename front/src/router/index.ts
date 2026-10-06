import { createRouter, createWebHistory } from 'vue-router'
// Seul l'accueil est dans le paquet principal : les autres pages se chargent à la demande
import HomeView from '../views/HomeView.vue'
// Page 404 dans le paquet principal (très légère) : pas de décalage du pied de page pendant son chargement
import NotFoundView from '../views/NotFoundView.vue'
import { useAuthStore } from '../stores/auth';
import { ACCES, EQUIPE, espaceParDefaut, type Role } from '@/config/roles';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { hideNavigation: true }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { hideNavigation: true }
    },
    {
      path: '/blog',
      name: 'blog',
      component: () => import('@/views/PublicContentList.vue'),
      meta: { hideNavigation: true }
    },
    {
      path: '/mentions-legales',
      name: 'mentions-legales',
      component: () => import('@/views/MentionsLegalesView.vue'),
      meta: { hideNavigation: true }
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: () => import('../views/ResetPassword.vue'),
      meta: { hideNavigation: true }
    },
    {
      path: '/dashboard/user',
      name: 'user-dashboard',
      component: () => import('@/views/dashboard/user/ProfileView.vue'),
      meta: { hideNavigation: true, requiresAuth: true, roles: ['user'] }
    },
    {
      path: '/dashboard/admin',
      name: 'admin-dashboard',
      component: () => import('@/views/dashboard/admin/ProfileView.vue'),
      meta: { hideNavigation: true, requiresAuth: true, roles: EQUIPE },
      children: [
        {
          path: '',
          name: 'admin-dashboard-page',
          meta: { roles: ACCES.tableauDeBord.lecture },
          component: () => import('@/components/admin/DashboardHome.vue')
        },
        {
          path: 'clients',
          name: 'client-page',
          meta: { roles: ACCES.clients.lecture },
          component: () => import('@/components/admin/ClientComponents.vue'),
        },
        {
          path: 'commandes', // (/dashboard/admin/commandes)
          name: 'commandes-page',
          meta: { roles: ACCES.commandes.lecture },
          component: () => import('@/components/admin/CommandeComponent.vue')
        },
        // Données de base
        {
          path: 'categories', 
          name: 'categories-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: () => import('@/components/admin/bases/categories/CategoryManagement.vue')
        },
        {
          path: 'regles', 
          name: 'regles-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: () => import('@/components/admin/bases/compositionrules/CompositionRuleManagement.vue')
        },
        {
          path: 'products',
          name: 'products-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: () => import('@/components/admin/bases/produits/ProductManagement.vue')
        },
        {
          path: 'formulas',
          name: 'formulas-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: () => import('@/components/admin/bases/formules/FormulaManagement.vue')
        },
        // Gestion de stock
        {
          path: 'saveStock',
          name: 'saveStock-page',
          meta: { roles: ACCES.stock.lecture },
          component: () => import('@/components/admin/AjouterEntreeStock.vue')
        },
        {
          path: 'inventaire',
          name: 'inventaire-page',
          meta: { roles: ACCES.stock.lecture },
          component: () => import('@/components/admin/stock/VueGlobalInventory.vue')
        },
        {
          path: 'mouvement-stock',
          name: 'mouvement-stock-page',
          meta: { roles: ACCES.stock.lecture },
          component: () => import('@/components/admin/stock/StockMovementsView.vue')
        },
        {
          path: 'bon-commande',
          name: 'bon-commande-page',
          meta: { roles: ACCES.stock.lecture },
          component: () => import('@/components/admin/stock/PurchaseOrdersView.vue')
        },
        // Sections « Gestion » : chargées à la demande pour ne pas alourdir le site public
        {
          path: 'prestataires',
          name: 'prestataires-page',
          meta: { roles: ACCES.prestataires.lecture },
          component: () => import('@/components/admin/prestataires/PrestataireManagement.vue')
        },
        {
          path: 'logistique',
          name: 'logistique-page',
          meta: { roles: ACCES.logistique.lecture },
          component: () => import('@/components/admin/logistique/LogistiqueView.vue')
        },
        {
          path: 'finances',
          name: 'finances-page',
          meta: { roles: ACCES.finances.lecture },
          component: () => import('@/components/admin/finances/FinancesView.vue')
        },
        {
          path: 'simulateurs',
          name: 'simulateurs-page',
          meta: { roles: ACCES.simulateurs.lecture },
          component: () => import('@/components/admin/simulateurs/SimulateursView.vue')
        },
        {
          path: 'idees-repas',
          name: 'idees-repas-page',
          meta: { roles: ACCES.repas.lecture },
          component: () => import('@/components/admin/nutrition/IdeesRepas.vue')
        },
        {
          path: 'nutrition',
          name: 'nutrition-page',
          meta: { roles: ACCES.nutrition.lecture },
          component: () => import('@/components/admin/nutrition/NutritionView.vue')
        },
        {
          path: 'posts',
          name: 'posts-page',
          meta: { roles: ACCES.contenus.lecture },
          component: () => import('@/components/admin/bases/posts/PostManagement.vue')
        }
      ]
    },
    // Adresse inconnue : page 404 (dans le site, avec le menu)
    {
      path: '/:cheminInconnu(.*)*',
      name: 'page-introuvable',
      component: NotFoundView,
    },
  ],
})

// Titre de l'onglet : propre à chaque page (accessibilité, historique du navigateur, partage)
const TITRE_ACCUEIL = 'Ahitché | Suivi Alimentaire Personnalisé & Ravitaillement Régulier à domicile au Bénin'
const TITRES: Record<string, string> = {
  register: 'Créer un compte', login: 'Connexion', blog: 'Actualités et médias', 'mentions-legales': 'Mentions légales',
  ResetPassword: 'Nouveau mot de passe', 'user-dashboard': 'Mon espace', 'page-introuvable': 'Page introuvable',
  'admin-dashboard-page': 'Tableau de bord', 'client-page': 'Clients', 'commandes-page': 'Commandes', 'categories-page': 'Catégories',
  'regles-page': 'Règles de composition', 'products-page': 'Produits', 'formulas-page': 'Formules', 'saveStock-page': 'Entrées de stock',
  'inventaire-page': 'Inventaire', 'mouvement-stock-page': 'Mouvements de stock', 'bon-commande-page': 'Bons de commande',
  'prestataires-page': 'Prestataires', 'logistique-page': 'Logistique', 'finances-page': 'Finances', 'simulateurs-page': 'Simulateurs',
  'idees-repas-page': 'Idées de repas', 'nutrition-page': 'Nutrition', 'posts-page': 'Contenus et médias',
}
router.afterEach((to) => {
  const titre = TITRES[String(to.name)]
  const espace = to.path.startsWith('/dashboard/admin') ? 'Back-office Ahitché' : 'Ahitché'
  document.title = titre ? `${titre} · ${espace}` : TITRE_ACCUEIL
})


router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // Déjà connecté (session connue dans cet onglet) : la connexion et l'inscription renvoient vers son espace
  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated.value) {
    return { path: espaceParDefaut(authStore.role.value) };
  }

  // Les pages publiques s'affichent sans attendre l'API : la session n'est vérifiée
  // que pour les espaces protégés (connexions mobiles parfois lentes).
  if (!to.meta.requiresAuth) return true;

  // Après un rechargement, on attend que le serveur valide ou rejette la session
  if (!authStore.isInitialized.value) {
    await authStore.checkSession();
  }

  if (!authStore.isAuthenticated.value) {
    // Après connexion, l'utilisateur revient sur la page demandée (lien partagé, favori…)
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // Rôles autorisés : ceux de la page la plus précise (les enfants admin précisent ceux du parent)
  const role = authStore.role.value;
  const rolesAutorises = [...to.matched].reverse().find(r => r.meta.roles)?.meta.roles as Role[] | undefined;
  if (rolesAutorises && (!role || !rolesAutorises.includes(role))) {
    const destination = espaceParDefaut(role);
    return destination === to.path ? { path: '/' } : { path: destination };
  }

  return true;
});

export default router
