import { afterEach, describe, expect, it } from 'vitest'
import { HORAIRES, INFOS_PAR_DEFAUT, JOURS_LIVRAISON, LIVRAISON_ANNONCE, PAIEMENT_ANNONCE, RESEAUX_SOCIAUX, appliquerInfos } from '../contact'
import { PRODUITS_INCLUS } from '../formules'
import { FAQ, FAQ_PAR_DEFAUT, appliquerFaq } from '../faq'
import { ACTUALITES, appliquerActualites, cartesDuCode } from '../actualites'
import { donneesFaq } from '@/services/referencement'
import {
  accoladeInconnue, fusionnerActualites, fusionnerFaq, lienActualiteValide, lienFaqValide, nouvelId, remplacerVariables, valeursVariables,
  type CarteActualite, type QuestionFaq, type ValeursVariables,
} from '@/services/valeursSite'
import {
  champDeLErreur, controlerActualites, controlerFaq, ecartsActualites, ecartsFaq, faqAEnvoyer, faqEnFormulaire,
} from '@/components/admin/site/champsSite'

const valeurs = (autre: Partial<ValeursVariables> = {}): ValeursVariables => ({
  paiement: 'MTN MoMo', livraison: 'Livraison à jour fixe', jours_livraison: '', horaires: 'Lundi, 9h00 – 18h00', whatsapp: '+229 98 13 66 35', nb_produits: '17', ...autre,
})

afterEach(() => {
  appliquerInfos(INFOS_PAR_DEFAUT)
  appliquerFaq(null)
  appliquerActualites(null)
})

describe('variables dans les textes', () => {
  it('remplace chaque variable connue', () => {
    expect(remplacerVariables('Par {paiement}, {nb_produits} produits, {whatsapp}, {horaires}.', valeurs()))
      .toBe('Par MTN MoMo, 17 produits, +229 98 13 66 35, Lundi, 9h00 – 18h00.')
  })
  it('retire une variable vide avec sa virgule, sans laisser de double espace', () => {
    expect(remplacerVariables('À jour fixe, {jours_livraison} : confirmé.', valeurs())).toBe('À jour fixe : confirmé.')
    expect(remplacerVariables('Livré {jours_livraison} chez vous.', valeurs())).toBe('Livré chez vous.')
    expect(remplacerVariables('À jour fixe, {jours_livraison} : confirmé.', valeurs({ jours_livraison: 'le mardi' }))).toBe('À jour fixe, le mardi : confirmé.')
  })
  it('{livraison} : majuscule en début de texte ou de phrase, minuscule ailleurs', () => {
    expect(remplacerVariables('{livraison} : confirmée.', valeurs())).toBe('Livraison à jour fixe : confirmée.')
    expect(remplacerVariables('Bonjour. {livraison}.', valeurs())).toBe('Bonjour. Livraison à jour fixe.')
    expect(remplacerVariables('17 produits, {livraison} et paiement.', valeurs())).toBe('17 produits, livraison à jour fixe et paiement.')
    expect(remplacerVariables('Notre service : {livraison}.', valeurs())).toBe('Notre service : livraison à jour fixe.')
  })
  it('laisse telle quelle une variable inconnue, et la signale comme le serveur', () => {
    expect(remplacerVariables('Prix : {prix}.', valeurs())).toBe('Prix : {prix}.')
    expect(accoladeInconnue('Prix : {prix}.')).toBe('{prix}')
    expect(accoladeInconnue('Accolade { seule')).toBe('{')
    expect(accoladeInconnue('Par {paiement} et {horaires}')).toBeNull()
    expect(accoladeInconnue('{Paiement}')).toBe('{Paiement}')
  })
})

