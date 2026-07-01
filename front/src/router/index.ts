import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import RegisterView from '@/views/RegisterView.vue'
import LoginView from '@/views/LoginView.vue'
import ResetPassword from '../views/ResetPassword.vue'
import ProfileView from '@/views/dashboard/user/ProfileView.vue'
import ProfileViewAdmin from '@/views/dashboard/admin/ProfileView.vue'
import ClientComponents from '@/components/admin/ClientComponents.vue';
import CommandeComponent from '@/components/admin/CommandeComponent.vue';
import CategoryManagement from '@/components/admin/bases/categories/CategoryManagement.vue'
import CompositionRuleManagement from '@/components/admin/bases/compositionrules/CompositionRuleManagement.vue'
import ProductManagement from '@/components/admin/bases/produits/ProductManagement.vue'
import FormulaManagement from '@/components/admin/bases/formules/FormulaManagement.vue'
import { useAuthStore } from '../stores/auth';

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
      meta: { hideNavigation: true, requiresAuth: true, roles: ['admin'] },
      children: [
        // {
        //   path: '', // Chemin par défaut (/dashboard/admin)
        //   name: 'admin-dashboard',
        //   component: DashboardHome
        // },
        {
          path: 'clients',
          name: 'client-page',
          component: ClientComponents
        },
        {
          path: 'commandes', // (/dashboard/admin/commandes)
          name: 'commandes-page',
          component: CommandeComponent
        },
        // Données de base
        {
          path: 'categories', 
          name: 'categories-page',
          component: CategoryManagement
        },
        {
          path: 'regles', 
          name: 'regles-page',
          component: CompositionRuleManagement
        },
        {
          path: 'products',
          name: 'products-page',
          component: ProductManagement
        },
        {
          path: 'formulas',
          name: 'formulas-page',
          component: FormulaManagement
        },
      ]
    },
  ],
})


router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  
  // Vérification de l'authentification requise
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ path: '/login' });
  }

  // Vérification des restrictions de rôle
  if (to.meta.roles && !authStore.isAdmin) {
    // Redirige vers l'accueil ou une page 403 si le rôle ne correspond pas
    return next({ path: '/' });
  }

  next();
});

export default router
