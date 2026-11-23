<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { ClipboardCheck, Copy, Check, Info, Trash2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'
import { FORMULES_ENQUETE, AVIS_PRODUIT, MESSAGE_ENQUETE, type AvisProduit } from '@/config/enquete'

// Enquête de satisfaction (page publique /enquete, sans compte) : synthèse, réponses une à une et suppression.
// Section « enquete » : lecture admin et coordinateur, suppression admin (le serveur fait foi et journalise).
// Les réponses s'effacent seules au bout d'un an (index TTL côté serveur).

interface Texte { texte: string; date: string }
interface Synthese {
  total: number
  moyennes: { globale: number | null; livraison: number | null; qualite: number | null }
  parFormule: Record<string, number>
  produits: { id: string; nom: string; plus: number; moins: number; bien: number; autre: number; remplacements: string[] }[]
  produitsSouhaites: Texte[]
  suggestions: Texte[]
}
interface Reponse {
  id: string
  date: string
  noteGlobale: number
  noteLivraison?: number | null
  noteQualite?: number | null
  formule?: string | null
  produitsPlus: string[]
  produitsMoins: string[]
  produitSouhaite?: string | null
  detail: { nom: string; avis: AvisProduit; remplacement?: string | null }[]
  suggestion?: string | null
  contact?: { prenom?: string; telephone?: string; accordRecontact?: boolean } | null
}
const PAR_PAGE = 20

const auth = useAuthStore()
const ecriture = computed(() => peutEcrire(auth.role.value, 'enquete'))
const toast = useToast()
const queryClient = useQueryClient()

// --- Synthèse sur la période choisie (toutes les réponses si les dates sont vides) ---
const du = ref('')
const au = ref('')
const { data: synthese, isLoading: chargementSynthese, isError: erreurSynthese } = useQuery({
  queryKey: ['enquete', 'synthese', du, au],
  queryFn: async (): Promise<Synthese> =>
    (await api.get('/api/admin/enquete/synthese', { params: { du: du.value || undefined, au: au.value || undefined } })).data,
})
const MOYENNES = [
  { cle: 'globale', libelle: 'Note globale' },
  { cle: 'livraison', libelle: 'Livraison' },
  { cle: 'qualite', libelle: 'Qualité des produits' },
] as const
const formules = computed(() => Object.entries(synthese.value?.parFormule ?? {}).sort((a, b) => b[1] - a[1]))
const libelleFormule = (slug?: string | null) => FORMULES_ENQUETE.find(f => f.valeur === slug)?.libelle ?? slug ?? ''
const libelleAvis = (avis: AvisProduit) => AVIS_PRODUIT.find(a => a.valeur === avis)?.libelle ?? avis
const decimale = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// --- Réponses une à une, 20 par page, plus récentes d'abord ---
const page = ref(1)
const { data: liste, isLoading: chargementListe, isError: erreurListe } = useQuery({
  queryKey: ['enquete', 'reponses', page],
  queryFn: async (): Promise<{ total: number; page: number; reponses: Reponse[] }> =>
    (await api.get('/api/admin/enquete/reponses', { params: { page: page.value } })).data,
  placeholderData: keepPreviousData,
})
const pages = computed(() => Math.max(1, Math.ceil((liste.value?.total ?? 0) / PAR_PAGE)))

async function supprimer(r: Reponse) {
  const choix = await Swal.fire({
    title: 'Supprimer cette réponse ?', text: `Réponse du ${dateFr(r.date)} : elle sort de la synthèse et de la liste, sans retour possible.`,
    icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler',
  })
  if (!choix.isConfirmed) return
  try {
    await api.delete(`/api/admin/enquete/${r.id}`)
    toast.success('Réponse supprimée.')
    if (liste.value?.reponses.length === 1 && page.value > 1) page.value--
    queryClient.invalidateQueries({ queryKey: ['enquete'] })
  } catch (err) {
    toast.error(messageErreur(err, 'Suppression impossible'))
  }
}

// --- Message à envoyer aux clients ---
const copie = ref(false)
async function copierMessage() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Presse-papiers indisponible')
    await navigator.clipboard.writeText(MESSAGE_ENQUETE)
    copie.value = true
    window.setTimeout(() => { copie.value = false }, 2000)
    toast.success('Message copié : collez-le dans WhatsApp.')
  } catch {
    toast.error('Copie impossible : sélectionnez le message à la main.')
  }
}