// Textes d'avant les variables (versions écrites en dur dans config/faq.ts et config/actualites.ts)
function ancienneFaq() {
  const jours = JOURS_LIVRAISON.value
  return [
    'Choisissez votre formule et touchez « Commander » : WhatsApp s\'ouvre avec un message prêt à envoyer. Nous confirmons avec vous la formule, l\'adresse et le créneau de livraison.',
    `Vous payez à la livraison, une fois vos vivres reçus, par ${PAIEMENT_ANNONCE.value}. Rien n'est à régler à l'avance.`,
    'À Cotonou et à Abomey-Calavi, dans 22 zones de livraison couvrant leurs arrondissements. Indiquez votre quartier à la commande : nous confirmons la zone avec vous.',
    `Nous livrons à jour fixe${jours ? `, ${jours}` : ''} : le jour et le créneau vous sont confirmés à la commande. Le livreur vous appelle avant d'arriver. Nous répondons sur WhatsApp : ${HORAIRES.value}.`,
    `Les ${PRODUITS_INCLUS.length} produits de base (riz local, gari, haricots, huile, tomates, oignons…), en quantités adaptées à la formule et à la taille de votre foyer. Le contenu exact peut varier selon les saisons. La formule Essentiel ne contient pas d'huile de palme.`,
    'C\'est la garantie Ahitché : tout produit manquant ou abîmé est remplacé à l\'identique à la livraison suivante.',
    'Avant la fin de votre pack, nous vous recontactons sur WhatsApp pour le renouveler si vous le souhaitez. Vous pouvez aussi ajouter des compléments de la semaine à votre commande.',
    'Nous n\'utilisons vos coordonnées (nom, téléphone, adresse) que pour préparer et livrer vos commandes et assurer votre suivi. Elles ne sont ni vendues ni cédées.',
  ]
}
const ancienResume = () => `Trois formules, ${PRODUITS_INCLUS.length} produits de base, ${LIVRAISON_ANNONCE.value.toLowerCase()} et paiement à la livraison : le ravitaillement de votre foyer, sans passer vos samedis au marché.`

describe('textes par défaut : rendu identique à celui d’avant les variables', () => {
  const cas: [string, object][] = [
    ['valeurs du code', {}],
    ['jours de livraison publiés', { joursLivraison: 'le mardi et le samedi' }],
    ['paiement et horaires publiés', { paiement: 'Mobile Money', horaires: { jours: ['samedi'], ouverture: '08:30', fermeture: '12:00' } }],
  ]
  it.each(cas)('FAQ : %s', (_nom, infos) => {
    appliquerInfos({ ...INFOS_PAR_DEFAUT, ...infos })
    expect(FAQ.value.map(q => q.reponse)).toEqual(ancienneFaq())
    expect(FAQ.value.map(q => q.question)).toEqual([
      'Comment passer commande ?', 'Quand et comment je paie ?', 'Où livrez-vous ?', 'Quand suis-je livré ?', 'Que contient un pack ?',
      'Et si un produit manque ou arrive abîmé ?', 'Comment se passe le renouvellement ?', 'Que faites-vous de mes données ?',
    ])
    expect(FAQ.value[7]!.lien).toEqual({ texte: 'Mentions légales et données personnelles', vers: '/mentions-legales' })
    expect(FAQ.value.filter(q => q.lien)).toHaveLength(1)
  })
  it('« Quand suis-je livré ? » se lit bien avec et sans jours publiés', () => {
    expect(FAQ.value[3]!.reponse.startsWith('Nous livrons à jour fixe : le jour')).toBe(true)
    appliquerInfos({ ...INFOS_PAR_DEFAUT, joursLivraison: 'le mardi et le samedi' })
    expect(FAQ.value[3]!.reponse.startsWith('Nous livrons à jour fixe, le mardi et le samedi : le jour')).toBe(true)
  })
  it.each(cas)('actualités : %s', (_nom, infos) => {
    appliquerInfos({ ...INFOS_PAR_DEFAUT, ...infos })
    expect(ACTUALITES.value.map(a => a.titre)).toEqual(['Ahitché livre à Cotonou et Abomey-Calavi', 'Un projet accompagné par Sèmè City', 'Suivez-nous sur Facebook et TikTok'])
    expect(ACTUALITES.value[0]!.resume).toBe(ancienResume())
    expect(ACTUALITES.value[0]!.lien).toEqual({ texte: 'Découvrir les formules', vers: '#formules', externe: false })
    expect(ACTUALITES.value[2]!.lien).toEqual({ texte: 'Voir la page Facebook', vers: RESEAUX_SOCIAUX.value[0]!.url, externe: true })
  })
  it('la carte « Suivez-nous » suit les réseaux tant que rien n’est publié', () => {
    appliquerInfos({ ...INFOS_PAR_DEFAUT, facebook: '' })
    expect(ACTUALITES.value[2]!.titre).toBe('Suivez-nous sur TikTok')
    appliquerInfos({ ...INFOS_PAR_DEFAUT, facebook: '', tiktok: '' })
    expect(ACTUALITES.value).toHaveLength(2)
  })
  it('les textes par défaut respectent les règles du serveur', () => {
    const faq = FAQ_PAR_DEFAUT.map(q => ({ ...q }))
    expect(controlerFaq(faq)).toBeNull()
    expect(controlerActualites(cartesDuCode(RESEAUX_SOCIAUX.value))).toBeNull()
  })
})

