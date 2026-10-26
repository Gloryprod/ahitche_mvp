import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { finDernierTableau } from './pdfTableau'
import { WHATSAPP_AFFICHAGE } from '@/config/contact';
import { quantiteEtUnite, type DemandeLibre, type LigneAchatLibre } from '@/config/vip';

export interface RecuData {
  commandeId: string;
  reference?: string; // Référence CMD-xxx fixée par le serveur (ancienne forme tirée de l'identifiant si elle manque)
  formule: string;
  date: string;
  total: string;
  clientNom: string;
  clientEmail: string;
  clientPhone?: string;
  clientQuartier?: string;
  clientAdresse?: string;
  // Achat libre VIP : une ligne par produit (prix VIP), puis les demandes libres (chiffrées ou retirées)
  lignes?: LigneAchatLibre[];
  demandesLibres?: DemandeLibre[];
}

// Les espaces insécables (séparateur de milliers à la française) ne passent pas dans la police du PDF
const sansInsecable = (texte: string) => texte.replace(/[  ]/g, ' ');
const fcfaPDF = (montant: number) => sansInsecable(`${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`);

// Lignes du tableau d'un achat libre : produits au prix VIP, demandes libres chiffrées, demandes retirées sans montant
function lignesAchatLibre(data: RecuData): string[][] {
  const produits = (data.lignes ?? []).map(l => [l.nom, fcfaPDF(l.prixUnitaire), sansInsecable(quantiteEtUnite(l.quantite, l.unite)), fcfaPDF(l.total)]);
  const demandes = (data.demandesLibres ?? []).map(d => {
    const libelle = `Demande libre : ${d.designation}${d.quantite ? ` (${d.quantite})` : ''}`;
    if (d.retiree) return [`${libelle} - retirée`, '-', '-', '-'];
    return d.prix === null ? [libelle, 'à confirmer', '1', '-'] : [libelle, fcfaPDF(d.prix), '1', fcfaPDF(d.prix)];
  });
  return [...produits, ...demandes];
}

export const genererRecuPDF = (data: RecuData) => {
  // Référence réelle de la commande ; les anciennes commandes sans référence gardent la forme tirée de l'identifiant
  const reference = data.reference || `#CMD-${data.commandeId.substring(data.commandeId.length - 4).toUpperCase()}`;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const vertForet = [30, 58, 31] as [number, number, number]; // #1e3a1f
  const grisTexte = [100, 116, 139] as [number, number, number];
  const noirTexte = [30, 41, 59] as [number, number, number];


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
  doc.text(`Cotonou, Bénin | WhatsApp : ${WHATSAPP_AFFICHAGE}`, 14, 35);

  // --- BADGE REÇU / STATUT ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...vertForet);
  doc.text('REÇU DE LIVRAISON', 196, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61); // Vert succès
  doc.text('STATUT : LIVRÉE ET PAYÉE', 196, 26, { align: 'right' });

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
  doc.text(`E-mail : ${data.clientEmail}`, 14, 55);
  if (data.clientPhone) doc.text(`Tél. : ${data.clientPhone}`, 14, 60);
  if (data.clientQuartier) doc.text(`Quartier : ${data.clientQuartier}`, 14, 65);
  if (data.clientAdresse) doc.text(`Adresse : ${data.clientAdresse}`, 14, 70);

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
  doc.text(reference, 160, 50);

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
    head: [['Désignation', 'Prix unitaire', 'Qté', 'Total']],
    body: data.lignes || data.demandesLibres
      ? lignesAchatLibre(data)
      : [
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
  const finalY = (finDernierTableau(doc) ?? 0) + 10;

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
  doc.save(`Recu_Ahitche_${reference.replace(/[^\w-]+/g, '')}.pdf`);
};