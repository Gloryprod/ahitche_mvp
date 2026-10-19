<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import type { Product } from '@/type'
import { FAMILLES_PRODUIT, familleDe } from '@/config/produits'

// Choix d'un produit du catalogue, avec recherche sur la référence ou le nom (sans tenir compte des accents).
// Motif « combobox » de l'ARIA : le champ garde le focus, les flèches parcourent la liste, Entrée choisit,
// Échap referme ; au doigt, toucher le champ ouvre la liste complète.
type ProduitChoix = Pick<Product, '_id' | 'reference' | 'name' | 'unit' | 'type'>

const props = withDefaults(defineProps<{
  produits: readonly ProduitChoix[]
  idChamp: string
  invalide?: boolean
  requis?: boolean
}>(), { invalide: false, requis: false })

const modele = defineModel<string>({ default: '' }) // Identifiant du produit ; vide = aucun

const MAX_AFFICHES = 100 // Au-delà, on demande de préciser la recherche (liste légère sur téléphone)
const idListe = useId()
const texte = ref('')
const ouvert = ref(false)
const actif = ref(-1)
const filtrer = ref(false) // Vrai dès que l'utilisateur tape : sinon la liste complète s'affiche

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const libelle = (p: ProduitChoix) => `${p.reference ? `${p.reference} · ` : ''}${p.name} (${p.unit})`
const collator = new Intl.Collator('fr', { numeric: true })
const rang = (type: string) => {
  const i = FAMILLES_PRODUIT.findIndex(f => f.type === type)
  return i === -1 ? FAMILLES_PRODUIT.length : i
}

// Ordre de l'inventaire : familles P, V, MP, EMB, puis référence et nom
const tries = computed(() => [...props.produits].sort((a, b) => rang(a.type) - rang(b.type)
  || Number(a.reference === null) - Number(b.reference === null)
  || collator.compare(a.reference ?? '', b.reference ?? '')
  || collator.compare(a.name, b.name)))
const recherche = computed(() => tries.value.map(p => ({ p, cle: sansAccents(`${p.reference ?? ''} ${p.name} ${familleDe(p.type)?.code ?? ''}`) })))

const choisi = computed(() => props.produits.find(p => p._id === modele.value) ?? null)

// Tous les mots tapés doivent se retrouver (ex. « riz 25 »)
const trouves = computed(() => {
  const mots = filtrer.value ? sansAccents(texte.value).split(/\s+/).filter(Boolean) : []
  if (!mots.length) return tries.value
  return recherche.value.filter(r => mots.every(m => r.cle.includes(m))).map(r => r.p)
})
const resultats = computed(() => trouves.value.slice(0, MAX_AFFICHES))

// Produit choisi (ou prérempli, ou liste chargée après coup) : le champ affiche son libellé
watch(choisi, (p) => { if (!ouvert.value) texte.value = p ? libelle(p) : '' }, { immediate: true })

const idOption = (i: number) => `${idListe}-${i}`

function rendreVisible() {
  void nextTick(() => document.getElementById(idOption(actif.value))?.scrollIntoView({ block: 'nearest' }))
}

// La sortie du champ referme la liste un instant plus tard : un toucher sur une option qui ôterait le focus
// (certains téléphones) a le temps de la choisir
let minuterie: ReturnType<typeof setTimeout> | undefined
const annulerFermeture = () => clearTimeout(minuterie)
onBeforeUnmount(annulerFermeture)

function ouvrir() {
  annulerFermeture()
  ouvert.value = true
  const i = resultats.value.findIndex(p => p._id === modele.value)
  actif.value = i >= 0 ? i : (resultats.value.length ? 0 : -1)
  rendreVisible()
}

// Fermeture sans choix : le champ reprend le produit choisi
function fermer() {
  annulerFermeture()
  ouvert.value = false
  filtrer.value = false
  actif.value = -1
  texte.value = choisi.value ? libelle(choisi.value) : ''
}

