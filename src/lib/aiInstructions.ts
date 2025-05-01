import { type ChatCompletionMessageParam } from 'openai/resources';

export const SYSTEM_PROMPT = `
Sei un assistente clinico virtuale che supporta i medici nella raccolta, organizzazione e sintesi delle informazioni principali durante la **prima consulenza** di un percorso specialistico (dimagrimento/metabolico). Il tuo compito è:

- Analizzare la trascrizione della consulenza
- Estrarre tutte le informazioni rilevanti per un corretto inquadramento clinico e motivazionale del paziente
- Prendere nota in modo professionale, chiaro, oggettivo (senza deduzioni arbitrarie)
- Utilizzare una terminologia medica standard orientata alla trasmissione tra specialisti
- Evitare opinioni personali: riportare solo quanto emerso in consultazione
- Garantire massima privacy e riservatezza

L'output servirà come "scheda iniziale" per altri specialisti (nutrizionista, dietista, endocrinologo, psicologo, ecc.) per prendere decisioni informate.
Evita interpretazioni, ma segnala eventuali criticità o punti che richiedono approfondimento.
Non fornire diagnosi o suggerimenti terapeutici personali.
`;

export const REPORT_TEMPLATE = `
# Scheda Paziente - Prima Consulenza

Data: [DATA]
Paziente: [NOME_PAZIENTE]

## 1. Motivo della visita
[MOTIVO_VISITA]

## 2. Storia medica e familiare
[STORIA_MEDICA]

## 3. Storia ponderale
[STORIA_PONDERALE]

## 4. Abitudini alimentari
[ABITUDINI_ALIMENTARI]

## 5. Attività fisica
[ATTIVITA_FISICA]

## 6. Fattori psicologici/motivazionali
[FATTORI_PSI]

## 7. Esami e parametri rilevanti
[ESAMI_PARAMETRI]

## 8. Punti critici e rischi individuati
[PUNTI_CRITICI]

## 9. Note della specialista
[NOTE_SPECIALISTA]
`;

export interface ConsultationData {
  patientId: string;
  transcription: string;
  audioUrl?: string;
  date: Date;
  patientName?: string;
}

export interface MedicalReport {
  motivoVisita: string;
  storiaMedica: string;
  storiaPonderale: string;
  abitudiniAlimentari: string;
  attivitaFisica: string;
  fattoriPsi: string;
  esamiParametri: string;
  puntiCritici: string;
  noteSpecialista: string;
}

export function generatePrompt(consultation: ConsultationData): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Ecco la trascrizione della prima consulenza medica di un percorso di dimagrimento/metabolico.
Analizza ed estrai con accuratezza tutte le informazioni rilevanti, e genera un report dettagliato in italiano, utilizzando **il seguente schema**:

1. **Motivo della visita**: perché il paziente si è rivolto alla specialista (es: desiderio di perdere peso, difficoltà specifiche, richieste particolari)
2. **Storia medica e familiare**: comorbidità, malattie attuali o pregresse, familiarità per obesità, diabete, ecc.
3. **Storia ponderale**: andamento del peso negli anni, precedente tentativi di dimagrimento, ecc.
4. **Abitudini alimentari**: dettagli su dieta abituale, preferenze, eventuali restrizioni/intolleranze, pattern alimentari ricorrenti (es: spuntini notturni, binge eating)
5. **Attività fisica**: tipologia, frequenza, eventuali limitazioni
6. **Fattori psicologici/motivazionali**: motivazione, grado di consapevolezza, aspettative, ostacoli previsti, grado di supporto familiare/sociale
7. **Esami e parametri rilevanti**: valori riferiti dal paziente, BMI, pressione, glicemia, colesterolo, ecc. (se disponibili)
8. **Punti critici e rischi individuati**: segnalare possibili aspetti da approfondire o elementi di attenzione per il team specialistico
9. **Note della specialista**: altre informazioni ritenute rilevanti durante la consultazione

Se una sezione non è stata discussa, inserisci "N.A." (Non affrontato).

**Template di output:**

${REPORT_TEMPLATE}

Informazioni della consultazione:
Data: ${consultation.date.toLocaleDateString('it-IT')}
Paziente: ${consultation.patientName || '[Nome Paziente]'}

Trascrizione:
${consultation.transcription}
`
    }
  ];
}

export function parseAIResponse(response: string): MedicalReport {
  function extractSection(id: string): string {
    const re = new RegExp(`## ${id}\\n([\\s\\S]*?)(?:\\n## |$)`);
    return re.exec(response)?.[1]?.trim() || 'N.A.';
  }
  return {
    motivoVisita: extractSection('1\\. Motivo della visita'),
    storiaMedica: extractSection('2\\. Storia medica e familiare'),
    storiaPonderale: extractSection('3\\. Storia ponderale'),
    abitudiniAlimentari: extractSection('4\\. Abitudini alimentari'),
    attivitaFisica: extractSection('5\\. Attività fisica'),
    fattoriPsi: extractSection('6\\. Fattori psicologici/motivazionali'),
    esamiParametri: extractSection('7\\. Esami e parametri rilevanti'),
    puntiCritici: extractSection('8\\. Punti critici e rischi individuati'),
    noteSpecialista: extractSection('9\\. Note della specialista'),
  };
}

export function validateReport(report: MedicalReport): string[] {
  const warnings: string[] = [];
  if (report.motivoVisita === 'N.A.') warnings.push('Motivo della visita mancante');
  if (report.storiaMedica === 'N.A.') warnings.push('Storia medica e familiare mancante');
  if (report.abitudiniAlimentari === 'N.A.') warnings.push('Abitudini alimentari non riportate');
  if (report.storiaPonderale === 'N.A.') warnings.push('Storia ponderale non riportata');
  if (report.attivitaFisica === 'N.A.') warnings.push('Attività fisica non riportata');
  if (report.fattoriPsi === 'N.A.') warnings.push('Fattori psicologici/motivazionali non riportati');
  if (report.esamiParametri === 'N.A.') warnings.push('Esami e parametri rilevanti mancanti');
  if (report.puntiCritici === 'N.A.') warnings.push('Punti critici e rischi non specificati');
  if (report.noteSpecialista === 'N.A.') warnings.push('Note della specialista mancanti');
  return warnings;
}