import type { RouteRecordRaw } from 'vue-router'
// Seul l'accueil est dans le paquet principal : les autres pages se chargent à la demande
import HomeView from '../views/HomeView.vue'
// Page 404 dans le paquet principal (très légère) : pas de décalage du pied de page pendant son chargement
import NotFoundView from '../views/NotFoundView.vue'
import { ACCES, EQUIPE } from '@/config/roles'

// Pages du site et du back-office. Le routeur du navigateur (index.ts) et le rendu de l'accueil au build
// (entry-prerendu.ts) utilisent la même liste.
export const routes: RouteRecordRaw[] = [
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
    path: '/blog/:slug',
    name: 'blog-article',
    component: () => import('@/views/ArticleView.vue'),
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
      {
        path: 'complements',
        name: 'complements-page',
        meta: { roles: ACCES.complements.lecture },
        component: () => import('@/components/admin/complements/ComplementsManagement.vue')
      },
      {
        path: 'fiches',
        name: 'fiches-page',
        meta: { roles: ACCES.fiches.lecture },
        component: () => import('@/components/admin/fiches/FichesProduits.vue')
      },
      {
        path: 'vip',
        name: 'vip-page',
        meta: { roles: ACCES.vip.lecture },
        component: () => import('@/components/admin/vip/CodesVip.vue')
      },
      {
        path: 'avis',
        name: 'avis-page',
        meta: { roles: ACCES.avis.lecture },
        component: () => import('@/components/admin/avis/AvisClients.vue')
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
        path: 'prevision-achats',
        name: 'prevision-achats-page',
        meta: { roles: ACCES.stock.lecture },
        component: () => import('@/components/admin/stock/PrevisionAchats.vue')
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
]
