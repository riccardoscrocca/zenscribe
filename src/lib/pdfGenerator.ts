import { jsPDF } from 'jspdf';
import type { MedicalReport } from './aiInstructions';

interface GeneratePDFOptions {
  report: MedicalReport;
  patientName: string;
  visitType: 'prima_visita' | 'visita_controllo';
}

export function generatePDF({ report, patientName, visitType }: GeneratePDFOptions): string {
  const doc = new jsPDF();
  
  // Set font
  doc.setFont('helvetica');
  
  // Add header
  doc.setFontSize(20);
  doc.text('Referto Medico', 20, 20);
  
  // Add patient info
  doc.setFontSize(12);
  doc.text(`Paziente: ${patientName}`, 20, 35);
  doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 20, 42);
  doc.text(`Tipo Visita: ${visitType === 'prima_visita' ? 'Prima Visita' : 'Visita di Controllo'}`, 20, 49);
  
  // Add report sections
  let yPos = 60;
  const sections = [
    { title: 'Motivo della Visita', content: report.motivoVisita },
    { title: 'Storia Medica e Familiare', content: report.storiaMedica },
    { title: 'Storia Ponderale', content: report.storiaPonderale },
    { title: 'Abitudini Alimentari', content: report.abitudiniAlimentari },
    { title: 'Attività Fisica', content: report.attivitaFisica },
    { title: 'Fattori Psicologici/Motivazionali', content: report.fattoriPsi },
    { title: 'Esami e Parametri Rilevanti', content: report.esamiParametri },
    { title: 'Punti Critici e Rischi', content: report.puntiCritici },
    { title: 'Note dello Specialista', content: report.noteSpecialista }
  ];

  sections.forEach(({ title, content }) => {
    // Add new page if needed
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Add section title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, yPos);
    yPos += 7;

    // Add section content
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(content, 170);
    doc.text(lines, 20, yPos);
    yPos += lines.length * 7 + 10;
  });

  // Save the PDF
  return doc.output('datauristring');
}