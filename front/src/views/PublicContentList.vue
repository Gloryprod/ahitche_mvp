<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, Play, FileText, Newspaper, Calendar, ArrowRight, User } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'

export interface Post {
  _id: string
  title: string
  slug: string
  type: 'article' | 'blog' | 'video'
  category: string
  summary?: string
  content?: string
  videoUrl?: string
  coverImage?: string
  author?: { nom: string; prenom: string }
  createdAt: string
}

// --- ÉTATS ---
const page = ref(1)
const selectedType = ref<string>('') // '' = Tous, 'article', 'blog', 'video'
const search = ref('')
const debouncedSearch = ref('')
const selectedPost = ref<Post | null>(null)

// Debounce pour la recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (val) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = val
    page.value = 1
  }, 400)
})

const changeType = (type: string) => {
  selectedType.value = type
  page.value = 1
}

// --- API FETCH ---
const fetchPublicPosts = async ({ queryKey }: { queryKey: any }) => {
  const [_, currentPage, currentType, currentSearch] = queryKey
  const response = await api.get('/api/public/posts', {
    params: {
      page: currentPage,
      limit: 9,
      published: 'true',
      type: currentType || undefined,
      search: currentSearch || undefined
    }
  })
  return response.data
}

const { data, isLoading, isError, isPlaceholderData } = useQuery({
  queryKey: ['publicPosts', page, selectedType, debouncedSearch],
  queryFn: fetchPublicPosts,
  placeholderData: keepPreviousData
})

