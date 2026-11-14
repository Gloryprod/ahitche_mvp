// Variables des textes publiés depuis l'admin ({paiement}, {livraison}, {jours_livraison}, {horaires}, {whatsapp},
// {nb_produits}) : réponses de la FAQ et résumés des actualités. Leurs valeurs suivent les infos pratiques du site
// (valeurs du code, puis celles publiées dès leur arrivée).
import { computed } from 'vue'
import { remplacerVariables, valeursVariables } from '@/services/valeursSite'
import { infosSite } from './contact'
import { PRODUITS_INCLUS } from './formules'

export const VALEURS_VARIABLES = computed(() => valeursVariables(infosSite, PRODUITS_INCLUS.length))

// Texte tel qu'affiché sur le site
export const avecVariables = (texte: string) => remplacerVariables(texte, VALEURS_VARIABLES.value)
