<script setup lang="ts">
import PanneauMarque from '@/components/ui/PanneauMarque.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import { espaceParDefaut } from '@/config/roles'
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'

// Liens du menu
const LIENS = [
  { href: '#formules', texte: 'Formules' },
  { href: '#comment', texte: 'Comment ça marche' },
  { href: '#faq', texte: 'FAQ' },
]

const router = useRouter()
const route = useRoute()
// Ancre de l'accueil : telle quelle sur l'accueil, précédée de « / » ailleurs (blog, mentions, page 404…)
const ancre = (cible: string) => (route.path === '/' ? cible : `/${cible}`)
const isScrolled = ref(false)
const isMenuOpen = ref(false)
const scrollProgress = ref(0)
const authStore = useAuthStore()
const toast = useToast()

// Utilisateur connecté : lien direct vers son espace (sinon, bouton « Connexion »)
const monEspace = computed(() => authStore.isAuthenticated.value ? espaceParDefaut(authStore.role.value) : null)
const libelleCompte = computed(() => monEspace.value ? 'Mon espace' : 'Connexion')

const isLoginModalOpen = ref(false)
const isLoading = ref(false)
const formLogin = ref({ email: '', password: '' })
const forgotEmail = ref('')
const isForgotPassword = ref(false)

const handleScroll = () => {
  const scrollTop = window.scrollY
  const docHeight = document.documentElement.scrollHeight - window.innerHeight
  scrollProgress.value = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
  isScrolled.value = scrollTop > 50
}

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
  document.body.style.overflow = isMenuOpen.value ? 'hidden' : ''
}

const closeMenu = () => {
  isMenuOpen.value = false
  document.body.style.overflow = ''
}

// Fonctions de la modale
const openLoginModal = () => {
  closeMenu() // En premier : closeMenu rétablit le défilement de la page
  isLoginModalOpen.value = true
  document.body.style.overflow = 'hidden' // Bloque le scroll arrière
}

const closeLoginModal = () => {
  isLoginModalOpen.value = false
  if (!isMenuOpen.value) document.body.style.overflow = ''
}

const handleLogin = async () => {
  isLoading.value = true
  try {
    const data = await authStore.login(formLogin.value) 
    const userRole = data.user.role;

    toast.success(data.message);

    // Client -> son espace ; équipe -> la première section accessible avec son rôle
    closeLoginModal() // Rétablit le défilement avant de quitter la page
    router.push(espaceParDefaut(userRole))
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Une erreur est survenue lors de la connexion.")
  } finally {
    isLoading.value = false
  }
}

const handleForgotPassword = async () => {
  isLoading.value = true
  try {
    const response = await authStore.forgotPassword({ email: forgotEmail.value })
    
    toast.success(response.message);
    isForgotPassword.value = false;
    forgotEmail.value = '';
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Impossible de traiter la demande.")
  } finally {
    isLoading.value = false
  }
}

const register = () => {
  closeLoginModal()
  router.push('/register')
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  document.body.style.overflow = '' // Menu ou fenêtre encore ouverts : la page suivante doit pouvoir défiler
})
</script>

