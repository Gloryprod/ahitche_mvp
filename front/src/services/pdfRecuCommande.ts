import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface RecuData {
  commandeId: string;
  formule: string;
  date: string;
  total: string;
  clientNom: string;
  clientEmail: string;
  clientPhone?: string;
  clientQuartier?: string;
  clientAdresse?: string;
}

export const genererRecuPDF = (data: RecuData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const vertForet = [30, 58, 31] as [number, number, number]; // #1e3a1f
  const grisTexte = [100, 116, 139] as [number, number, number];
  const noirTexte = [30, 41, 59] as [number, number, number];

  // Formatage propre des prix sans caractères spéciaux problématiques pour jsPDF
  const formatPrixPDF = (valeur: number): string => {
  return valeur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA"
  }


  // --- EN-TÊTE COMPANY ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...vertForet);
  doc.text('AHITCHÉ', 14, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grisTexte);
  doc.text('Le marché suivi et organisé pour vous.', 14, 25);
  doc.text("Parce que votre santé n'a pas de prix.", 14, 30);
  doc.text('Cotonou, Bénin | WhatsApp: +229 98 13 66 35', 14, 35);

  // --- BADGE REÇU / STATUT ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...vertForet);
  doc.text('REÇU DE LIVRAISON', 196, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61); // Vert succès
  doc.text('STATUS: LIVRÉ & PAYÉ', 196, 26, { align: 'right' });

  // Ligne de séparation
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 35, 196, 35);

  // --- BLOC DÉTAILS CLIENT & COMMANDE ---
  // Colonne Gauche : Client
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...vertForet);
  doc.text('CLIENT', 14, 44);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...noirTexte);
  doc.text(data.clientNom, 14, 50);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grisTexte);
  doc.setFontSize(9);
  doc.text(`Email: ${data.clientEmail}`, 14, 55);
  if (data.clientPhone) doc.text(`Tél: ${data.clientPhone}`, 14, 60);
  if (data.clientQuartier) doc.text(`Quartier: ${data.clientQuartier}`, 14, 65);
  if (data.clientAdresse) doc.text(`Adresse: ${data.clientAdresse}`, 14, 70);

  // Colonne Droite : Commande
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...vertForet);
  doc.text('INFORMATIONS COMMANDE', 120, 44);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grisTexte);
  
  doc.text('Réf. Commande :', 120, 50);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...noirTexte);
  doc.text(`#CMD-${data.commandeId.substring(data.commandeId.length - 4).toUpperCase()}`, 160, 50);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grisTexte);
  doc.text('Date de commande :', 120, 56);
  doc.setTextColor(...noirTexte);
  doc.text(data.date, 160, 56);

  doc.setTextColor(...grisTexte);
  doc.text('Date du reçu :', 120, 62);
  doc.setTextColor(...noirTexte);
  doc.text(new Date().toLocaleDateString('fr-FR'), 160, 62);

  const totalPropre = data.total.replace(/[\u202f\u00a0]/g, ' ');

  // --- TABLEAU DES ARTICLES ---
  autoTable(doc, {
    startY: 80,
    head: [['Description', 'Prix Unitaire', 'Qté', 'Total']],
    body: [
      [
        `Formule : ${data.formule}`,
        totalPropre,
        '1',
        totalPropre
      ]
    ],
    headStyles: {
      fillColor: vertForet,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      textColor: noirTexte,
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 37, halign: 'right' },
    },
    theme: 'striped',
  });

  // --- RECAPITULATIF FINANCIER ---
  const finalY = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...vertForet);
  doc.text('TOTAL REÇU :', 130, finalY);
  doc.text(totalPropre, 196, finalY, { align: 'right' });

  // --- PIED DE PAGE ---
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 275, 196, 275);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...grisTexte);
  doc.text('Merci pour votre confiance ! Pour toute question, contactez le service client Ahitché.', 105, 282, { align: 'center' });

  // Téléchargement direct du fichier
  doc.save(`Recu_Ahitche_CMD-${data.commandeId.substring(data.commandeId.length - 4).toUpperCase()}.pdf`);
};