<template>
    <div class="min-h-screen flex md:flex-row">
        <div class="hidden md:block md:w-1/2 relative bg-foret min-h-112.5">
            <img 
              src="/beautiful-couple-looking-their-laptop.jpg" 
              alt="Plat Ahitché" 
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
              <h3 class="font-display text-2xl font-bold mb-2">Ahitché</h3>
              <p class="text-white/80 text-sm">Votre partenaire de confiance dans la réalisation de vos courses</p>
            </div>
        </div>

        <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
            
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from 'vue-toastification';

const formLogin = ref({ email: '', password: '' })
const forgotEmail = ref('')
const isForgotPassword = ref(false)
const isLoading = ref(false)

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const handleLogin = async () => {
  isLoading.value = true
  try {
    const data = await authStore.login(formLogin.value) 
    const userRole = data.user.role;

    toast.success(data.message);

    if(userRole === "admin"){
      router.push('/dashboard/admin')
    } else {
      router.push('/dashboard/user')
    }
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