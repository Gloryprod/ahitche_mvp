import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

interface PDFItem {
  productId?: { name: string; unit: string } | string
  name?: string // Si résolu à la volée
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

export const générerBonCommandePDF = (bon: PurchaseOrderPDFData, catalogueProduits: any[] = []) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // --- CONFIGURATION COULEURS CHARTE (Ahitché) ---
  const COLEUR_FORET: [number, number, number] = [34, 76, 56] // #224C38
  const COULEUR_NOIR: [number, number, number] = [26, 26, 26]
  const COULEUR_GRIS: [number, number, number] = [120, 120, 120]

  // --- EN-TÊTE DE L'ENTREPRISE ---
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(COLEUR_FORET[0], COLEUR_FORET[1], COLEUR_FORET[2])
  doc.text('Ahitché', 14, 20)
  
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COULEUR_GRIS[0], COULEUR_GRIS[1], COULEUR_GRIS[2])
  doc.text('Plateforme d\'Approvisionnement & Distribution', 14, 25)
  doc.text('Cotonou, Bénin', 14, 29)

  // --- TITRE DU DOCUMENT BLOCK DROIT ---
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
  doc.text('BON DE COMMANDE', 130, 20)
  
  doc.setFont('Helvetica', 'mono')
  doc.setFontSize(11)
  doc.text(`Réf : ${bon.numeroBon}`, 130, 26)

  // Ligne de séparation horizontale
  doc.setDrawColor(230, 230, 230)
  doc.line(14, 35, 196, 35)

  // --- INFORMATIONS CONTEXTUELLES ---
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
  doc.text('Détails de la commande :', 14, 45)
  
  doc.setFont('Helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  const dateAffichage = bon.dateEmission ? new Date(bon.dateEmission).toLocaleDateString('fr-BJ') : new Date().toLocaleDateString('fr-BJ')
  doc.text(`Date d'émission : ${dateAffichage}`, 14, 51)
  doc.text(`Statut initial : En attente de validation`, 14, 56)

  // Encart Destinataire / Fournisseur encadré
  doc.setFillColor(248, 249, 251)
  doc.rect(120, 42, 76, 20, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.text('Fournisseur ciblé :', 124, 47)
  doc.setFont('Helvetica', 'normal')
  doc.text(bon.fournisseur, 124, 53)

  // --- CONSTRUCTION DU TABLEAU DES ARTICLES ---
  const colonnes = ['Désignation de l\'article', 'Quantité', 'P.U. Estimé', 'Montant Total']
  let montantGlobal = 0

  const lignes = bon.items.map((item) => {
    // Résolution du nom du produit (s'il vient du catalogue local ou s'il est déjà peuplé)
    let nomProduit = 'Produit inconnu'
    let uniteProduit = ''

    if (typeof item.productId === 'object' && item.productId !== null) {
      nomProduit = item.productId.name
      uniteProduit = item.productId.unit
    } else if (catalogueProduits.length > 0) {
      const match = catalogueProduits.find(p => p._id === item.productId)
      if (match) {
        nomProduit = match.name
        uniteProduit = match.unit
      }
    }

    const totalLigne = item.quantiteCommandee * item.prixUnitairePrevu
    montantGlobal += totalLigne

    return [
      nomProduit,
      `${item.quantiteCommandee} ${uniteProduit}`,
      `${item.prixUnitairePrevu.toLocaleString('fr-BJ')} FCFA`,
      `${totalLigne.toLocaleString('fr-BJ')} FCFA`
    ]
  })

  // Génération automatique de la table via jsPDF-AutoTable
  ;(doc as any).autoTable({
    startY: 70,
    head: [colonnes],
    body: lignes,
    theme: 'striped',
    headStyles: {
      fillColor: COLEUR_FORET,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [40, 40, 40]
    },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  })

  // --- BLOC TOTALISATION FINANCIAL ---
  const finTableauY = (doc as any).lastAutoTable.finalY + 10
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COULEUR_NOIR[0], COULEUR_NOIR[1], COULEUR_NOIR[2])
  doc.text(`Montant Total Estimé du Bon : ${montantGlobal.toLocaleString('fr-BJ')} FCFA`, 110, finTableauY)

  // --- BAS DE PAGE (SIGNATURES) ---
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COULEUR_GRIS[0], COULEUR_GRIS[1], COULEUR_GRIS[2])
  doc.text('Signature Gestionnaire d\'entrepôt', 14, finTableauY + 25)
  doc.line(14, finTableauY + 27, 65, finTableauY + 27)

  // Sauvegarde / Téléchargement du fichier
  doc.save(`Ahitche_Bon_Commande_${bon.numeroBon}.pdf`)
}