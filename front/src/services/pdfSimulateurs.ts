import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Export PDF des simulations (pas d'enregistrement des scénarios en v1 : le PDF en garde la trace)

const COULEUR_FORET: [number, number, number] = [26, 92, 56] // #1A5C38

export interface SectionPDF {
  titre: string
  entetes: string[]
  lignes: (string | number)[][]
  pied?: (string | number)[]
}

// Montants en espace simple (les espaces insécables du format français posent problème à jsPDF)
export const fcfaPDF = (n: number | null) => n === null ? 'à renseigner' : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'

export function genererSimulationPDF(titre: string, hypotheses: string[], sections: SectionPDF[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COULEUR_FORET)
  doc.text('Ahitché', 14, 18)
  doc.setFontSize(12)
  doc.setTextColor(26, 26, 26)
  doc.text(titre.toUpperCase(), 196, 18, { align: 'right' })
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Simulation du ${new Date().toLocaleDateString('fr-FR')} : document indicatif, aucun prix n'a été modifié`, 196, 24, { align: 'right' })
  doc.setDrawColor(230, 230, 230)
  doc.line(14, 28, 196, 28)

  let y = 35
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  for (const h of hypotheses) { doc.text(`• ${h}`, 14, y); y += 5 }

  for (const s of sections) {
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(26, 26, 26)
    doc.text(s.titre, 14, y + 4)
    autoTable(doc, {
      startY: y + 7,
      head: [s.entetes],
      body: s.lignes.map(l => l.map(String)),
      foot: s.pied ? [s.pied.map(String)] : undefined,
      headStyles: { fillColor: COULEUR_FORET },
      footStyles: { fillColor: [240, 235, 225], textColor: [26, 26, 26] },
      styles: { fontSize: 8 },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  const nomFichier = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  doc.save(`simulation-${nomFichier}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
