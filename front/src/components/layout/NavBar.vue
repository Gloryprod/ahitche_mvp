<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'

const router = useRouter()
const isScrolled = ref(false)
const isMenuOpen = ref(false)
const scrollProgress = ref(0)
const authStore = useAuthStore()
const toast = useToast()

const isLoginModalOpen = ref(false)
const isLoading = ref(false)
const formLogin = ref({ email: '', password: '' })

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
  isLoginModalOpen.value = true
  document.body.style.overflow = 'hidden' // Bloque le scroll arrière
  closeMenu()
}

const closeLoginModal = () => {
  isLoginModalOpen.value = false
  if (!isMenuOpen.value) document.body.style.overflow = ''
}

const handleLogin = async () => {
  isLoading.value = true
  try {
    await authStore.login(formLogin.value) // On utilise la méthode de connexion pour enregistrer l'utilisateur
    formLogin.value = { email: '', password: '' }
    router.push('/dashboard/user') // Redirige vers le tableau de bord utilisateur
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Une erreur est survenue lors de la connexion.")
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
      <a href="#accueil" class="font-display text-2xl font-bold tracking-tight shrink-0" aria-label="Ahitché — Accueil">
        <span :class="isScrolled ? 'text-foret' : 'text-white'">Ahi</span>
        <span :class="isScrolled ? 'text-or-deep' : 'text-or'">tché</span>
      </a>

      <!-- Liens Desktop -->
      <div class="hidden md:flex items-center gap-7">
        <a 
          v-for="(link, idx) in [
            { href: '#probleme', text: 'Pourquoi Ahitché ?' },
            { href: '#formules', text: 'Formules' },
            { href: '#comment', text: 'Comment ça marche' },
            { href: '#variables', text: 'Cette semaine' }
          ]" 
          :key="idx"
          :href="link.href"
          :class="[
            'text-sm font-semibold transition-colors duration-250',
            isScrolled ? 'text-gris hover:text-foret' : 'text-white/80 hover:text-white'
          ]"
        >
          {{ link.text }}
        </a>
      </div>

      <!-- Actions de droite (WhatsApp + Commander) -->
      <div class="flex items-center gap-3">

        <!-- NOUVEAU BOUTON COMMANDER -->
        <button 
          @click="openLoginModal"
          class="cursor-pointer flex items-center bg-or text-foret px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-250 hover:bg-or-deep hover:-translate-y-px shadow-md"
        >
          Connexion
        </button>

        <!-- Burger Menu (Mobile) -->
        <button 
          class="flex md:hidden flex-col justify-center gap-1.25 w-10 h-10 bg-transparent border-none cursor-pointer p-1.5 rounded-lg transition-colors hover:bg-white/10" 
          @click="toggleMenu"
          :aria-expanded="isMenuOpen ? 'true' : 'false'"
          aria-label="Menu"
        >
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'w-[22px] translate-y-[7px] rotate-45' : 'w-[22px]']"></span>
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'opacity-0 scale-x-0' : 'w-[18px]']"></span>
          <span :class="['block h-0.5 rounded-sm transition-all duration-300 origin-center', isScrolled ? 'bg-foret' : 'bg-white', isMenuOpen ? 'w-[22px] -translate-y-[7px] rotate-45' : 'w-[22px]']"></span>
        </button>
      </div>
    </div>

    <!-- Menu Mobile Dropdown -->
    <div 
      v-if="isMenuOpen" 
      class="md:hidden fixed top-[66px] left-0 right-0 bg-creme/98 backdrop-blur-md p-6 flex flex-col gap-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-[slideDown_0.25s_ease] z-99"
    >
      <a 
        v-for="(link, idx) in [
          { href: '#probleme', text: 'Pourquoi Ahitché ?' },
          { href: '#formules', text: 'Formules' },
          { href: '#comment', text: 'Comment ça marche' },
          { href: '#variables', text: 'Cette semaine' }
        ]" 
        :key="idx"
        :href="link.href" 
        @click="closeMenu"
        class="text-noir text-base py-3 border-b border-foret/7 last:border-none font-semibold"
      >
        {{ link.text }}
      </a>
    </div>
  </nav>



  <div 
    v-if="isLoginModalOpen" 
    class="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="closeLoginModal"
  >
    <div class="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-[scaleUp_0.2s_ease-out]">
      
      <!-- Bouton de fermeture (X) -->
      <button 
        @click="closeLoginModal" 
        class="absolute top-4 right-4 z-10 p-2 text-gray-500 hover:text-noir bg-white/80 backdrop-blur rounded-full transition-colors"
        aria-label="Fermer la fenêtre"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>

      <!-- Partie gauche : Image (Masquée sur petit mobile pour l'espace) -->
      <div class="hidden md:block md:w-1/2 relative bg-foret min-h-[450px]">
        <img 
          src="/beautiful-couple-looking-their-laptop.jpg" 
          alt="Plat Ahitché" 
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
          <h3 class="font-display text-2xl font-bold mb-2">Connexion</h3>
          <p class="text-white/80 text-sm">Connectez-vous à votre compte pour mieux gérer vos commandes et préférences.</p>
        </div>
      </div>

      <!-- Partie droite : Formulaire d'inscription -->
      <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
        <div class="mb-6">
          <h2 class="text-2xl font-bold text-foret font-display">Connexion</h2>
          <p class="text-sm text-gray-500 mt-1">Connectez-vous à votre compte pour mieux gérer vos commandes et préférences.</p>
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
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mot de passe</label>
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
            class="w-full bg-foret hover:bg-foret/90 text-white font-bold py-3.5 px-4 rounded-xl text-sm mt-2 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {{ isLoading ? 'Connexion...' : 'Se connecter' }}
         </button>
        </form>

        <div class="flex items-center justify-center gap-1 mt-4">
            <span class="text-sm text-gray-500">
                Pas de compte ? <button @click="register" class="cursor-pointer text-foret hover:text-foret/90 font-bold">S'inscrire</button>
            </span>
        </div>
      </div>
    </div>
  </div>
</template>