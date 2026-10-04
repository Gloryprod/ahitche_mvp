import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import RegisterView from '@/views/RegisterView.vue'
import LoginView from '@/views/LoginView.vue'
import PublicContentList from '@/views/PublicContentList.vue'
import ResetPassword from '../views/ResetPassword.vue'
import ProfileView from '@/views/dashboard/user/ProfileView.vue'
import ProfileViewAdmin from '@/views/dashboard/admin/ProfileView.vue'
import ClientComponents from '@/components/admin/ClientComponents.vue';
import CommandeComponent from '@/components/admin/CommandeComponent.vue';
import DashboardHome from '@/components/admin/DashboardHome.vue';
import CategoryManagement from '@/components/admin/bases/categories/CategoryManagement.vue'
import CompositionRuleManagement from '@/components/admin/bases/compositionrules/CompositionRuleManagement.vue'
import ProductManagement from '@/components/admin/bases/produits/ProductManagement.vue'
import FormulaManagement from '@/components/admin/bases/formules/FormulaManagement.vue'
import PostManagement from '@/components/admin/bases/posts/PostManagement.vue'
import AjouterEntreeStock from '@/components/admin/AjouterEntreeStock.vue'
import VueGlobalInventory from '@/components/admin/stock/VueGlobalInventory.vue'
import StockMovementsView from '@/components/admin/stock/StockMovementsView.vue'
import PurchaseOrdersView from '@/components/admin/stock/PurchaseOrdersView.vue'
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
      component: RegisterView,
      meta: { hideNavigation: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { hideNavigation: true }
    },
    {
      path: '/blog',
      name: 'blog',
      component: PublicContentList,
      meta: { hideNavigation: true }
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: ResetPassword,
      meta: { hideNavigation: true }
    },
    {
      path: '/dashboard/user',
      name: 'user-dashboard',
      component: ProfileView,
      meta: { hideNavigation: true, requiresAuth: true, roles: ['user'] }
    },
    {
      path: '/dashboard/admin',
      name: 'admin-dashboard',
      component: ProfileViewAdmin,
      meta: { hideNavigation: true, requiresAuth: true, roles: EQUIPE },
      children: [
        {
          path: '',
          name: 'admin-dashboard-page',
          meta: { roles: ACCES.tableauDeBord.lecture },
          component: DashboardHome
        },
        {
          path: 'clients',
          name: 'client-page',
          meta: { roles: ACCES.clients.lecture },
          component: ClientComponents,
        },
        {
          path: 'commandes', // (/dashboard/admin/commandes)
          name: 'commandes-page',
          meta: { roles: ACCES.commandes.lecture },
          component: CommandeComponent
        },
        // Données de base
        {
          path: 'categories', 
          name: 'categories-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: CategoryManagement
        },
        {
          path: 'regles', 
          name: 'regles-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: CompositionRuleManagement
        },
        {
          path: 'products',
          name: 'products-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: ProductManagement
        },
        {
          path: 'formulas',
          name: 'formulas-page',
          meta: { roles: ACCES.donneesBase.lecture },
          component: FormulaManagement
        },
        // Gestion de stock
        {
          path: 'saveStock',
          name: 'saveStock-page',
          meta: { roles: ACCES.stock.lecture },
          component: AjouterEntreeStock
        },
        {
          path: 'inventaire',
          name: 'inventaire-page',
          meta: { roles: ACCES.stock.lecture },
          component: VueGlobalInventory
        },
        {
          path: 'mouvement-stock',
          name: 'mouvement-stock-page',
          meta: { roles: ACCES.stock.lecture },
          component: StockMovementsView
        },
        {
          path: 'bon-commande',
          name: 'bon-commande-page',
          meta: { roles: ACCES.stock.lecture },
          component: PurchaseOrdersView
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
          path: 'posts',
          name: 'posts-page',
          meta: { roles: ACCES.contenus.lecture },
          component: PostManagement
        }
      ]
    },
  ],
})


router.beforeEach(async (to) => {
  // Les pages publiques s'affichent sans attendre l'API : la session n'est vérifiée
  // que pour les espaces protégés (connexions mobiles parfois lentes).
  if (!to.meta.requiresAuth) return true;

  const authStore = useAuthStore();

  // Après un rechargement, on attend que le serveur valide ou rejette la session
  if (!authStore.isInitialized.value) {
    await authStore.checkSession();
  }

  if (!authStore.isAuthenticated.value) {
    return { path: '/login' };
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