const q = (id: string, autre: Partial<QuestionFaq> = {}): QuestionFaq => ({ id, question: `Question ${id} ?`, reponse: 'Une réponse assez longue.', visible: true, lien: null, ...autre })
const carte = (id: string, autre: Partial<CarteActualite> = {}): CarteActualite => ({ id, categorie: 'Lancement', icone: 'lancement', titre: `Titre ${id}`, resume: 'Un résumé assez long.', lien: null, ...autre })

describe('fusion des valeurs publiées', () => {
  it('FAQ : suit les questions publiées, sans les masquées, et les données structurées aussi', () => {
    appliquerFaq([q('a'), q('b', { visible: false }), q('c', { reponse: 'Paiement par {paiement}.' })])
    expect(FAQ.value.map(x => x.id)).toEqual(['a', 'c'])
    expect(FAQ.value[1]!.reponse).toBe(`Paiement par ${INFOS_PAR_DEFAUT.paiement}.`)
    const donnees = donneesFaq()
    expect(donnees.mainEntity).toHaveLength(2)
    expect(donnees.mainEntity[1]!.acceptedAnswer.text).toBe(`Paiement par ${INFOS_PAR_DEFAUT.paiement}.`)
  })
  it('FAQ : le site public ne reçoit pas « visible » : un champ absent vaut affiché', () => {
    expect(fusionnerFaq(FAQ_PAR_DEFAUT, [{ id: 'a', question: 'Une question ?', reponse: 'Une réponse assez longue.' }])[0]).toMatchObject({ id: 'a', visible: true, lien: null })
  })
  it('FAQ : ignore les questions mal formées ; aucune lisible, celles du code restent', () => {
    const liste = fusionnerFaq(FAQ_PAR_DEFAUT, [q('a'), q('a'), q('B'), { id: 'd', question: 'x', reponse: 'y' }, q('e', { reponse: 'Avec <b>balise</b> dedans.' }), 42])
    expect(liste.map(x => x.id)).toEqual(['a'])
    expect(fusionnerFaq(FAQ_PAR_DEFAUT, [q('a', { visible: false })])).toHaveLength(FAQ_PAR_DEFAUT.length)
    expect(fusionnerFaq(FAQ_PAR_DEFAUT, 'nope')).toHaveLength(FAQ_PAR_DEFAUT.length)
  })
  it('FAQ : retire un lien non sûr, garde une page ou une ancre', () => {
    const lien = (vers: string) => fusionnerFaq(FAQ_PAR_DEFAUT, [q('a', { lien: { texte: 'Voir', vers } })])[0]!.lien
    expect(lien('/blog')).toEqual({ texte: 'Voir', vers: '/blog' })
    expect(lien('#formules')).toEqual({ texte: 'Voir', vers: '#formules' })
    expect(lien('//ailleurs.com')).toBeNull()
    expect(lien('javascript:alert(1)')).toBeNull()
    expect(lien('https://www.facebook.com/Ahitche')).toBeNull()
  })
  it('actualités : cartes publiées, liste vide : section masquée, null : celles du code', () => {
    appliquerActualites([carte('a', { lien: { texte: 'Voir', vers: 'https://www.facebook.com/Ahitche' } })])
    expect(ACTUALITES.value).toHaveLength(1)
    expect(ACTUALITES.value[0]!.lien?.externe).toBe(true)
    appliquerActualites([])
    expect(ACTUALITES.value).toEqual([])
    appliquerActualites(null)
    expect(ACTUALITES.value).toHaveLength(3)
  })
  it('actualités : quatre cartes reçues, trois gardées ; une icône inconnue est ignorée', () => {
    expect(fusionnerActualites([], [carte('a'), carte('b'), carte('c'), carte('d')])).toHaveLength(3)
    expect(fusionnerActualites([], [{ ...carte('a'), icone: 'autre' }, carte('b')]).map(c => c.id)).toEqual(['b'])
  })
})

