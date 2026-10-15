import type { jsPDF } from 'jspdf'

// Ordonnée du bas du dernier tableau dessiné par jspdf-autotable (le module l'ajoute au document sans la typer)
export function finDernierTableau(doc: jsPDF): number | undefined {
  return (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
}
