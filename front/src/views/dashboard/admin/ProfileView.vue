<script setup lang="ts">
import { ref, watch } from 'vue';
import SideBarAdmin from '@/components/admin/layout/SideBarAdmin.vue';
import { RouterView, useRoute } from 'vue-router'
import { Menu, X } from 'lucide-vue-next'

const route = useRoute()
const commandesEnAttenteCount = ref(1);

// État pour contrôler l'ouverture du menu mobile
const isMobileMenuOpen = ref(false);

// Fermer automatiquement le menu mobile dès que l'utilisateur change de page
watch(() => route.path, () => {
  isMobileMenuOpen.value = false
})
</script>

<template>
  <div class="min-h-screen bg-[#f3f2f9] font-body text-noir antialiased flex flex-col lg:block">
    
    <header class="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-xs">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-foret"></span>
        <span class="font-display font-bold text-sm text-noir">Ahitché Back Office</span>
      </div>
      
      <button 
        @click="isMobileMenuOpen = !isMobileMenuOpen"
        type="button" 
        class="p-2 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors focus:outline-none"
      >
        <Menu v-if="!isMobileMenuOpen" class="w-5 h-5 stroke-2" />
        <X v-else class="w-5 h-5 stroke-2" />
      </button>
    </header>

    <div class="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start w-full flex-1">
      
      <div 
        :class="[
          'lg:col-span-1 fixed inset-0 z-50 lg:z-auto lg:relative bg-black/40 lg:bg-transparent transition-opacity duration-300 lg:opacity-100 lg:pointer-events-auto',
          isMobileMenuOpen ? 'opacity-100 pointer-ev  ents-auto' : 'opacity-0 pointer-events-none lg:block hidden'
        ]"
        @click.self="isMobileMenuOpen = false"
      >
        <div 
          :class="[
            'w-70 sm:w-[320px] lg:w-full h-full lg:h-auto bg-white lg:bg-transparent shadow-xl lg:shadow-none transition-transform duration-300 transform lg:transform-none flex flex-col',
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          ]"
        >
          <div class="p-4 flex justify-end lg:hidden border-b border-gray-50">
            <button @click="isMobileMenuOpen = false" class="p-1.5 bg-gray-50 text-gray-500 rounded-lg">
              <X class="w-4 h-4" />
            </button>
          </div>
          
          <div class="overflow-y-auto lg:overflow-visible flex-1 p-4 lg:p-0">
            <SideBarAdmin :commandes-en-attente-count="commandesEnAttenteCount"/>
          </div>
        </div>
      </div>

      <main class="lg:col-span-3 w-full min-w-0">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>

    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>