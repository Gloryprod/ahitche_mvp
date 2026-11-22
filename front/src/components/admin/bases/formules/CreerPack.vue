<script setup lang="ts">
// « Créer un pack » (admin seulement, contrôlé aussi par le serveur) : POST /api/admin/formulas. Le pack créé est
// aussitôt reconnu partout (quantités du catalogue, import du référentiel, simulateurs, prévision d'achats).
import { ref, computed, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { X, Plus, Loader2 } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { TYPE_PACK, identifiantDepuisNom, type Pack } from '@/services/packs'

const emit = defineEmits<{ fermer: []; cree: [pack: Pack, message: string] }>()
const queryClient = useQueryClient()

const nom = ref('')
const identifiant = ref('')
const identifiantModifie = ref(false) // Saisi à la main : on ne le propose plus à partir du nom
const cible = ref('')
const prix = ref<number | ''>('')
const cycleJours = ref<number | ''>(30)
const bientotDisponible = ref(true)
const erreur = ref('')
const enCours = ref(false)

watch(nom, (n) => {
  if (!identifiantModifie.value) identifiant.value = identifiantDepuisNom(n)
})

const identifiantValide = computed(() => TYPE_PACK.test(identifiant.value))
const cycleValide = computed(() => Number.isInteger(cycleJours.value) && (cycleJours.value as number) >= 1 && (cycleJours.value as number) <= 365)
const prixValide = computed(() => prix.value === '' || (Number.isFinite(prix.value) && prix.value >= 0))
const valide = computed(() => nom.value.trim().length >= 2 && identifiantValide.value && cible.value.trim() !== '' && prixValide.value && cycleValide.value)

async function creer() {
  if (!valide.value) return
  enCours.value = true
  erreur.value = ''
  try {
    const { data } = await api.post<{ message: string; pack: Pack }>('/api/admin/formulas', {
      type: identifiant.value,
      nom: nom.value.trim(),
      cible: cible.value.trim(),
      prix: prix.value === '' ? null : prix.value,
      cycleJours: cycleJours.value,
      bientotDisponible: bientotDisponible.value,
    })
    await queryClient.invalidateQueries({ queryKey: ['packs'] })
    emit('cree', data.pack, data.message)
  } catch (err) {
    // 400 (champ refusé), 403 ou 409 (pack existant) : message du serveur
    erreur.value = messageErreur(err, 'Création du pack impossible. Réessayez dans un instant.')
  } finally {
    enCours.value = false
  }
}

const etiquette = 'block text-[10px] font-bold uppercase text-gris'
const champ = 'mt-1 w-full px-3 py-2 bg-creme border border-creme2 rounded-lg text-sm text-noir font-normal normal-case focus:border-foret'
</script>

<template>
  <section aria-labelledby="creer-pack-titre" class="bg-white p-5 rounded-2xl border border-creme2 shadow-sm space-y-4 animate-fadeIn">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 id="creer-pack-titre" class="font-display font-bold text-lg text-noir">Créer un pack</h2>
        <p class="text-[11px] text-gris">Le pack est aussitôt reconnu dans le catalogue, l'import du référentiel et les simulateurs ; sa carte sur l'accueil se règle à part.</p>
      </div>
      <button type="button" @click="emit('fermer')" aria-label="Fermer la création du pack" class="cursor-pointer p-1.5 rounded-lg hover:bg-creme text-gris">
        <X class="w-4 h-4" />
      </button>
    </div>

    <form @submit.prevent="creer" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label :class="etiquette">Nom du pack
        <input id="pack-nom" v-model="nom" type="text" required minlength="2" maxlength="40" placeholder="AHI Étudiant" autocomplete="off" :class="champ" />
      </label>
      <div>
        <label for="pack-identifiant" :class="etiquette">Identifiant</label>
        <input
          id="pack-identifiant" v-model="identifiant" type="text" required maxlength="20" pattern="[a-z][a-z0-9]{1,19}" placeholder="etudiant"
          autocomplete="off" autocapitalize="none" spellcheck="false" @input="identifiantModifie = true"
          :aria-invalid="identifiant !== '' && !identifiantValide" aria-describedby="pack-identifiant-aide"
          :class="[champ, 'font-mono']"
        />
        <p id="pack-identifiant-aide" :class="['mt-1 text-[11px]', identifiant !== '' && !identifiantValide ? 'text-red-700 font-semibold' : 'text-gris']">
          Minuscules et chiffres, sans accent ni espace, 2 à 20 caractères. Il sert de colonne <span class="font-mono">quantite_{{ identifiant || '…' }}</span> dans l'import.
        </p>
      </div>
      <label :class="[etiquette, 'sm:col-span-2']">Cible
        <input id="pack-cible" v-model="cible" type="text" required maxlength="80" placeholder="1 étudiant · par mois" autocomplete="off" :class="champ" />
      </label>
      <label :class="etiquette">Prix (FCFA)
        <input id="pack-prix" v-model.number="prix" type="number" min="0" step="1" inputmode="numeric" placeholder="à définir" :class="[champ, 'font-mono']" />
      </label>
      <div>
        <label for="pack-cycle" :class="etiquette">Cycle de relance (jours)</label>
        <input
          id="pack-cycle" v-model.number="cycleJours" type="number" min="1" max="365" step="1" inputmode="numeric" required
          :aria-invalid="!cycleValide" :aria-describedby="cycleValide ? undefined : 'pack-cycle-erreur'" :class="[champ, 'font-mono']"
        />
        <p v-if="!cycleValide" id="pack-cycle-erreur" class="mt-1 text-[11px] font-semibold text-red-700">Un nombre entier de jours, entre 1 et 365.</p>
      </div>
      <label class="sm:col-span-2 flex items-start gap-2 text-xs text-noir cursor-pointer">
        <input id="pack-bientot" v-model="bientotDisponible" type="checkbox" class="mt-0.5 w-4 h-4 accent-foret" />
        <span><strong>Bientôt disponible</strong> <span class="text-gris">: visible, mais pas commandable tant que la case est cochée.</span></span>
      </label>

      <p v-if="erreur" role="alert" class="sm:col-span-2 p-3 rounded-xl border bg-red-50 text-red-700 border-red-200 text-xs font-semibold">{{ erreur }}</p>

      <button
        type="submit" :disabled="enCours"
        class="sm:col-span-2 cursor-pointer inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-foret text-white text-xs font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foret"
      >
        <Loader2 v-if="enCours" class="w-3.5 h-3.5 animate-spin" />
        <Plus v-else class="w-3.5 h-3.5" />
        {{ enCours ? 'Création…' : 'Créer le pack' }}
      </button>
    </form>
  </section>
</template>
