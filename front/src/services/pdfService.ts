import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { finDernierTableau } from './pdfTableau'

interface PDFItem {
  productId?: { name: string; unit: string } | string
  name?: string
  unit?: string
  quantiteCommandee: number
  prixUnitairePrevu: number
}

interface PurchaseOrderPDFData {
  numeroBon: string
  fournisseur: string
  items: PDFItem[]
  dateEmission?: string
}

// Formatage propre des prix sans caractères spéciaux problématiques pour jsPDF
const formatPrixPDF = (valeur: number): string => {
  return valeur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA"
}

export const générerBonCommandePDF = (bon: PurchaseOrderPDFData, catalogueProduits: { _id: string; name: string; unit?: string }[] = []) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })

    // --- CONFIGURATION COULEURS CHARTE ---
    const COULEUR_FORET: [number, number, number] = [34, 76, 56]
    const COULEUR_NOIR: [number, number, number] = [26, 26, 26]
    const COULEUR_GRIS: [number, number, number] = [120, 120, 120]

    // --- EN-TÊTE ---
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(COULEUR_FORET[0], COULEUR_FORET[1], COULEUR_FORET[2])
    doc.text('Ahitché', 14, 20)
    
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(COULEUR_GRIS[0], COULEUR_GRIS[1], COULEUR_GRIS[2])
    doc.text('Plateforme d\'Approvisionnement & Distribution', 14, 25)
    doc.text('Cotonou, Bénin', 14, 29)

    // --- TITRE & RÉFÉRENCE (BLOCK DROIT) ---
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
    doc.text('BON DE COMMANDE', 196, 20, { align: 'right' })
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(COULEUR_GRIS[0], COULEUR_GRIS[1], COULEUR_GRIS[2])
    doc.text(`Réf : ${bon.numeroBon || 'N/A'}`, 196, 26, { align: 'right' })

    // Ligne de séparation
    doc.setDrawColor(230, 230, 230)
    doc.line(14, 33, 196, 33)

    // --- DÉTAILS CONTEXTUELS ---
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
    doc.text('Détails de la commande :', 14, 43)
    
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    const dateAffichage = bon.dateEmission ? new Date(bon.dateEmission).toLocaleDateString('fr-BJ') : new Date().toLocaleDateString('fr-BJ')
    doc.text(`Date d'émission : ${dateAffichage}`, 14, 49)
    doc.text(`Statut initial : En attente de validation`, 14, 54)

    // Encart Fournisseur
    doc.setFillColor(248, 249, 251)
    doc.rect(120, 39, 76, 20, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.text('Fournisseur ciblé :', 124, 45)
    doc.setFont('Helvetica', 'normal')
    doc.text(bon.fournisseur || 'Non spécifié', 124, 51)

    // --- TABLEAU BONS DE COMMANDE ---
    const colonnes = ['Désignation de l\'article', 'Quantité', 'P.U. Estimé', 'Montant Total']
    let montantGlobal = 0

    const itemsSafe = bon.items || []
    const lignes = itemsSafe.map((item) => {
      let nomProduit = 'Produit inconnu'
      let uniteProduit = ''

      if (typeof item.productId === 'object' && item.productId !== null) {
        nomProduit = item.productId.name
        uniteProduit = item.productId.unit || ''
      } else if (catalogueProduits && catalogueProduits.length > 0) {
        const match = catalogueProduits.find(p => p._id === item.productId)
        if (match) {
          nomProduit = match.name
          uniteProduit = match.unit || ''
        }
      }

      const qte = item.quantiteCommandee || 0
      const pu = item.prixUnitairePrevu || 0
      const totalLigne = qte * pu
      montantGlobal += totalLigne

      return [
        nomProduit,
        `${qte} ${uniteProduit}`.trim(),
        formatPrixPDF(pu),
        formatPrixPDF(totalLigne)
      ]
    })

    autoTable(doc, {
      startY: 67,
      head: [colonnes],
      body: lignes,
      theme: 'striped',
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: COULEUR_FORET,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        textColor: [40, 40, 40]
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 36, halign: 'right' },
        3: { cellWidth: 42, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    })

    // --- TOTALISATION FINANCIÈRE ---
    const finalY = finDernierTableau(doc) || 110
    const finTableauY = finalY + 12

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
    // Alignement automatique sur la marge droite (196mm) pour éviter tout débordement
    doc.text(
      `Montant Total Estimé du Bon : ${formatPrixPDF(montantGlobal)}`,
      196,
      finTableauY,
      { align: 'right' }
    )

    // --- PIED DE PAGE ---
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(COULEUR_GRIS[0], COULEUR_GRIS[1], COULEUR_GRIS[2])
    doc.text('Signature Gestionnaire d\'entrepôt', 14, finTableauY + 20)
    doc.line(14, finTableauY + 22, 65, finTableauY + 22)

    doc.save(`Ahitche_Bon_Commande_${bon.numeroBon || 'export'}.pdf`)
  } catch (error) {
    console.error("Erreur lors de la génération du PDF :", error)
  }
}

// --- Bon au format facture : lignes de la facture, rattachées aux produits du catalogue ---

interface LigneFacturePDF {
  designation: string
  quantiteFacture?: string
  productId: { name: string; unit: string; reference?: string | null } | string | null
  quantite: number
  detailQuantite?: string
  montantFcfa: number
}

interface BonFacturePDF {
  numeroBon: string
  typeCommande?: string
  fournisseur: string
  numeroFacture?: string
  dateFacture?: string | null
  dateEmission?: string
  statut?: string
  lignes?: LigneFacturePDF[]
  montantTotalFcfa?: number | null
  commentaire?: string
}