// Convertisseur pour intégrer les vidéos YouTube
const embedVideoUrl = computed(() => {
  if (!selectedPost.value?.videoUrl) return ''
  const url = selectedPost.value.videoUrl
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = url.match(regExp)
  return (match && match[2]?.length === 11) ? `https://www.youtube.com/embed/${match[2]}` : url
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 font-sans text-gray-800">
    
    <!-- En-tête / Hero Section -->
    <div class="text-center max-w-2xl mx-auto space-y-3">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Actualités & Médias</h1>
      <p class="text-sm text-gray-500">Découvrez nos derniers articles, publications de blog et contenus vidéo.</p>
    </div>

    <!-- Barre de Filtres & Recherche -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
      
      <!-- Onglets de filtre -->
      <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
        <button 
          @click="changeType('')" 
          :class="[selectedType === '' ? 'bg-emerald-800 text-white shadow-xs' : 'bg-gray-50 text-gray-600 hover:bg-gray-100', 'px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer']">
          Tous
        </button>
        <button 
          @click="changeType('article')" 
          :class="[selectedType === 'article' ? 'bg-emerald-800 text-white shadow-xs' : 'bg-gray-50 text-gray-600 hover:bg-gray-100', 'px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5']">
          <Newspaper class="w-3.5 h-3.5" /> Articles
        </button>
        <button 
          @click="changeType('blog')" 
          :class="[selectedType === 'blog' ? 'bg-emerald-800 text-white shadow-xs' : 'bg-gray-50 text-gray-600 hover:bg-gray-100', 'px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5']">
          <FileText class="w-3.5 h-3.5" /> Blogs
        </button>
        <button 
          @click="changeType('video')" 
          :class="[selectedType === 'video' ? 'bg-emerald-800 text-white shadow-xs' : 'bg-gray-50 text-gray-600 hover:bg-gray-100', 'px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5']">
          <Play class="w-3.5 h-3.5" /> Vidéos
        </button>
      </div>

      <!-- Recherche -->
      <div class="relative w-full md:w-72">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input 
          v-model="search" 
          type="text" 
          placeholder="Rechercher par mot-clé..." 
          class="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-emerald-700 focus:bg-white transition-all" />
      </div>
    </div>

    <!-- Contenu / Grille -->
    <div v-if="isLoading" class="text-center py-20 text-gray-400 text-sm font-medium">Chargement des publications...</div>
    <div v-else-if="isError" class="text-center py-20 text-red-500 text-sm">Une erreur est survenue lors de la récupération des articles.</div>
    <div v-else-if="!data?.posts?.length" class="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <p class="text-gray-500 font-medium text-sm">Aucun contenu ne correspond à vos critères de recherche.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <article 
        v-for="post in data.posts" 
        :key="post._id" 
        @click="selectedPost = post"
        class="group bg-white rounded-2xl border border-gray-100 shadow-xs hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col justify-between">
        
        <div>
          <!-- Image de couverture / Badge Type -->
          <div class="relative h-48 w-full bg-gray-100 overflow-hidden">
            <img 
              v-if="post.coverImage" 
              :src="post.coverImage" 
              :alt="post.title" 
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div v-else class="w-full h-full flex items-center justify-center bg-emerald-50 text-emerald-800">
              <Play v-if="post.type === 'video'" class="w-10 h-10 opacity-40" />
              <Newspaper v-else class="w-10 h-10 opacity-40" />
            </div>

            <!-- Category & Type Badges -->
            <div class="absolute top-3 left-3 flex gap-2">
              <span class="px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-lg text-[10px] font-bold text-gray-800 uppercase tracking-wider shadow-2xs">
                {{ post.category }}
              </span>
            </div>
            
            <div v-if="post.type === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div class="w-12 h-12 rounded-full bg-white/90 text-emerald-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play class="w-5 h-5 fill-current ml-0.5" />
              </div>
            </div>
          </div>

          <!-- Contenu texte -->
          <div class="p-5 space-y-3">
            <div class="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
              <span class="flex items-center gap-1"><Calendar class="w-3.5 h-3.5" /> {{ new Date(post.createdAt).toLocaleDateString() }}</span>
              <span v-if="post.author" class="flex items-center gap-1"><User class="w-3.5 h-3.5" /> {{ post.author.prenom }} {{ post.author.nom }}</span>
            </div>

            <h2 class="font-bold text-gray-900 text-base line-clamp-2 group-hover:text-emerald-800 transition-colors">
              {{ post.title }}
            </h2>

            <p class="text-xs text-gray-500 line-clamp-3 leading-relaxed">
              {{ post.summary || post.content }}
            </p>
          </div>
        </div>

        <div class="px-5 pb-5 pt-2 flex items-center justify-between border-t border-gray-50 text-xs font-bold text-emerald-800">
          <span>{{ post.type === 'video' ? 'Regarder la vidéo' : 'Lire la suite' }}</span>
          <ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </article>
    </div>

    <!-- Pagination -->
    <div v-if="data?.posts?.length" class="flex items-center justify-between pt-6 border-t border-gray-100">
      <button 
        :disabled="page === 1 || isPlaceholderData" 
        @click="page--" 
        class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-all cursor-pointer">
        ← Page précédente
      </button>
      <span class="text-xs text-gray-500 font-medium">Page <strong class="text-gray-900">{{ page }}</strong></span>
      <button 
        :disabled="!data?.hasMore || isPlaceholderData" 
        @click="page++" 
        class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 transition-all cursor-pointer">
        Page suivante →
      </button>
    </div>

    <!-- MODAL DE LECTURE COMPLÈTE -->
    <div v-if="selectedPost" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div class="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-y-auto p-6 space-y-6 relative">
        
        <button @click="selectedPost = null" class="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors cursor-pointer">
          ✕
        </button>

        <div class="space-y-2">
          <span class="px-3 py-1 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-lg uppercase tracking-wider">{{ selectedPost.category }}</span>
          <h2 class="text-2xl font-extrabold text-gray-900">{{ selectedPost.title }}</h2>
          <p class="text-xs text-gray-400">Publié le {{ new Date(selectedPost.createdAt).toLocaleDateString() }}</p>
        </div>

        <!-- Integration lecteur Vidéo si c'est un format vidéo -->
        <div v-if="selectedPost.type === 'video' && selectedPost.videoUrl" class="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe :src="embedVideoUrl" class="w-full h-full" frameborder="0" allowfullscreen></iframe>
        </div>

        <!-- Image si disponible et non vidéo -->
        <div v-else-if="selectedPost.coverImage" class="w-full h-64 rounded-xl overflow-hidden bg-gray-100">
          <img :src="selectedPost.coverImage" :alt="selectedPost.title" class="w-full h-full object-cover" />
        </div>

        <!-- Résumé -->
        <div v-if="selectedPost.summary" class="p-4 bg-emerald-50/50 border-l-4 border-emerald-800 text-xs italic text-gray-700 rounded-r-xl">
          {{ selectedPost.summary }}
        </div>

        <!-- Contenu complet de l'article -->
        <div v-if="selectedPost.content" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
          {{ selectedPost.content }}
        </div>

      </div>
    </div>

  </div>
</template>