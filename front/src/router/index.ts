import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import RegisterView from '@/views/RegisterView.vue'
import LoginView from '@/views/LoginView.vue'
import ProfileView from '@/views/dashboard/user/ProfileView.vue'
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
      path: '/dashboard/user',
      name: 'user-dashboard',
      component: ProfileView,
      meta: { hideNavigation: true, requiresAuth: true, roles: ['user'] }
    },
    {
      path: '/dashboard/admin',
      name: 'admin-dashboard',
      component: ProfileView,
      meta: { hideNavigation: true, requiresAuth: true, roles: ['admin'] }
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
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
