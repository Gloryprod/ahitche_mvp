<template>
    <div class="min-h-screen flex md:flex-row">
        <PanneauMarque titre="Le marché, organisé pour vous" texte="Votre partenaire de confiance pour les courses de votre foyer." />

        <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
            <div class="mb-4">
                <LienAccueil />
            </div>

            <!-- Pourquoi l'utilisateur arrive ici : inactivité, session expirée ou page protégée demandée -->
            <p v-if="sessionInactivite" role="status" class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                Par sécurité, vous avez été déconnecté après une période d'inactivité. Reconnectez-vous pour reprendre là où vous en étiez.
            </p>
            <p v-else-if="sessionExpiree" role="status" class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                Votre session a expiré. Reconnectez-vous pour reprendre là où vous en étiez.
            </p>
            <p v-else-if="pageDemandee" role="status" class="mb-5 p-3 rounded-xl bg-creme border border-creme2 text-noir text-sm">
                Connectez-vous pour accéder à cette page.
            </p>

            <div v-if="isForgotPassword">
                <div class="mb-6 text-center">
                    <h2 class="text-2xl font-bold text-foret font-display">Mot de passe oublié</h2>
                    <p class="text-sm text-gray-500 mt-1">Saisissez votre e-mail pour recevoir un lien de réinitialisation.</p>
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
                    <button @click="isForgotPassword = false" class="cursor-pointer text-sm text-gray-500 hover:text-foret font-medium transition-all">
                        ← Retour à la connexion
                    </button>
                </div>
            </div>

            <div v-else>
                <div class="mb-6 text-center">
                    <h2 class="text-2xl font-bold text-foret font-display">Connexion</h2>
                    <p class="text-sm text-gray-500 mt-1">Connectez-vous à votre compte pour accéder à vos commandes et préférences.</p>
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
                    <span class="text-sm text-gray-500">
                        Pas de compte ? <button @click="register" class="cursor-pointer text-foret hover:text-foret/90 font-bold">S'inscrire</button>
                    </span>
                </div>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import PanneauMarque from '@/components/ui/PanneauMarque.vue'
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from 'vue-toastification';
import { espaceParDefaut } from '@/config/roles';
import LienAccueil from '@/components/ui/LienAccueil.vue';

const formLogin = ref({ email: '', password: '' })
const forgotEmail = ref('')
const isForgotPassword = ref(false)
const isLoading = ref(false)

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

// Page demandée avant la connexion (lien partagé, session expirée) : uniquement un chemin interne au site
const pageDemandee = computed(() => {
  const cible = route.query.redirect
  return typeof cible === 'string' && /^\/(?![\/\\])/.test(cible) && !cible.includes('://') ? cible : null
})
const sessionExpiree = computed(() => route.query.session === 'expiree')
const sessionInactivite = computed(() => route.query.session === 'inactivite')

const handleLogin = async () => {
  isLoading.value = true
  try {
    const data = await authStore.login(formLogin.value) 
    const userRole = data.user.role;

    toast.success(data.message);

    // Retour à la page demandée, sinon : client -> son espace ; équipe -> la première section de son rôle
    // (le routeur vérifie ensuite que le rôle donne bien accès à la page demandée).
    // « replace » : le bouton retour ne ramène pas sur le formulaire de connexion.
    router.replace(pageDemandee.value ?? espaceParDefaut(userRole))
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
  router.push('/register')
}
</script>