import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { finDernierTableau } from './pdfTableau'
import type { CommandeTerrain } from '@/type'
import { estAchatLibre } from '@/config/vip'

// Documents de la section Logistique : fiche de préparation du jour et feuille de tournée d'un livreur.
// Achat libre VIP : repéré comme tel, avec ses demandes libres (hors stock, à acheter à part), jamais leur prix.

const COULEUR_FORET: [number, number, number] = [26, 92, 56] // #1A5C38
const COULEUR_GRIS: [number, number, number] = [120, 120, 120]

// Séparateur de milliers en espace simple (les espaces insécables posent problème à jsPDF)
const formatPrixPDF = (valeur: number) => valeur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
const formatQuantite = (valeur: number) => Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(2).replace('.', ',')
const dateLisible = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const lieu = (c: CommandeTerrain) => [c.client.quartier, c.zone ? c.zone.nom : 'Hors zone'].filter(Boolean).join(' · ')
const texteDemande = (d: { designation: string; quantite: string }) => `${d.designation}${d.quantite ? ` (${d.quantite})` : ''}`

function entete(doc: jsPDF, titre: string, sousTitre: string) {
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COULEUR_FORET)
  doc.text('Ahitché', 14, 18)
  doc.setFontSize(13)
  doc.setTextColor(26, 26, 26)
  doc.text(titre, 196, 18, { align: 'right' })
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COULEUR_GRIS)
  doc.text(sousTitre, 196, 24, { align: 'right' })
  doc.setDrawColor(230, 230, 230)
  doc.line(14, 28, 196, 28)
}

/** Fiche de préparation : total des produits à sortir du stock, puis détail par commande */
export function genererPreparationPDF(jour: string, commandes: CommandeTerrain[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  entete(doc, 'FICHE DE PRÉPARATION', dateLisible(jour))

  const totaux = new Map<string, { quantite: number; unite: string }>()
  for (const c of commandes) {
    for (const p of c.produits) {
      const cle = `${p.nom}|${p.unite}`
      totaux.set(cle, { quantite: (totaux.get(cle)?.quantite || 0) + p.quantite, unite: p.unite })
    }
  }

  autoTable(doc, {
    startY: 34,
    head: [['Produit', 'Quantité totale', 'Unité']],
    body: [...totaux.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([cle, t]) => [cle.split('|')[0] ?? cle, formatQuantite(t.quantite), t.unite]),
    headStyles: { fillColor: COULEUR_FORET },
    styles: { fontSize: 9 },
  })

  // Achats libres VIP : demandes hors catalogue, à acheter à part (elles ne sortent pas du stock)
  const demandes = commandes.flatMap(c => (c.demandesLibres ?? []).map(d => [c.reference, c.client.nom, d.designation, d.quantite || '-']))
  if (demandes.length) {
    autoTable(doc, {
      startY: (finDernierTableau(doc) ?? 0) + 8,
      head: [['Réf.', 'Client', 'Demande libre (hors stock)', 'Quantité']],
      body: demandes,
      headStyles: { fillColor: COULEUR_FORET },
      styles: { fontSize: 9 },
    })
  }

  autoTable(doc, {
    startY: (finDernierTableau(doc) ?? 0) + 8,
    head: [['Réf.', 'Client', 'Formule', 'Créneau', 'Livreur', 'Produits']],
    body: commandes.map(c => [
      c.reference,
      c.client.nom,
      c.formule,
      c.creneau?.periode || '-',
      c.livreur?.nom || '-',
      [
        ...c.produits.map(p => `${p.nom} : ${formatQuantite(p.quantite)} ${p.unite}`),
        ...(c.demandesLibres ?? []).map(d => `Demande libre : ${texteDemande(d)}`),
      ].join('\n') || 'Composition à définir'
    ]),
    headStyles: { fillColor: COULEUR_FORET },
    styles: { fontSize: 8, valign: 'top' },
  })

  doc.save(`preparation-${jour}.pdf`)
}

/** Feuille de tournée d'un livreur : arrêts, contacts, montants à encaisser */
export function genererTourneePDF(jour: string, livreur: { nom: string; telephone: string }, commandes: CommandeTerrain[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  entete(doc, 'FEUILLE DE TOURNÉE', `${dateLisible(jour)} · ${livreur.nom}${livreur.telephone ? ` · ${livreur.telephone}` : ''}`)

  autoTable(doc, {
    startY: 34,
    head: [['#', 'Créneau', 'Réf.', 'Client', 'Adresse', 'À encaisser']],
    body: commandes.map((c, i) => [
      String(i + 1),
      c.creneau?.periode || '-',
      estAchatLibre(c) ? `${c.reference}\nAchat libre VIP` : c.reference,
      `${c.client.nom}\n${c.client.telephone}`,
      `${lieu(c)}\n${c.client.adresse}`,
      `${formatPrixPDF(c.total)}\n${c.modePaiement}`
    ]),
    headStyles: { fillColor: COULEUR_FORET },
    styles: { fontSize: 8, valign: 'top' },
    columnStyles: { 0: { cellWidth: 8 } },
  })

  doc.setFontSize(8)
  doc.setTextColor(...COULEUR_GRIS)
  doc.text("Appeler chaque client 30 minutes avant d'arriver. Paiement à la livraison : noter la référence Mobile Money.", 14, (finDernierTableau(doc) ?? 0) + 8)

  doc.save(`tournee-${jour}-${livreur.nom.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

/** Message WhatsApp de tournée envoyé au livreur */
export function messageTournee(jour: string, livreur: { nom: string }, commandes: CommandeTerrain[]) {
  let message = `Bonjour ${livreur.nom} 👋\nTournée Ahitché du ${dateLisible(jour)} (${commandes.length} livraison(s)) :\n`
  commandes.forEach((c, i) => {
    message += `\n${i + 1}. *${c.reference}*${estAchatLibre(c) ? ' (achat libre VIP)' : ''} (${c.creneau?.periode || '-'}) - ${c.client.nom}, ${c.client.telephone}\n`
    message += `   📍 ${lieu(c)} - ${c.client.adresse}\n`
    if (c.client.lienLocalisation) message += `   🗺️ ${c.client.lienLocalisation}\n`
    if (c.demandesLibres?.length) message += `   🛒 Demandes libres : ${c.demandesLibres.map(texteDemande).join(', ')}\n`
    message += `   💰 ${formatPrixPDF(c.total)} (${c.modePaiement})\n`
  })
  message += `\nAppelle chaque client 30 min avant d'arriver. Merci !`
  return message
}
