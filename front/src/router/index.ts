import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { useAuthStore } from '../stores/auth';
import { espaceParDefaut, type Role } from '@/config/roles';
import { mettreAJourReferencement } from '@/services/referencement';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Titre de l'onglet : propre à chaque page (accessibilité, historique du navigateur, partage)
const TITRE_ACCUEIL = 'Ahitché | Suivi Alimentaire Personnalisé & Ravitaillement Régulier à domicile au Bénin'
const TITRES: Record<string, string> = {
  register: 'Créer un compte', login: 'Connexion', blog: 'Actualités et médias', 'blog-article': 'Actualités', 'mentions-legales': 'Mentions légales',
  ResetPassword: 'Nouveau mot de passe', 'user-dashboard': 'Mon espace', 'page-introuvable': 'Page introuvable',
  'admin-dashboard-page': 'Tableau de bord', 'client-page': 'Clients', 'commandes-page': 'Commandes', 'categories-page': 'Catégories',
  'regles-page': 'Règles de composition', 'products-page': 'Produits', 'formulas-page': 'Formules', 'saveStock-page': 'Entrées de stock',
  'inventaire-page': 'Inventaire', 'mouvement-stock-page': 'Mouvements de stock', 'bon-commande-page': 'Bons de commande', 'prevision-achats-page': 'Prévision d\'achats',
  'prestataires-page': 'Prestataires', 'logistique-page': 'Logistique', 'finances-page': 'Finances', 'simulateurs-page': 'Simulateurs',
  'idees-repas-page': 'Idées de repas', 'nutrition-page': 'Nutrition', 'posts-page': 'Contenus et médias', 'complements-page': 'Compléments de la semaine',
  'avis-page': 'Avis clients',
}
router.afterEach((to) => {
  const titre = TITRES[String(to.name)]
  const espace = to.path.startsWith('/dashboard/admin') ? 'Back-office Ahitché' : 'Ahitché'
  document.title = titre ? `${titre} · ${espace}` : TITRE_ACCUEIL
  mettreAJourReferencement(to) // Adresse canonique propre à la page ; noindex hors des pages publiques
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