function choisir(p: ProduitChoix) {
  annulerFermeture()
  modele.value = p._id
  texte.value = libelle(p)
  ouvert.value = false
  filtrer.value = false
  actif.value = -1
}

function saisir() {
  annulerFermeture()
  filtrer.value = true
  ouvert.value = true
  actif.value = resultats.value.length ? 0 : -1
}

function clavier(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!ouvert.value) return ouvrir()
    if (!resultats.value.length) return
    const dernier = resultats.value.length - 1
    actif.value = e.key === 'ArrowDown' ? Math.min(actif.value + 1, dernier) : Math.max(actif.value - 1, 0)
    rendreVisible()
  } else if (e.key === 'Enter') {
    if (!ouvert.value) return // Entrée, liste fermée : comportement normal du formulaire
    e.preventDefault()
    const p = resultats.value[actif.value]
    if (p) choisir(p)
  } else if (e.key === 'Escape') {
    if (ouvert.value) {
      e.preventDefault()
      fermer()
    }
  } else if (e.key === 'Tab') {
    if (ouvert.value) fermer()
  }
}

// Toucher ou clic : ouvre la liste complète et sélectionne le texte, que la frappe remplace
function basculer(e: MouseEvent) {
  if (ouvert.value) return fermer()
  ouvrir()
  ;(e.target as HTMLInputElement).select()
}

function quitter() {
  annulerFermeture()
  minuterie = setTimeout(fermer, 150)
}
</script>

<template>
  <div class="relative">
    <input
      :id="idChamp"
      v-model="texte"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      :aria-expanded="ouvert"
      :aria-controls="idListe"
      :aria-activedescendant="ouvert && actif >= 0 ? idOption(actif) : undefined"
      :aria-invalid="invalide || undefined"
      :required="requis"
      placeholder="Référence ou nom du produit…"
      :class="[invalide ? 'border-red-600' : 'border-creme2', 'w-full pl-3 pr-8 py-2 bg-white border rounded-lg text-noir focus:outline-none focus:border-foret']"
      @input="saisir"
      @keydown="clavier"
      @click="basculer"
      @blur="quitter"
    />
    <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris" aria-hidden="true" />

    <!-- mousedown.prevent : un clic dans la liste (option ou barre de défilement) laisse le focus dans le champ -->
    <div v-show="ouvert" class="absolute z-30 left-0 right-0 mt-1 bg-white border border-creme2 rounded-xl shadow-lg overflow-hidden" @mousedown.prevent>
      <ul :id="idListe" role="listbox" aria-label="Produits du catalogue" class="max-h-64 overflow-y-auto py-1">
        <li
          v-for="(p, i) in resultats"
          :id="idOption(i)"
          :key="p._id"
          role="option"
          :aria-selected="p._id === modele"
          :class="[i === actif ? 'bg-creme2' : '', 'flex items-center gap-2 px-3 py-2 cursor-pointer']"
          @mousemove="actif = i"
          @click="choisir(p)"
        >
          <span class="shrink-0 w-9 py-0.5 rounded bg-creme text-center text-[10px] font-bold text-noir" :title="familleDe(p.type)?.libelle">{{ familleDe(p.type)?.code ?? '?' }}</span>
          <span class="min-w-0 flex-1 text-noir break-words">{{ libelle(p) }}</span>
          <Check v-if="p._id === modele" class="shrink-0 w-3.5 h-3.5 text-foret" aria-hidden="true" />
        </li>
      </ul>
      <p v-if="trouves.length > MAX_AFFICHES" class="px-3 py-2 border-t border-creme2 text-[11px] text-gris">
        {{ trouves.length - MAX_AFFICHES }} autre(s) produit(s) : précisez la recherche.
      </p>
      <p v-if="!resultats.length" class="px-3 py-2 text-gris" role="status">
        {{ produits.length ? `Aucun produit ne correspond à « ${texte.trim()} ».` : 'Catalogue des produits en cours de chargement…' }}
      </p>
    </div>
  </div>
</template>
