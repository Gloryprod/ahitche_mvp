<template>
    <div class="min-h-screen flex md:flex-row">
        <div class="hidden md:block md:w-1/2 relative bg-foret min-h-[450px]">
            <img 
                src="/beautiful-couple-looking-their-laptop.jpg" 
                alt="Plat Ahitché" 
                class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
                <h3 class="font-display text-2xl font-bold mb-2">Prêt à commander ?</h3>
                <p class="text-white/80 text-sm">Créez votre compte en un instant pour planifier et recevoir vos formules de la semaine.</p>
            </div>
        </div>

        <!-- Partie droite : Formulaire d'inscription -->
        <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
        <div class="mb-6 text-center">
            <h2 class="text-2xl font-bold text-foret font-display">Rejoignez Ahitché</h2>
            <p class="text-sm text-gray-500 mt-1">Créez votre profil pour finaliser votre commande.</p>
        </div>

        <form @submit.prevent="handleRegister" class="flex flex-col gap-4">
            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nom complet</label>
            <input 
                type="text" 
                v-model="formRegister.username" 
                required 
                placeholder="Ex: Koffi Bénin"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
            </div>

            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adresse Email</label>
            <input 
                type="email" 
                v-model="formRegister.email" 
                required 
                placeholder="exemple@domaine.com"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
            </div>

            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mot de passe</label>
            <input 
                type="password" 
                v-model="formRegister.password" 
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
            {{ isLoading ? 'Création du compte...' : 'Créer mon compte & Continuer' }}
            </button>
        </form>

        <div class="flex items-center justify-center gap-1 mt-4">
            <span class="text-sm text-gray-500">
                Déjà inscrit ? <button @click="login" class="cursor-pointer text-foret hover:text-foret/90 font-bold">Se connecter</button>
            </span>
        </div>

        </div>
    </div>
    
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';

const formRegister = ref({ username: '', email: '', password: '' })
const isLoading = ref(false)
const router = useRouter()
const toast = useToast()

const handleRegister = async () => {
  isLoading.value = true
  try {
    const response = await axios.post('api/auth/register', formRegister.value)
    toast.success(response.data.message || "Inscription réussie !")
    formRegister.value = { username: '', email: '', password: '' } // Reset
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Une erreur est survenue lors de l'inscription.")
  } finally {
    isLoading.value = false
  }
}

const login = () => {
  router.push('/login')
}
</script>