describe('liens', () => {
  it('FAQ : chemin interne ou ancre', () => {
    for (const v of ['/mentions-legales', '#formules', '/blog/article-1']) expect([v, lienFaqValide(v)]).toEqual([v, true])
    for (const v of ['//evil.bj', '/\\evil.bj', '/a b', '#a b', 'blog', 'https://wa.me/229', '#']) expect([v, lienFaqValide(v)]).toEqual([v, false])
  })
  it('actualités : mêmes domaines et chemins que le serveur', () => {
    for (const v of ['/blog', '#formules', 'https://www.facebook.com/Ahitche', 'https://m.facebook.com/x', 'https://www.tiktok.com/@ahitche', 'https://wa.me/22998136635']) {
      expect([v, lienActualiteValide(v)]).toEqual([v, true])
    }
    for (const v of [
      'https://facebook.com/', 'https://tiktok.com/ahitche', 'https://facebook.com.evil.bj/x', 'https://wa.me:444/229', 'https://x@wa.me/229',
      'http://wa.me/229', 'https://exemple.com/x', 'javascript:alert(1)', '//wa.me/229',
    ]) expect([v, lienActualiteValide(v)]).toEqual([v, false])
  })
})

describe('contrôles avant l’envoi : messages du serveur', () => {
  it('FAQ : nomme la question et le champ', () => {
    expect(controlerFaq([q('a'), q('b', { reponse: 'Court' })])).toEqual({ champ: 'faq.b.reponse', message: 'Question 2 : réponse : 10 caractères au moins.' })
    expect(controlerFaq([q('a', { question: 'Abc' })])?.message).toBe('Question 1 : question : 5 caractères au moins.')
    expect(controlerFaq([q('a', { reponse: 'x'.repeat(701) })])?.message).toBe('Question 1 : réponse : 700 caractères au plus.')
    expect(controlerFaq([q('a', { reponse: 'Avec < et > dedans.' })])?.message).toBe('Question 1 : réponse : les caractères < et > ne sont pas acceptés.')
  })
  it('FAQ : variables et accolades', () => {
    expect(controlerFaq([q('a', { reponse: 'Le prix est {prix}, voilà.' })])?.message).toContain('Question 1 : réponse : variable inconnue : {prix}. Variables possibles : {paiement},')
    expect(controlerFaq([q('a', { reponse: 'Une accolade { seule ici.' })])?.message).toBe('Question 1 : réponse : accolade seule ; une variable s\'écrit entre accolades, par exemple {paiement}.')
    expect(controlerFaq([q('a', { question: 'Payer par {paiement} ?' })])?.message).toBe('Question 1 : question : les accolades ne sont acceptées que dans les réponses et les résumés, pour les variables.')
  })
  it('FAQ : au moins une question affichée, 15 au plus, lien complet', () => {
    expect(controlerFaq([])?.message).toBe('Questions fréquentes : ajoutez au moins une question.')
    expect(controlerFaq([q('a', { visible: false })])).toEqual({ champ: '', message: 'Questions fréquentes : au moins une question doit être affichée sur le site.' })
    expect(controlerFaq(Array.from({ length: 16 }, (_, i) => q(`q${i}`)))?.message).toBe('Questions fréquentes : 15 questions au plus.')
    expect(controlerFaq([q('a', { lien: { texte: '', vers: '/blog' } })])).toEqual({ champ: 'faq.a.lien.texte', message: 'Question 1 : texte du lien : obligatoire.' })
    expect(controlerFaq([q('a', { lien: { texte: 'Voir', vers: '' } })])).toEqual({ champ: 'faq.a.lien.vers', message: 'Question 1 : adresse du lien : obligatoire.' })
    expect(controlerFaq([q('a', { lien: { texte: 'Voir', vers: 'https://wa.me/229' } })])?.champ).toBe('faq.a.lien.vers')
  })
  it('deux champs de lien vides à l’envoi : pas de lien', () => {
    const formulaire = faqEnFormulaire([q('a')])
    expect(formulaire[0]!.lien).toEqual({ texte: '', vers: '' })
    expect(faqAEnvoyer(formulaire)[0]!.lien).toBeNull()
  })
  it('actualités : zéro carte acceptée, nomme la carte', () => {
    expect(controlerActualites([])).toBeNull()
    expect(controlerActualites([carte('a'), carte('b'), carte('c'), carte('d')])?.message).toBe('Actualités : 3 cartes au plus.')
    expect(controlerActualites([carte('a', { categorie: 'X' })])).toEqual({ champ: 'actualites.a.categorie', message: 'Carte 1 : catégorie : 2 caractères au moins.' })
    expect(controlerActualites([carte('a'), carte('b', { resume: 'Résumé avec {prix} dedans.' })])?.champ).toBe('actualites.b.resume')
    expect(controlerActualites([carte('a', { icone: 'autre' as CarteActualite['icone'] })])?.champ).toBe('actualites.a.icone')
    expect(controlerActualites([carte('a', { lien: { texte: 'Voir', vers: 'https://exemple.com/x' } })])?.champ).toBe('actualites.a.lien.vers')
  })
  it('identifiants invalides ou en double refusés ; nouvel identifiant unique', () => {
    expect(controlerFaq([q('a'), q('a')])?.message).toContain('Question 2 : identifiant')
    expect(controlerFaq([q('A')])?.message).toContain('Question 1 : identifiant')
    expect(nouvelId('question', [], 1000)).toBe('question-rs')
    expect(nouvelId('question', ['question-rs'], 1000)).toBe('question-rs-2')
    expect(nouvelId('actualite', [], Date.now())).toMatch(/^[a-z0-9-]{1,40}$/)
  })
  it('une erreur du serveur désigne le bon champ de la bonne question', () => {
    const ids = ['a', 'b', 'c']
    expect(champDeLErreur('faq', 'Question 3 : réponse : 700 caractères au plus.', ids)).toBe('faq.c.reponse')
    expect(champDeLErreur('faq', 'Question 2 : texte du lien : obligatoire.', ids)).toBe('faq.b.lien.texte')
    expect(champDeLErreur('faq', 'Question 1 : adresse du lien : chemin du site invalide.', ids)).toBe('faq.a.lien.vers')
    expect(champDeLErreur('faq', 'Question 2 : « Afficher sur le site », oui ou non.', ids)).toBe('faq.b.question')
    expect(champDeLErreur('faq', 'Questions fréquentes : 15 questions au plus.', ids)).toBe('')
    expect(champDeLErreur('actualites', 'Carte 2 : icône, « lancement », « partenaire » ou « communaute ».', ids)).toBe('actualites.b.icone')
    expect(champDeLErreur('actualites', 'Carte 9 : titre : 90 caractères au plus.', ids)).toBe('')
  })
})

