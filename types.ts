// Type definitions for the application

// For Lesson Plan generator
export interface FormData {
  disciplina: string;
  anoEscolaridade: string;
  assunto: string;
  bncc: string;
  detalhesAdicionais: string;
  duracaoAula: string;
  metodologia: string;
  buscarNaWeb: boolean;
}

export interface LessonPlan extends FormData {
  id: number;
  generatedContent: string;
  summaryContent?: string;
  editedContent?: string;
  editedSummaryContent?: string;
  sources?: { uri: string; title: string; }[];
}

// For Quiz generator
export interface QuizFormData {
  componente: string;
  ano: string;
  assunto: string;
  tiposQuestao: ('multipla' | 'discursiva')[];
  numQuestoesMultipla: number;
  numQuestoesDiscursiva: number;
}

export interface SavedQuiz extends QuizFormData {
  id: number;
  questions: any[];
  generatedContent: string;
  editedContent?: string;
}

// For Crossword generator
export interface WordEntry {
  word: string;
  clue: string;
}

export interface SavedCrossword {
  id: number;
  curricularComponent: string;
  schoolYear: string;
  topic: string;
  wordEntries: WordEntry[];
  grid: any;
  clues: {
      across: { number: number; clue: string }[];
      down: { number: number; clue: string }[];
  };
}

// For School Management and Student View
export interface Student {
  nome: string;
  notas: (number | null)[][];
  recuperacaoAnual?: number | null;
  accessCode?: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  date: string;
}

export interface Activity {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  status: string;
}

export interface Discipline {
  alunos: Student[];
  etapa: string;
  modalidade: string;
  schedule?: { [day: string]: number[] };
  announcements?: Announcement[];
  activities?: Activity[];
}

export interface School {
  disciplinas: { [disciplineName: string]: Discipline };
  schoolYearStart?: string;
  schoolYearEnd?: string;
}

export interface SchoolsData {
  [schoolName: string]: School;
}