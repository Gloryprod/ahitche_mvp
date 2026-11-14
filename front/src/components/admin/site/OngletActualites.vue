<script setup lang="ts">
import CarteActualite from '@/components/sections/CarteActualite.vue'
import IconeActualite from '@/components/sections/IconeActualite.vue'
import { carteAffichee, type Actualite } from '@/config/actualites'
import {
  ICONES_ACTUALITE, REGLES_ACTUALITE, lienActualiteValide, nouvelId, remplacerVariables, type ValeursVariables,
} from '@/services/valeursSite'
import ChampAvecVariables from './ChampAvecVariables.vue'
import ChampsLien from './ChampsLien.vue'
import ListeElementsSite from './ListeElementsSite.vue'
import { AIDE_LIEN_ACTUALITE, CLASSES_FORMULAIRE, NOMS_ICONES, actualitesAEnvoyer, idChamp, idElement, type CarteFormulaire } from './champsSite'

// Onglet « Actualités » de l'écran « Site public » (docs-internes/admin/CONTRAT-site-public-C.md) : trois cartes au
// plus, chacune avec l'aperçu de la vraie carte de l'accueil. Aucune carte : la section n'apparaît plus sur l'accueil.
// Publication, confirmation et historique : SitePublic.vue.
const cartes = defineModel<CarteFormulaire[]>('cartes', { required: true })
const props = defineProps<{
  erreur: { champ: string; message: string }
  lectureSeule: boolean
  valeurs: ValeursVariables // Valeurs des variables d'après les infos publiées
}>()

const erreurDe = (id: string, champ: string) => (props.erreur.champ === idElement('actualites', id, champ) ? props.erreur.message : '')
const creer = (ids: string[]): CarteFormulaire => ({ id: nouvelId('actualite', ids), categorie: '', icone: 'lancement', titre: '', resume: '', lien: { texte: '', vers: '' } })

// Aperçu d'une carte : textes nettoyés comme à l'envoi, variables remplacées ; un lien n'apparaît que s'il est valide
function apercu(c: CarteFormulaire): Actualite {
  const e = actualitesAEnvoyer([c])[0]!
  return carteAffichee({
    ...e,
    categorie: e.categorie || 'Catégorie',
    titre: e.titre || 'Titre de la carte',
    resume: e.resume || 'Le résumé apparaîtra ici.',
    lien: e.lien && e.lien.texte && lienActualiteValide(e.lien.vers) ? e.lien : null,
  }, t => remplacerVariables(t, props.valeurs))
}

const CHAMPS_COURTS = [
  { nom: 'categorie', libelle: 'Catégorie', regle: REGLES_ACTUALITE.categorie },
  { nom: 'titre', libelle: 'Titre', regle: REGLES_ACTUALITE.titre },
] as const
</script>

<template>
  <div class="space-y-3">
    <p v-if="!cartes.length" class="text-xs p-2.5 rounded-xl bg-creme text-noir">Aucune carte : la section « Actualités » n'apparaît plus sur l'accueil.</p>
    <ListeElementsSite
      v-model:liste="cartes"
      prefixe="actualites"
      nom="carte"
      :max="REGLES_ACTUALITE.max"
      :lecture-seule="lectureSeule"
      :champ-erreur="erreur.champ"
      :titre="c => c.titre"
      :creer="creer"
    >
      <template #panneau="{ element, index }">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div class="space-y-3 min-w-0">
            <div v-for="c in CHAMPS_COURTS" :key="c.nom">
              <label :for="idChamp(idElement('actualites', element.id, c.nom))" :class="CLASSES_FORMULAIRE.etiquette">{{ c.libelle }} *</label>
              <input :id="idChamp(idElement('actualites', element.id, c.nom))" v-model="element[c.nom]" type="text" required :maxlength="c.regle.max" autocomplete="off" :class="CLASSES_FORMULAIRE.champ" :aria-invalid="erreurDe(element.id, c.nom) ? 'true' : undefined" :aria-describedby="`${idChamp(idElement('actualites', element.id, c.nom))}-aide${erreurDe(element.id, c.nom) ? ` ${idChamp(idElement('actualites', element.id, c.nom))}-erreur` : ''}`" />
              <p :id="`${idChamp(idElement('actualites', element.id, c.nom))}-aide`" class="mt-1 text-xs text-right tabular-nums">{{ element[c.nom].length }}/{{ c.regle.max }}</p>
              <p v-if="erreurDe(element.id, c.nom)" :id="`${idChamp(idElement('actualites', element.id, c.nom))}-erreur`" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element.id, c.nom) }}</p>
            </div>

            <fieldset :id="idChamp(idElement('actualites', element.id, 'icone'))" tabindex="-1">
              <legend :class="CLASSES_FORMULAIRE.etiquette">Icône</legend>
              <div class="mt-1 grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
                <label v-for="icone in ICONES_ACTUALITE" :key="icone" class="flex items-center gap-2 min-h-11 p-2 rounded-xl border cursor-pointer text-xs text-noir font-semibold" :class="element.icone === icone ? 'border-foret bg-foret/5' : 'border-creme2'">
                  <input v-model="element.icone" type="radio" :name="`icone-${element.id}`" :value="icone" class="w-4 h-4 accent-foret shrink-0" />
                  <IconeActualite :icone="icone" class="w-5 h-5 shrink-0 text-foret" />
                  <span class="min-w-0">{{ NOMS_ICONES[icone] }}</span>
                </label>
              </div>
              <p v-if="erreurDe(element.id, 'icone')" :class="CLASSES_FORMULAIRE.erreur">{{ erreurDe(element.id, 'icone') }}</p>
            </fieldset>

            <ChampAvecVariables
              v-model="element.resume"
              :champ="idElement('actualites', element.id, 'resume')"
              libelle="Résumé"
              :max="REGLES_ACTUALITE.resume.max"
              :erreur="erreurDe(element.id, 'resume')"
              :valeurs="valeurs"
              aide="10 caractères au moins."
            />
            <ChampsLien
              v-model:texte="element.lien.texte"
              v-model:vers="element.lien.vers"
              :base="`actualites.${element.id}`"
              :max-texte="REGLES_ACTUALITE.texteLien.max"
              exemple-vers="#formules"
              :aide="`En bas de la carte : ${AIDE_LIEN_ACTUALITE}`"
              :erreur-texte="erreurDe(element.id, 'lien.texte')"
              :erreur-vers="erreurDe(element.id, 'lien.vers')"
            />
          </div>

          <!-- Aperçu : la vraie carte de l'accueil, à sa place (la couleur de l'en-tête suit le rang) -->
          <div class="min-w-0 space-y-2 max-w-[300px] mx-auto lg:mx-0 w-full">
            <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu</p>
            <CarteActualite :actualite="apercu(element)" :rang="index" apercu />
          </div>
        </div>
      </template>
    </ListeElementsSite>
  </div>
</template>
