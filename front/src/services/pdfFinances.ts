import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LigneBudget, SyntheseFinances } from '@/type'

// Synthèse PDF pour l'audit Next Impact : exécution du budget par ligne et résultat d'exploitation

const COULEUR_FORET: [number, number, number] = [26, 92, 56] // #1A5C38
const fcfa = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
const usd = (n: number) => n.toFixed(2).replace('.', ',') + ' USD'
const dateFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR')

export function genererSynthesePDF(lignes: LigneBudget[], synthese: SyntheseFinances) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COULEUR_FORET)
  doc.text('Ahitché', 14, 18)
  doc.setFontSize(13)
  doc.setTextColor(26, 26, 26)
  doc.text('SYNTHÈSE FINANCIÈRE', 196, 18, { align: 'right' })
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Éditée le ${new Date().toLocaleDateString('fr-FR')} · Taux en vigueur : 1 USD = ${synthese.taux} FCFA`, 196, 24, { align: 'right' })
  doc.setDrawColor(230, 230, 230)
  doc.line(14, 28, 196, 28)

  // 1. Budget de la convention
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(26, 26, 26)
  doc.text('1. Budget Next Impact : exécution par ligne', 14, 36)
  autoTable(doc, {
    startY: 39,
    head: [['Ligne', 'Libellé', 'Prévu', 'Engagé', 'Justifié', 'Reste']],
    body: lignes.map(l => [l.code, l.libelle, `${fcfa(l.montantPrevuFcfa)}\n${usd(l.montantPrevuUsd)}`, `${fcfa(l.engageFcfa)}\n${String(l.tauxExecution).replace('.', ',')} %`, `${fcfa(l.justifieFcfa)}\n${usd(l.justifieUsd)}`, l.depassementFcfa ? `Dépassement\n${fcfa(l.depassementFcfa)}` : fcfa(l.resteFcfa)]),
    foot: [['', 'Total', `${fcfa(synthese.budget.prevuFcfa)}\n${usd(synthese.budget.prevuUsd)}`, `${fcfa(synthese.budget.engageFcfa)}\n${String(synthese.budget.absorption).replace('.', ',')} %`, `${fcfa(synthese.budget.justifieFcfa)}\n${usd(synthese.budget.justifieUsd)}`, fcfa(synthese.budget.soldeFcfa)]],
    headStyles: { fillColor: COULEUR_FORET },
    footStyles: { fillColor: [240, 235, 225], textColor: [26, 26, 26] },
    styles: { fontSize: 8, valign: 'top' },
  })
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text("Engagé : dépenses payées et prévues. Justifié : dépenses payées dont toutes les pièces exigées sont jointes.", 14, (doc as any).lastAutoTable.finalY + 5)

  // 2. Exploitation sur la période
  const e = synthese.exploitation
  const y = (doc as any).lastAutoTable.finalY + 14
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(26, 26, 26)
  doc.text(`2. Exploitation du ${dateFr(synthese.periode.du)} au ${dateFr(synthese.periode.au)}`, 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['Poste', 'Montant']],
    body: [
      [`Encaissements (${e.encaissements.nombreLivraisons} livraison(s))`, fcfa(e.encaissements.total)],
      ...e.encaissements.parMode.map(m => [`   dont ${m.mode} (${m.nombre})`, fcfa(m.total)]),
      ['Achats de stock (payés + à payer)', `- ${fcfa(e.depenses['Achat stock'].paye + e.depenses['Achat stock'].aPayer)}`],
      ['Courses des livreurs', `- ${fcfa(e.coutLivraison)}`],
      ['Autres dépenses (livraison, compensations, divers)', `- ${fcfa(['Livraison', 'Compensation', 'Autre'].reduce((s, t) => s + e.depenses[t as 'Autre'].paye + e.depenses[t as 'Autre'].aPayer, 0))}`],
    ],
    foot: [['Marge de la période', fcfa(e.marge)]],
    headStyles: { fillColor: COULEUR_FORET },
    footStyles: { fillColor: [240, 235, 225], textColor: [26, 26, 26] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
  })

  doc.save(`synthese-financiere-${synthese.periode.du}-${synthese.periode.au}.pdf`)
}