describe('ce qui change', () => {
  it('liste ajout, suppression, champ modifié, question masquée et ordre', () => {
    const avant = [q('a'), q('b'), q('c')]
    const apres = [q('c'), q('a', { reponse: 'Nouvelle réponse longue.' }), q('n', { question: 'Nouvelle question ?' })]
    apres[0]!.visible = false
    const libelles = ecartsFaq(avant, apres).map(c => c.libelle)
    expect(libelles).toEqual(['Question 1 : affichée sur le site', 'Question 2 : réponse', 'Question 3 ajoutée', 'Question supprimée', 'Ordre'])
  })
  it('rien ne change si la liste est identique', () => {
    expect(ecartsFaq([q('a')], [q('a')])).toEqual([])
    expect(ecartsActualites([carte('a')], [carte('a')])).toEqual([])
  })
  it('carte : champ modifié', () => {
    expect(ecartsActualites([carte('a')], [carte('a', { icone: 'partenaire' })])[0]).toMatchObject({ libelle: 'Carte 1 : icône', apres: 'Partenaire (bâtiment)' })
  })
  it('valeurs des variables d’après les infos publiées', () => {
    expect(valeursVariables({ ...INFOS_PAR_DEFAUT, joursLivraison: 'le mardi' }, 17)).toMatchObject({ livraison: 'Livraison le mardi', jours_livraison: 'le mardi', nb_produits: '17', whatsapp: '+229 98 13 66 35' })
  })
})
