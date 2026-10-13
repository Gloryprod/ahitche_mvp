<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import api from '@/stores/api'
import LienAccueil from '@/components/ui/LienAccueil.vue'
import { lienWhatsApp } from '@/config/contact'
import { SITE, definirApercu, ajouterDonneesStructurees, marquerNonIndexable } from '@/services/referencement'
import type { Post } from './PublicContentList.vue'

// Page d'un contenu du blog (/blog/:slug) : adresse propre, à partager et à faire trouver sur Google
const route = useRoute()
const post = ref<Post | null>(null)
const etat = ref<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement')
let retirerDonnees: (() => void) | undefined

const adresse = computed(() => `${SITE}/blog/${post.value?.slug ?? ''}`)
const datePublication = computed(() => post.value ? new Date(post.value.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const partageWhatsApp = computed(() => post.value ? lienWhatsApp(`${post.value.title} : ${adresse.value}`) : '')

// Vidéo YouTube : adresse d'intégration ; autre adresse (Cloudinary…) : utilisée telle quelle
const videoIntegree = computed(() => {
  const url = post.value?.videoUrl || ''
  const id = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2]
  return id?.length === 11 ? `https://www.youtube-nocookie.com/embed/${id}` : url
})

async function charger(slug: string) {
  etat.value = 'chargement'
  retirerDonnees?.()
  try {
    post.value = (await api.get(`/api/public/posts/${encodeURIComponent(slug)}`)).data.post
    etat.value = 'pret'
    const p = post.value!
    document.title = `${p.title} · Ahitché`
    definirApercu({ titre: p.title, description: p.summary || p.content?.slice(0, 160), image: p.coverImage })
    retirerDonnees = ajouterDonneesStructurees('donnees-article', {
      '@context': 'https://schema.org',
      '@type': p.type === 'video' ? 'VideoObject' : 'Article',
      [p.type === 'video' ? 'name' : 'headline']: p.title,
      description: p.summary || undefined,
      image: p.coverImage || undefined,
      ...(p.type === 'video' ? { uploadDate: p.createdAt, thumbnailUrl: p.coverImage || undefined, embedUrl: videoIntegree.value } : { datePublished: p.createdAt }),
      publisher: { '@type': 'Organization', name: 'Ahitché', url: `${SITE}/` },
      mainEntityOfPage: adresse.value,
    })
  } catch (err) {
    post.value = null
    etat.value = (err as { response?: { status?: number } })?.response?.status === 404 ? 'introuvable' : 'erreur'
    document.title = 'Contenu introuvable · Ahitché'
    marquerNonIndexable()
  }
}

watch(() => route.params.slug, (slug) => { if (typeof slug === 'string') charger(slug) }, { immediate: true })
onUnmounted(() => { retirerDonnees?.(); definirApercu(null) })
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-10">
    <LienAccueil />
    <RouterLink to="/blog" class="inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-foret hover:text-savane">← Tous les contenus</RouterLink>

    <p v-if="etat === 'chargement'" class="py-20 text-center text-sm text-gris" aria-busy="true">Chargement…</p>

    <div v-else-if="etat !== 'pret'" class="py-16 text-center space-y-3">
      <h1 class="font-display text-2xl font-bold text-noir">{{ etat === 'introuvable' ? 'Ce contenu n\'existe pas ou n\'est plus en ligne' : 'Le contenu n\'a pas pu être chargé' }}</h1>
      <p class="text-sm text-gris">{{ etat === 'introuvable' ? 'Retrouvez nos autres publications sur la page Actualités.' : 'Vérifiez votre connexion, puis réessayez.' }}</p>
      <RouterLink to="/blog" class="inline-flex items-center min-h-11 px-5 rounded-full bg-foret text-white text-sm font-bold">Voir les actualités</RouterLink>
    </div>

    <article v-else-if="post" class="mt-4 space-y-6">
      <header class="space-y-3">
        <span class="inline-block px-3 py-1 bg-foret/10 text-foret text-[11px] font-bold rounded-full uppercase tracking-wider">{{ post.category }}</span>
        <h1 class="font-display text-3xl sm:text-4xl font-bold text-noir leading-tight text-balance">{{ post.title }}</h1>
        <p class="text-sm text-gris">Publié le <time :datetime="post.createdAt">{{ datePublication }}</time></p>
      </header>

      <div v-if="post.type === 'video' && post.videoUrl" class="aspect-video w-full rounded-2xl overflow-hidden bg-noir">
        <iframe :src="videoIntegree" :title="post.title" class="w-full h-full" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>
      <img v-else-if="post.coverImage" :src="post.coverImage" :alt="post.title" class="w-full max-h-96 object-cover rounded-2xl bg-creme2" />

      <p v-if="post.summary" class="p-4 bg-creme border-l-4 border-foret rounded-r-xl text-base text-noir leading-relaxed">{{ post.summary }}</p>
      <div v-if="post.content" class="text-base text-noir leading-relaxed whitespace-pre-wrap">{{ post.content }}</div>

      <footer class="pt-6 border-t border-creme2 flex flex-wrap items-center gap-3">
        <a :href="partageWhatsApp" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 min-h-11 px-5 rounded-full bg-savane text-white text-sm font-bold hover:bg-foret">
          Partager sur WhatsApp
        </a>
        <RouterLink to="/blog" class="inline-flex items-center min-h-11 px-5 rounded-full border border-creme2 text-sm font-bold text-foret">Autres actualités</RouterLink>
      </footer>
    </article>
  </div>
</template>