// Les polices standard de jsPDF ne connaissent que le codage WinAnsi : un seul caractère hors de ce codage brouille
// toute la ligne. Espaces fines remplacées par des espaces, autres caractères inconnus par « ? ».
const WIN_ANSI = /[^\n\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g
const textePDF = (s: string | null | undefined): string => (s ?? '').replace(/[    ]/g, ' ').replace(WIN_ANSI, '?')

// 1234.5 -> « 1 234,5 » (séparateurs lisibles par jsPDF)
const nombrePDF = (n: number): string => {
  const [entier = '0', decimales] = String(Math.round(n * 1000) / 1000).split('.')
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (decimales ? `,${decimales}` : '')
}
const montantPDF = (n: number | null | undefined): string => `${nombrePDF(Math.round((n ?? 0) * 100) / 100)} FCFA`
const datePDF = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : '-'

export const genererBonFacturePDF = (bon: BonFacturePDF) => {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const FORET: [number, number, number] = [26, 92, 56] // #1A5C38
    const NOIR: [number, number, number] = [17, 17, 17]
    const GRIS: [number, number, number] = [74, 85, 104] // #4A5568
    const achatDirect = bon.typeCommande === 'Achat direct'

    // En-tête
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...FORET)
    doc.text('Ahitché', 14, 20)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text('Approvisionnement et livraison alimentaire', 14, 25)
    doc.text('Cotonou, Bénin', 14, 29)

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...NOIR)
    doc.text(achatDirect ? 'ACHAT DIRECT' : 'BON DE COMMANDE', 196, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.setTextColor(...GRIS)
    doc.text(doc.splitTextToSize(`Réf : ${textePDF(bon.numeroBon)}`, 90) as string[], 196, 26, { align: 'right' })
    doc.setDrawColor(230, 230, 230)
    doc.line(14, 35, 196, 35)

    // Facture, dates et statut ; fournisseur à droite
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...NOIR)
    // Coupées avant l'encadré du fournisseur (x = 120) : un long numéro de facture passe à la ligne
    const details = [
      `N° de facture : ${textePDF(bon.numeroFacture) || 'non indiquée'}`,
      achatDirect ? `Date de la facture : ${datePDF(bon.dateFacture ?? bon.dateEmission)}` : `Date du bon : ${datePDF(bon.dateEmission)}`,
      ...(!achatDirect && bon.dateFacture ? [`Date de la facture : ${datePDF(bon.dateFacture)}`] : []),
      `Statut : ${textePDF(bon.statut) || 'En attente'}`,
    ].flatMap(ligne => doc.splitTextToSize(ligne, 102) as string[])
    details.forEach((ligne, i) => doc.text(ligne, 14, 43 + i * 5.5))
    const finDetails = 43 + (details.length - 1) * 5.5

    doc.setFillColor(248, 245, 239) // Crème
    doc.rect(120, 39, 76, 20, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.text('Fournisseur :', 124, 45)
    doc.setFont('Helvetica', 'normal')
    doc.text(doc.splitTextToSize(textePDF(bon.fournisseur) || 'Non indiqué', 68) as string[], 124, 51)

    // Lignes de la facture
    const lignes = bon.lignes ?? []
    const produit = (l: LigneFacturePDF) => (l.productId && typeof l.productId === 'object' ? l.productId : null)
    autoTable(doc, {
      startY: Math.max(67, finDetails + 8),
      head: [['Désignation (facture)', 'Produit', 'Quantité', 'Montant']],
      body: lignes.map(l => {
        const p = produit(l)
        return [
          [textePDF(l.designation), l.quantiteFacture ? `Facturé : ${textePDF(l.quantiteFacture)}` : ''].filter(Boolean).join('\n'),
          p ? textePDF([p.reference, p.name].filter(Boolean).join(' · ')) : 'Produit introuvable',
          [`${nombrePDF(l.quantite)} ${textePDF(p?.unit)}`.trim(), textePDF(l.detailQuantite)].filter(Boolean).join('\n'),
          montantPDF(l.montantFcfa),
        ]
      }),
      foot: [['', '', 'Total', montantPDF(bon.montantTotalFcfa ?? lignes.reduce((s, l) => s + (l.montantFcfa || 0), 0))]],
      showFoot: 'lastPage', // Le total une seule fois, en bas de la dernière page
      rowPageBreak: 'avoid', // Une ligne de la facture n'est jamais coupée entre deux pages
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: FORET, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { textColor: [40, 40, 40] },
      footStyles: { fillColor: [240, 235, 225], textColor: NOIR, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 48 },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 34, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    })

    // Commentaire et signature, sur une nouvelle page s'il ne reste pas la place
    let y = (finDernierTableau(doc) ?? 110) + 10
    const commentaire = bon.commentaire ? (doc.splitTextToSize(`Commentaire : ${textePDF(bon.commentaire)}`, 182) as string[]) : []
    if (y + commentaire.length * 4.5 + 26 > 285) {
      doc.addPage()
      y = 20
    }
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    if (commentaire.length) {
      doc.text(commentaire, 14, y)
      y += commentaire.length * 4.5 + 4
    }
    doc.text('Signature du gestionnaire', 14, y + 12)
    doc.line(14, y + 14, 65, y + 14)

    doc.save(`Ahitche_Bon_${bon.numeroBon.replace(/[^\w-]+/g, '_') || 'export'}.pdf`)
  } catch (error) {
    console.error("Erreur lors de la génération du PDF :", error)
  }
}