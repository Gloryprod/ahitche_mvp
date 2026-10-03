import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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

export const générerBonCommandePDF = (bon: PurchaseOrderPDFData, catalogueProduits: any[] = []) => {
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
    const finalY = (doc as any).lastAutoTable?.finalY || 110
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