const dateFr = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '')
const carte = 'bg-white rounded-2xl border border-creme2 p-4'
const sousTitre = 'font-display font-bold text-base text-foret'
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div :class="[carte, 'space-y-3']">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><ClipboardCheck class="w-5 h-5 text-foret" /> Enquête de satisfaction</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><Info class="w-3.5 h-3.5 shrink-0 mt-0.5" /> Les clients répondent sans compte sur ahitchebj.com/enquete. Les réponses sont anonymes sauf si le client laisse son numéro, et s'effacent seules au bout d'un an.</p>
      <div class="bg-creme rounded-xl p-3 space-y-2">
        <p class="text-xs text-noir select-all">{{ MESSAGE_ENQUETE }}</p>
        <button type="button" class="cursor-pointer inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg bg-foret text-white text-xs font-bold hover:bg-savane" @click="copierMessage">
          <component :is="copie ? Check : Copy" class="w-3.5 h-3.5" /> {{ copie ? 'Copié' : 'Copier le message à envoyer' }}
        </button>
      </div>
    </div>

    <!-- Période -->
    <div :class="[carte, 'flex flex-wrap items-end gap-3']" role="group" aria-label="Période de la synthèse">
      <label class="text-xs font-bold text-gris">Du
        <input v-model="du" type="date" class="mt-1 block px-3 py-2 border border-creme2 rounded-xl text-sm text-noir" />
      </label>
      <label class="text-xs font-bold text-gris">Au
        <input v-model="au" type="date" class="mt-1 block px-3 py-2 border border-creme2 rounded-xl text-sm text-noir" />
      </label>
      <button v-if="du || au" type="button" class="cursor-pointer min-h-10 px-3 rounded-lg border border-creme2 text-xs font-bold text-foret hover:bg-creme" @click="du = ''; au = ''">Toute la période</button>
    </div>

    <p v-if="chargementSynthese" class="text-center text-gris py-6">Chargement...</p>
    <p v-else-if="erreurSynthese" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Synthèse indisponible pour le moment.</p>
    <template v-else-if="synthese">
      <!-- Moyennes -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div :class="carte">
          <p class="text-xs text-gris">Réponses</p>
          <p class="font-display font-bold text-2xl text-foret">{{ synthese.total }}</p>
        </div>
        <div v-for="m in MOYENNES" :key="m.cle" :class="carte">
          <p class="text-xs text-gris">{{ m.libelle }}</p>
          <p class="font-display font-bold text-2xl text-foret">
            <template v-if="synthese.moyennes[m.cle] !== null">{{ decimale(synthese.moyennes[m.cle] ?? 0) }}<span class="text-sm text-gris font-body font-normal"> / 5</span></template>
            <span v-else class="text-base text-gris font-body font-normal">Aucune note</span>
          </p>
        </div>
      </div>

      <!-- Réponses par formule -->
      <section :class="[carte, 'space-y-2']" aria-labelledby="titre-par-formule">
        <h2 id="titre-par-formule" :class="sousTitre">Réponses par pack</h2>
        <p v-if="!formules.length" class="text-xs text-gris">Aucun pack indiqué sur la période.</p>
        <ul v-else class="space-y-2">
          <li v-for="[slug, nombre] in formules" :key="slug" class="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-xs">
            <span class="font-semibold">{{ libelleFormule(slug) }}</span>
            <span class="h-2 rounded-full bg-creme2 overflow-hidden" aria-hidden="true"><span class="block h-full bg-savane" :style="{ width: `${synthese.total ? (nombre / synthese.total) * 100 : 0}%` }"></span></span>
            <span class="text-right font-bold">{{ nombre }}</span>
          </li>
        </ul>
      </section>

      <!-- Produits -->
      <section :class="[carte, 'space-y-2']" aria-labelledby="titre-produits">
        <h2 id="titre-produits" :class="sousTitre">Produits du pack</h2>
        <p class="text-xs text-gris">« Plus » : demandé en plus grande quantité ; « Moins » : peu utilisé. Questions courtes et détail produit par produit réunis.</p>
        <p v-if="!synthese.produits.length" class="text-xs text-gris">Aucun avis sur les produits pour la période.</p>
        <div v-else v-defilable="'Avis par produit'" class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-160 text-xs">
            <thead>
              <tr class="border-b border-creme2 text-[10px] font-bold text-gris uppercase tracking-wider">
                <th class="py-2 px-2">Produit</th>
                <th class="py-2 px-2 text-right">Plus</th>
                <th class="py-2 px-2 text-right">Moins</th>
                <th class="py-2 px-2 text-right">Bien</th>
                <th class="py-2 px-2 text-right">Autre chose</th>
                <th class="py-2 px-2">À la place, proposé</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-creme2">
              <tr v-for="p in synthese.produits" :key="p.id">
                <td class="py-2 px-2 font-bold text-foret">{{ p.nom }}</td>
                <td class="py-2 px-2 text-right font-semibold">{{ p.plus }}</td>
                <td class="py-2 px-2 text-right font-semibold">{{ p.moins }}</td>
                <td class="py-2 px-2 text-right">{{ p.bien }}</td>
                <td class="py-2 px-2 text-right">{{ p.autre }}</td>
                <td class="py-2 px-2 text-gris">{{ p.remplacements.join(' · ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Textes libres -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section v-for="bloc in [{ id: 'souhaites', titre: 'Produits souhaités', textes: synthese.produitsSouhaites }, { id: 'suggestions', titre: 'Suggestions et remarques', textes: synthese.suggestions }]"
          :key="bloc.id" :class="[carte, 'space-y-2']" :aria-labelledby="`titre-${bloc.id}`">
          <h2 :id="`titre-${bloc.id}`" :class="sousTitre">{{ bloc.titre }} <span class="font-body text-xs font-normal text-gris">({{ bloc.textes.length }})</span></h2>
          <p v-if="!bloc.textes.length" class="text-xs text-gris">Rien pour la période.</p>
          <ul v-else class="divide-y divide-creme2">
            <li v-for="(t, i) in bloc.textes" :key="i" class="py-2">
              <p class="whitespace-pre-line break-words">{{ t.texte }}</p>
              <p class="text-[11px] text-gris">{{ dateFr(t.date) }}</p>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- Réponses une à une -->
    <section class="space-y-3" aria-labelledby="titre-reponses">
      <h2 id="titre-reponses" :class="sousTitre">Toutes les réponses <span v-if="liste" class="font-body text-xs font-normal text-gris">({{ liste.total }})</span></h2>
      <p v-if="chargementListe" class="text-center text-gris py-6">Chargement...</p>
      <p v-else-if="erreurListe" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Réponses indisponibles pour le moment.</p>
      <p v-else-if="!liste?.reponses.length" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Aucune réponse pour le moment.</p>
      <template v-else>
        <article v-for="r in liste.reponses" :key="r.id" :class="[carte, 'text-xs space-y-1.5']">
          <div class="flex items-start justify-between gap-2">
            <p class="font-bold text-foret">
              {{ dateFr(r.date) }}<template v-if="r.formule"> · {{ libelleFormule(r.formule) }}</template>
            </p>
            <button v-if="ecriture" type="button" class="cursor-pointer shrink-0 p-2 -m-1 rounded-lg text-gris hover:text-noir hover:bg-creme" :aria-label="`Supprimer la réponse du ${dateFr(r.date)}`" @click="supprimer(r)"><Trash2 class="w-4 h-4" /></button>
          </div>
          <p>
            Note globale <strong>{{ r.noteGlobale }}/5</strong>
            <template v-if="r.noteLivraison"> · Livraison <strong>{{ r.noteLivraison }}/5</strong></template>
            <template v-if="r.noteQualite"> · Qualité <strong>{{ r.noteQualite }}/5</strong></template>
          </p>
          <p v-if="r.produitsPlus.length"><span class="text-gris">En plus :</span> {{ r.produitsPlus.join(', ') }}</p>
          <p v-if="r.produitsMoins.length"><span class="text-gris">Les moins utilisés :</span> {{ r.produitsMoins.join(', ') }}</p>
          <p v-if="r.produitSouhaite"><span class="text-gris">Souhaité :</span> {{ r.produitSouhaite }}</p>
          <p v-if="r.detail.length"><span class="text-gris">Détail :</span>
            <template v-for="(d, i) in r.detail" :key="d.nom">{{ i ? ' · ' : ' ' }}{{ d.nom }} : {{ libelleAvis(d.avis).toLowerCase() }}<template v-if="d.remplacement"> ({{ d.remplacement }})</template></template>
          </p>
          <p v-if="r.suggestion" class="whitespace-pre-line break-words"><span class="text-gris">Suggestion :</span> {{ r.suggestion }}</p>
          <p v-if="r.contact?.prenom || r.contact?.telephone" class="pt-1 border-t border-creme2">
            <span class="text-gris">Contact :</span> {{ r.contact.prenom }}
            <a v-if="r.contact.telephone" :href="`tel:${r.contact.telephone}`" class="font-semibold text-foret underline underline-offset-2">{{ r.contact.telephone }}</a>
            <span v-if="r.contact.accordRecontact" class="text-gris"> · accepte d'être recontacté</span>
          </p>
        </article>
        <nav v-if="pages > 1" class="flex items-center justify-center gap-3" aria-label="Pages des réponses">
          <button type="button" :disabled="page <= 1" class="cursor-pointer min-h-10 px-3 rounded-lg border border-creme2 bg-white text-xs font-bold text-foret disabled:opacity-40 disabled:cursor-not-allowed" @click="page--">Précédente</button>
          <span class="text-xs text-gris">Page {{ page }} sur {{ pages }}</span>
          <button type="button" :disabled="page >= pages" class="cursor-pointer min-h-10 px-3 rounded-lg border border-creme2 bg-white text-xs font-bold text-foret disabled:opacity-40 disabled:cursor-not-allowed" @click="page++">Suivante</button>
        </nav>
      </template>
    </section>
  </div>
</template>