<template>
  <!-- Barre de progression de défilement -->
  <div 
    class="fixed top-0 left-0 h-[3px] bg-gradient-to-r from-or to-savane z-[200] transition-[width] duration-100 ease-linear"
    :style="{ width: scrollProgress + '%' }"
  ></div>

  <!-- Barre de navigation -->
  <nav 
    id="navbar" 
    :class="[
      'fixed top-0 left-0 right-0 z-100 padding py-3.5 transition-all duration-250',
      isScrolled ? 'bg-creme/96 backdrop-blur-md shadow-[0_2px_20px_rgba(26,92,56,0.09)]' : 'bg-transparent'
    ]"
  >
    <div class="max-w-[1160px] mx-auto px-6 flex justify-between items-center gap-4">
      <a :href="route.path === '/' ? '#accueil' : '/'" class="flex items-center gap-2 font-display text-2xl font-bold tracking-tight shrink-0" aria-label="Ahitché — Accueil">
        <img src="/logo-ahitche-96.webp" alt="" width="40" height="40" class="w-9 h-9 sm:w-10 sm:h-10" />
        <span class="hidden min-[400px]:inline"><span :class="isScrolled ? 'text-foret' : 'text-white'">Ahi</span><span :class="isScrolled ? 'text-or-deep' : 'text-or'">tché</span></span>
      </a>

      <!-- Liens (ordinateur) -->
      <div class="hidden md:flex items-center gap-7">
        <a
          v-for="lien in LIENS"
          :key="lien.href"
          :href="ancre(lien.href)"
          :class="['text-sm font-semibold transition-colors duration-250', isScrolled ? 'text-gris hover:text-foret' : 'text-white/85 hover:text-white']"
        >
          {{ lien.texte }}
        </a>
      </div>

      <!-- Actions : compte (discret) et commande (toujours visible) -->
      <div class="flex items-center gap-1 sm:gap-2">
        <!-- Connecté : accès direct à son espace ; visiteur : fenêtre de connexion -->
        <component
          :is="monEspace ? 'RouterLink' : 'button'"
          v-bind="monEspace ? { to: monEspace } : { type: 'button' }"
          @click="!monEspace && openLoginModal()"
          :aria-label="libelleCompte"
          :class="[
            'cursor-pointer inline-flex items-center justify-center gap-2 min-w-11 min-h-11 px-2 md:px-3 rounded-full text-sm font-semibold transition-colors duration-250',
            isScrolled ? 'text-foret hover:bg-foret/8' : 'text-white hover:bg-white/12'
          ]"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
          <span class="hidden md:inline">{{ libelleCompte }}</span>
        </component>

        <a
          :href="lienWhatsApp(MESSAGES_WHATSAPP.commande)"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center min-h-11 bg-or text-noir px-4 sm:px-5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-250 hover:bg-or-deep active:scale-97 shadow-md"
        >
          Commander
        </a>

        <!-- Menu mobile -->
        <button
          type="button"
          class="flex md:hidden flex-col items-center justify-center gap-1.25 w-11 h-11 bg-transparent border-none cursor-pointer rounded-lg transition-colors hover:bg-white/10"
          @click="toggleMenu"
          :aria-expanded="isMenuOpen ? 'true' : 'false'"
          aria-label="Menu"
        >
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'w-[22px] translate-y-[7px] rotate-45' : 'w-[22px]']"></span>
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'opacity-0 scale-x-0' : 'w-[22px]']"></span>
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'w-[22px] -translate-y-[7px] -rotate-45' : 'w-[22px]']"></span>
        </button>
      </div>
    </div>

    <!-- Menu mobile déroulant -->
    <div
      v-if="isMenuOpen"
      class="md:hidden fixed top-[70px] left-0 right-0 bg-creme/98 backdrop-blur-md px-6 py-4 flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-[slideDown_0.25s_ease] z-99"
    >
      <a
        v-for="lien in LIENS"
        :key="lien.href"
        :href="ancre(lien.href)"
        @click="closeMenu"
        class="text-noir text-base py-3 border-b border-foret/7 font-semibold"
      >
        {{ lien.texte }}
      </a>
    </div>
  </nav>



  <div 
    v-if="isLoginModalOpen" 
    class="fixed inset-0 z-300 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="closeLoginModal"
  >
    <div class="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-[scaleUp_0.2s_ease-out]">
      
      <!-- Bouton de fermeture (X) -->
      <button 
        @click="closeLoginModal" 
        class="absolute top-4 right-4 z-10 p-2 text-gris hover:text-noir bg-white/80 backdrop-blur rounded-full transition-colors"
        aria-label="Fermer la fenêtre"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>

      <!-- Partie gauche : Image (Masquée sur petit mobile pour l'espace) -->
      <PanneauMarque titre="Connexion" texte="Connectez-vous à votre compte pour mieux gérer vos commandes et préférences." />

      <!-- Partie droite : Formulaire d'inscription -->
      <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
            
            <div v-if="isForgotPassword">
                <div class="mb-6 text-center">
                    <h2 class="text-2xl font-bold text-foret font-display">Mot de passe oublié</h2>
                    <p class="text-sm text-gris mt-1">Saisissez votre e-mail pour recevoir un lien de réinitialisation.</p>
                </div>

                <form @submit.prevent="handleForgotPassword" class="flex flex-col gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adresse Email</label>
                        <input 
                          type="email" 
                          v-model="forgotEmail" 
                          required 
                          placeholder="exemple@domaine.com"
                          class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
                        />
                    </div>

                    <button 
                      type="submit" 
                      :disabled="isLoading"
                      class="cursor-pointer w-full bg-foret hover:bg-foret/90 text-white font-bold py-3.5 px-4 rounded-xl text-sm mt-2 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {{ isLoading ? 'Envoi...' : 'Envoyer le lien' }}
                    </button>
                </form>

                <div class="flex items-center justify-center gap-1 mt-4">
                    <button @click="isForgotPassword = false" class="cursor-pointer text-sm text-gris hover:text-foret font-medium transition-all">
                        ← Retour à la connexion
                    </button>
                </div>
            </div>

            <div v-else>
                <div class="mb-6 text-center">
                    <h2 class="text-2xl font-bold text-foret font-display">Connexion</h2>
                    <p class="text-sm text-gris mt-1">Connectez-vous à votre compte pour accéder à vos commandes et préférences.</p>
                </div>

                <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adresse Email</label>
                        <input 
                          type="email" 
                          v-model="formLogin.email" 
                          required 
                          placeholder="exemple@domaine.com"
                          class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
                        />
                    </div>

                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider">Mot de passe</label>
                            <button 
                              type="button" 
                              @click="isForgotPassword = true" 
                              class="text-xs text-foret font-bold hover:underline cursor-pointer"
                            >
                                Mot de passe oublié ?
                            </button>
                        </div>
                        <input 
                          type="password" 
                          v-model="formLogin.password" 
                          required 
                          placeholder="••••••••"
                          class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
                        />
                    </div>

                    <button 
                      type="submit" 
                      :disabled="isLoading"
                      class="cursor-pointer w-full bg-foret hover:bg-foret/90 text-white font-bold py-3.5 px-4 rounded-xl text-sm mt-2 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {{ isLoading ? 'Connexion...' : 'Se connecter' }}
                    </button>
                </form>

                <div class="flex items-center justify-center gap-1 mt-4">
                    <span class="text-sm text-gris">
                        Pas de compte ? <button @click="register" class="cursor-pointer text-foret hover:text-foret/90 font-bold">S'inscrire</button>
                    </span>
                </div>
            </div>

        </div>
    </div>
  </div>
</template>