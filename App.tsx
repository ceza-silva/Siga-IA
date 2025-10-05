

// FIX: Added global declarations for external libraries attached to the window object.
declare global {
  interface Window {
    Quill: any;
    LZString: any;
    pdfjsLib: any;
    mammoth: any;
    html2pdf: any;
    htmlDocx: any;
    Litepicker: any;
  }
}

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { FormData, LessonPlan, QuizFormData, SavedQuiz, SavedCrossword, WordEntry, SchoolsData } from './types';
import { generateLessonPlan, suggestMethodology, generateSummary, generateQuiz, suggestQuizTopics, generateCrosswordWords, generateCrosswordWordsFromFileContent } from './services/geminiService';
import { ArrowLeftIcon, BookOpenIcon, CheckIcon, CopyIcon, CrosswordIcon, EditIcon, ExportIcon, FileIcon, FullscreenEnterIcon, FullscreenExitIcon, PaperclipIcon, PencilIcon, PlusIcon, QuizIcon, SaveIcon, SearchIcon, SparklesIcon, TrashIcon, XIcon, MoonIcon, ManagementIcon, LogoutIcon, CloudOffIcon } from './components/icons';
import { CrosswordViewer } from './components/CrosswordGenerator';
import { Management } from './components/Management';
import { StudentView } from './components/StudentView';
import { TeacherLoginScreen } from './components/TeacherLoginScreen';
import {
    getUserData,
    updateUserField,
    getAllSchools,
    getSchoolsForTeacher,
    saveSchoolsForUser,
} from './services/firestoreService';

// Quill configuration constants
const FONT_SIZES = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '36px', '48px'];
const FONT_FACES = ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'sans-serif'];

const LESSON_PLAN_SECTIONS = [
    'Objetivos de Aprendizagem',
    'Habilidades da BNCC',
    'Metodologia',
    'Recursos Necessários',
    'Avaliação',
    'Observações Adicionais',
];

// Register custom Quill formats if Quill is available
if (window.Quill) {
    const Quill = window.Quill;
    const Parchment = Quill.imports.parchment;
    
    // Register Line Height
    const LineHeightStyle = new Parchment.Attributor.Style('lineHeight', 'line-height', {
        scope: Parchment.Scope.BLOCK,
        whitelist: ['1', '1.5', '2', '2.5']
    });
    Quill.register(LineHeightStyle, true);

    // Register Font Faces
    const Font = Quill.import('attributors/style/font');
    Font.whitelist = FONT_FACES;
    Quill.register(Font, true);

    // Register Font Size
    const Size = Quill.import('attributors/style/size');
    const customSizes = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '36px', '48px'];
    Size.whitelist = customSizes;
    Quill.register(Size, true);
}

// Utility to convert basic markdown from AI to structured, Quill-friendly HTML
const markdownToHtml = (text: string): string => {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '';
    let inList = false;

    const closeList = () => {
        if (inList) {
            html += '</ul>';
            inList = false;
        }
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        const isListItem = trimmedLine.startsWith('- ');

        if (isListItem) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            const itemContent = trimmedLine.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html += `<li>${itemContent}</li>`;
        } else {
            closeList();
            if (trimmedLine) {
                const pContent = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html += `<p>${pContent}</p>`;
            }
        }
    }
    closeList();
    return html;
};

const initialPlanFormData: FormData = {
    disciplina: '',
    anoEscolaridade: '',
    assunto: '',
    bncc: '',
    detalhesAdicionais: '',
    duracaoAula: 'None',
    metodologia: '',
    buscarNaWeb: false,
};

const initialQuizFormData: QuizFormData = {
    componente: '',
    ano: '',
    assunto: '',
    tiposQuestao: ['multipla', 'discursiva'],
    numQuestoesMultipla: 5,
    numQuestoesDiscursiva: 2,
};

const initialCrosswordFormData = {
    curricularComponent: '',
    schoolYear: '',
    topic: '',
    wordEntries: [],
    wordCount: 0,
};

type ActiveTab = 'plan' | 'summary';
type ActiveSection = 'plan' | 'quiz' | 'crossword' | 'management';


// Helper function to check if HTML content is effectively empty
const isContentEmpty = (content: string | null | undefined): boolean => {
    if (!content) return true;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    return tempDiv.innerText.trim() === '';
};

// Helper to convert quiz JSON to HTML for Quill
const quizJsonToHtml = (quiz: SavedQuiz): string => {
    let html = `<p><strong>Componente Curricular:</strong> ${quiz.componente}</p><p><strong>Ano:</strong> ${quiz.ano}</p><p><strong>Assunto:</strong> ${quiz.assunto}</p><br>`;
    
    const multipleChoiceQuestions = quiz.questions.filter(q => q.type === 'multiple_choice');
    const discursiveQuestions = quiz.questions.filter(q => q.type !== 'multiple_choice');
    const sortedQuestions = [...multipleChoiceQuestions, ...discursiveQuestions];

    let questionNumber = 1;
    sortedQuestions.forEach(q => {
        html += `<p><strong>${questionNumber}. ${q.question}</strong></p>`;
        if (q.type === 'multiple_choice' && q.options) {
            q.options.forEach((opt, optIndex) => {
                const letter = String.fromCharCode(97 + optIndex);
                html += `<p style="margin-left: 25px;">(${letter}) ${opt}</p>`;
            });
            if (q.answer) {
                 html += `<p><em><strong>Resposta Correta:</strong> ${q.answer}</em></p>`;
            }
        }
        html += '<p><br></p>';
        questionNumber++;
    });

    return html;
};

// Component for Teacher's View
const TeacherView: React.FC<{ 
    user: User, 
    onLogout: () => void,
    isOnline: boolean,
    lessonPlans: LessonPlan[],
    setLessonPlans: React.Dispatch<React.SetStateAction<LessonPlan[]>>,
    savedQuizzes: SavedQuiz[],
    setSavedQuizzes: React.Dispatch<React.SetStateAction<SavedQuiz[]>>,
    savedCrosswords: SavedCrossword[],
    setSavedCrosswords: React.Dispatch<React.SetStateAction<SavedCrossword[]>>,
    schoolsData: SchoolsData,
    setSchoolsData: React.Dispatch<React.SetStateAction<SchoolsData>>,
    selectedSchool: string,
    setSelectedSchool: React.Dispatch<React.SetStateAction<string>>,
    selectedDiscipline: string,
    setSelectedDiscipline: React.Dispatch<React.SetStateAction<string>>,
}> = ({ 
    user, 
    onLogout,
    isOnline,
    lessonPlans,
    setLessonPlans,
    savedQuizzes,
    setSavedQuizzes,
    savedCrosswords,
    setSavedCrosswords,
    schoolsData,
    setSchoolsData,
    selectedSchool,
    setSelectedSchool,
    selectedDiscipline,
    setSelectedDiscipline
}) => {
    // General State
    const [activeSection, setActiveSection] = useState<ActiveSection>('plan');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [isEditing, setIsEditing] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [mobileView, setMobileView] = useState<'history' | 'form' | 'viewer'>('history');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMobileToolbarVisible, setIsMobileToolbarVisible] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Lesson Plan State
    const [planFormData, setPlanFormData] = useState<FormData>(initialPlanFormData);
    const [activePlanId, setActivePlanId] = useState<number | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('plan');
    const [searchTerm, setSearchTerm] = useState('');
    const [editedPlanContent, setEditedPlanContent] = useState<string | null>(null);
    const [editedSummaryContent, setEditedSummaryContent] = useState<string | null>(null);

    // Quiz State
    const [quizFormData, setQuizFormData] = useState<QuizFormData>(initialQuizFormData);
    const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
    const [quizSearchTerm, setQuizSearchTerm] = useState('');
    const [editedQuizContent, setEditedQuizContent] = useState<string | null>(null);
    const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);

    // Crossword State
    const [crosswordFormData, setCrosswordFormData] = useState<{
        curricularComponent: string;
        schoolYear: string;
        topic: string;
        wordEntries: WordEntry[];
        wordCount: number;
    }>(initialCrosswordFormData);
    const [activeCrosswordId, setActiveCrosswordId] = useState<number | null>(null);
    const [crosswordSearchTerm, setCrosswordSearchTerm] = useState('');
    const [generatedPuzzle, setGeneratedPuzzle] = useState<{ grid: any, clues: any } | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [generationError, setGenerationError] = useState('');
    const [isEditingCrossword, setIsEditingCrossword] = useState(false);
    const [editedClues, setEditedClues] = useState<{ across: any[]; down: any[]; } | null>(null);

    
    // States for PDF export modal
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFilename, setExportFilename] = useState('');
    const [sectionsToExport, setSectionsToExport] = useState<Record<string, boolean>>({});
    const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>('pdf');

    // Refs
    const quillRef = useRef<any>(null); // Holds the current active Quill instance
    const viewerRef = useRef<HTMLDivElement>(null);
    const autoSaveTimeoutRef = useRef<number | null>(null);

    // Refs for Lesson Plan editor
    const planEditorRef = useRef<HTMLDivElement>(null);
    const planToolbarRef = useRef<HTMLDivElement>(null);

    // Refs for Quiz editor
    const quizEditorRef = useRef<HTMLDivElement>(null);
    const quizToolbarRef = useRef<HTMLDivElement>(null);

    // Derived State
    const activePlan = lessonPlans.find(p => p.id === activePlanId);
    const activeQuiz = savedQuizzes.find(q => q.id === activeQuizId);
    const activeCrossword = savedCrosswords.find(c => c.id === activeCrosswordId);

    const activeItem = activeSection === 'plan' ? activePlan : activeSection === 'quiz' ? activeQuiz : activeCrossword;

    const filteredLessonPlans = lessonPlans.filter(plan => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return (
            plan.disciplina.toLowerCase().includes(term) ||
            plan.anoEscolaridade.toLowerCase().includes(term) ||
            plan.assunto.toLowerCase().includes(term)
        );
    });

    const filteredQuizzes = savedQuizzes.filter(quiz => {
        const term = quizSearchTerm.toLowerCase();
        if (!term) return true;
        return (
            quiz.componente.toLowerCase().includes(term) ||
            quiz.ano.toLowerCase().includes(term) ||
            quiz.assunto.toLowerCase().includes(term)
        );
    });
    
    const filteredCrosswords = savedCrosswords.filter(crossword => {
        const term = crosswordSearchTerm.toLowerCase();
        if (!term) return true;
        return (
            crossword.curricularComponent.toLowerCase().includes(term) ||
            crossword.schoolYear.toLowerCase().includes(term) ||
            crossword.topic.toLowerCase().includes(term)
        );
    });


    const displayedContentInView = (() => {
        if (activeSection === 'quiz' && activeQuiz) {
            return activeQuiz.editedContent ?? activeQuiz.generatedContent ?? '';
        }
        if (activeSection === 'plan' && activePlan) {
            return activeTab === 'summary'
                ? (activePlan.editedSummaryContent ?? activePlan.summaryContent ?? '')
                : (activePlan.editedContent ?? activePlan.generatedContent);
        }
        return '';
    })();

    const handleRemoveFile = useCallback(() => {
        setFile(null); setFileContent('');
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        handleRemoveFile();
        if (activeSection !== 'plan') setActivePlanId(null);
        if (activeSection !== 'quiz') setActiveQuizId(null);
        if (activeSection !== 'crossword') {
            setActiveCrosswordId(null);
            setGeneratedPuzzle(null);
        }
    }, [activeSection, handleRemoveFile]);


    const performSave = useCallback((content: string) => {
        if (activeSection === 'plan' && activePlanId !== null) {
            setLessonPlans(prevPlans => prevPlans.map(p => {
                if (p.id === activePlanId) {
                    const updatedPlan = { ...p };
                    if (activeTab === 'plan') {
                        updatedPlan.editedContent = isContentEmpty(content) ? undefined : content;
                    } else {
                        updatedPlan.editedSummaryContent = isContentEmpty(content) ? undefined : content;
                    }
                    return updatedPlan;
                }
                return p;
            }));
        } else if (activeSection === 'quiz' && activeQuizId !== null) {
            setSavedQuizzes(prevQuizzes => prevQuizzes.map(q => {
                if (q.id === activeQuizId) {
                    return { ...q, editedContent: isContentEmpty(content) ? undefined : content };
                }
                return q;
            }));
        }
    }, [activeSection, activePlanId, activeQuizId, activeTab, setLessonPlans, setSavedQuizzes]);

    // Helper to create a Quill instance
    const createQuillInstance = (editorElement: HTMLDivElement, toolbarElement: HTMLDivElement) => {
        toolbarElement.innerHTML = '';
        editorElement.innerHTML = '';

        const toolbarSizes = FONT_SIZES.map(size => size === 'Normal' ? false : size);

        const quill = new window.Quill(editorElement, {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        [{ 'font': FONT_FACES }, { 'size': toolbarSizes }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'script': 'sub'}, { 'script': 'super' }],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'align': [] }, { 'lineHeight': ['1', '1.5', '2', '2.5'] }],
                        ['link', 'image', 'table'],
                        ['clean']
                    ],
                    handlers: {
                        'table': function() {
                            const range = this.quill.getSelection(true);
                            this.quill.clipboard.dangerouslyPasteHTML(range.index, '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>');
                        }
                    }
                },
                imageResize: { parchment: window.Quill.imports.parchment, modules: ['Resize', 'DisplaySize', 'Toolbar'] }
            },
        });
        
        const toolbarContainer = quill.getModule('toolbar').container;
        toolbarElement.appendChild(toolbarContainer);
        return quill;
    };

    // Effect for Lesson Plan Editor
    useEffect(() => {
        if (activeSection === 'plan' && isEditing && planEditorRef.current && planToolbarRef.current && activePlan) {
            const quill = createQuillInstance(planEditorRef.current, planToolbarRef.current);
            quillRef.current = quill;
            
            const initialContent = activeTab === 'plan' ? editedPlanContent! : editedSummaryContent!;
            if (initialContent) {
                quill.clipboard.dangerouslyPasteHTML(initialContent);
            }

            const textChangeHandler = (delta: any, oldDelta: any, source: string) => {
                if (source === 'user') {
                    setAutoSaveStatus('saving');
                    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
                    autoSaveTimeoutRef.current = window.setTimeout(() => {
                        if (quillRef.current) {
                            performSave(quillRef.current.root.innerHTML);
                            setAutoSaveStatus('saved');
                            setTimeout(() => setAutoSaveStatus('idle'), 2000);
                        }
                    }, 2500);
                }
            };
            quill.on('text-change', textChangeHandler);

            return () => {
                quill.off('text-change', textChangeHandler);
                if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
                quillRef.current = null;
                if (planToolbarRef.current) planToolbarRef.current.innerHTML = '';
            };
        }
    }, [isEditing, activePlanId, activeSection, activeTab, editedPlanContent, editedSummaryContent, performSave]);

    // Effect for Quiz Editor
    useEffect(() => {
        if (activeSection === 'quiz' && isEditing && quizEditorRef.current && quizToolbarRef.current && activeQuiz) {
            const quill = createQuillInstance(quizEditorRef.current, quizToolbarRef.current);
            quillRef.current = quill;
            
            const initialContent = editedQuizContent!;
            if (initialContent) {
                quill.clipboard.dangerouslyPasteHTML(initialContent);
            }

            const textChangeHandler = (delta: any, oldDelta: any, source: string) => {
                if (source === 'user') {
                    setAutoSaveStatus('saving');
                    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
                    autoSaveTimeoutRef.current = window.setTimeout(() => {
                        if (quillRef.current) {
                            performSave(quillRef.current.root.innerHTML);
                            setAutoSaveStatus('saved');
                            setTimeout(() => setAutoSaveStatus('idle'), 2000);
                        }
                    }, 2500);
                }
            };
            quill.on('text-change', textChangeHandler);

            return () => {
                quill.off('text-change', textChangeHandler);
                if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
                quillRef.current = null;
                if (quizToolbarRef.current) quizToolbarRef.current.innerHTML = '';
            };
        }
    }, [isEditing, activeQuizId, activeSection, editedQuizContent, performSave]);


    // Generic Handlers
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setIsLoading(true);
        setError(null);
        setGenerationError('');

        // Specific logic for crossword file handling
        if (activeSection === 'crossword') {
            try {
                if (!crosswordFormData.curricularComponent || !crosswordFormData.schoolYear) {
                    throw new Error("Selecione Componente e Ano antes de anexar.");
                }
                let textContent = '';
                if (selectedFile.type === 'application/pdf' && window.pdfjsLib) {
                    const pdfData = new Uint8Array(await selectedFile.arrayBuffer());
                    const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map((s: any) => s.str).join(' ');
                    }
                } else if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && window.mammoth) {
                    const mammothResult = await window.mammoth.extractRawText({ arrayBuffer: await selectedFile.arrayBuffer() });
                    textContent = mammothResult.value;
                } else {
                    throw new Error('Tipo de arquivo não suportado. Use PDF ou DOCX.');
                }
                if (!textContent.trim()) throw new Error("Arquivo vazio ou sem texto.");
                
                const countForAI = crosswordFormData.wordCount > 0 ? crosswordFormData.wordCount : 10;
                const generatedEntries = await generateCrosswordWordsFromFileContent(textContent, crosswordFormData.curricularComponent, crosswordFormData.schoolYear, countForAI);
                const normalizeString = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';
                const validEntries = generatedEntries.map(entry => ({ word: normalizeString(entry.word), clue: entry.clue })).filter(e => e.word && e.clue && !e.word.includes(' ') && !e.word.includes('-') && e.word.length <= 15);
                const finalEntries = validEntries.slice(0, countForAI);
                setCrosswordFormData(prev => ({...prev, wordEntries: finalEntries, wordCount: finalEntries.length }));

            } catch (error: any) {
                setGenerationError(`Erro ao processar arquivo com IA: ${error.message}`);
                setCrosswordFormData(prev => ({...prev, wordEntries: [], wordCount: 0 }));
            } finally {
                setIsLoading(false); 
                setFile(null);
                if (e.target) e.target.value = '';
            }
            return;
        }

        // Generic file handling for other sections
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const result = event.target?.result;
                if (!result) throw new Error("Could not read file.");
                
                let textContent = '';
                if (selectedFile.type === 'application/pdf' && window.pdfjsLib) {
                    const pdfData = new Uint8Array(result as ArrayBuffer);
                    const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map((s: any) => s.str).join(' ');
                    }
                } else if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && window.mammoth) {
                    const mammothResult = await window.mammoth.extractRawText({ arrayBuffer: result as ArrayBuffer });
                    textContent = mammothResult.value;
                } else if (selectedFile.type.startsWith('text/')) {
                    textContent = result as string;
                } else {
                    throw new Error('Unsupported file type. Please upload PDF, DOCX, or TXT.');
                }
                setFileContent(textContent);
            } catch (err: any) {
                setError(err.message || 'Error processing file.');
                setFile(null); setFileContent('');
            } finally { setIsLoading(false); }
        };
        reader.onerror = () => {
            setError('Failed to read the file.');
            setIsLoading(false); setFile(null); setFileContent('');
        };
        
        if (selectedFile.type.startsWith('text/')) reader.readAsText(selectedFile);
        else reader.readAsArrayBuffer(selectedFile);
    };
    
    const handleCopy = () => {
        if (!activeItem) return;
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = displayedContentInView;
        navigator.clipboard.writeText(contentDiv.innerText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleStartEdit = () => {
        if (!activeItem) return;
        if (activeSection === 'plan' && activePlan) {
            setEditedPlanContent(activePlan.editedContent ?? activePlan.generatedContent);
            setEditedSummaryContent(activePlan.editedSummaryContent ?? activePlan.summaryContent ?? '');
        } else if (activeSection === 'quiz' && activeQuiz) {
            setEditedQuizContent(activeQuiz.editedContent ?? activeQuiz.generatedContent);
        }
        setIsEditing(true);
        setIsMobileToolbarVisible(false);
    };

    const handleCancelEdit = () => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }
        setIsEditing(false);
        setEditedPlanContent(null);
        setEditedSummaryContent(null);
        setEditedQuizContent(null);
        setIsMobileToolbarVisible(false);
        setAutoSaveStatus('idle');
    };

    const handleToggleFullscreen = () => setIsFullscreen(prev => !prev);
    
    // Lesson Plan Specific Handlers
    const handlePlanInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setPlanFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }, []);

    const handleSuggestMethodology = async () => {
        setIsSuggesting(true); setError(null);
        try {
            const suggestion = await suggestMethodology(planFormData);
            setPlanFormData(prev => ({ ...prev, metodologia: suggestion.trim() }));
        } catch (err: any) { setError(err.message || 'Failed to suggest methodology.');
        } finally { setIsSuggesting(false); }
    };
    
    const handlePlanSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true); setError(null); setIsEditing(false);

        try {
            const { text: generatedContentMarkdown, sources } = await generateLessonPlan(planFormData, fileContent, file?.name || '');
            
            let planAssunto = planFormData.assunto;
            if (!planAssunto && fileContent) {
                const themeMatch = generatedContentMarkdown.match(/\*\*Tema da Aula:\*\*\s*(.*)/);
                planAssunto = themeMatch ? themeMatch[1].trim() : (file?.name.replace(/\.[^/.]+$/, "") || 'Plano de Aula Anexado');
            }
            if (!planAssunto) planAssunto = 'Plano sem título';
            
            const headerHtml = `<p><strong>Disciplina:</strong> ${planFormData.disciplina}</p><p><strong>Ano de Escolaridade:</strong> ${planFormData.anoEscolaridade}</p><p><strong>Tema da Aula:</strong> ${planAssunto}</p><br>`;
            const contentWithoutThemeMarkdown = generatedContentMarkdown.replace(/^\*\*Tema da Aula:\*\*\s*.*?\n(\n)?/m, '');
            const generatedContentHtml = markdownToHtml(contentWithoutThemeMarkdown);

            const newPlan: LessonPlan = {
                ...planFormData,
                id: Date.now(),
                assunto: planAssunto,
                generatedContent: headerHtml + generatedContentHtml,
                sources: sources,
            };

            setLessonPlans(prev => [newPlan, ...prev]);
            setActivePlanId(newPlan.id);
            setActiveTab('plan');
            setMobileView('viewer');
        } catch (err: any) { setError(err.message || 'An unknown error occurred.');
        } finally { setIsLoading(false); }
    };

    const handleGenerateSummary = async () => {
        if (!activePlan) return;
        setIsGeneratingSummary(true); setError(null);
        try {
            const currentContent = activePlan.editedContent ?? activePlan.generatedContent;
            const contentForAI = currentContent.replace(/<p><strong>Disciplina:<\/strong>.*?<\/p>\s*<p><strong>Ano de Escolaridade:<\/strong>.*?<\/p>\s*<p><strong>Tema da Aula:<\/strong>.*?<\/p>\s*(<br\s*\/?>)?/s, '');
            const summaryMarkdown = await generateSummary(contentForAI);
            const summaryHtml = markdownToHtml(summaryMarkdown);
            const headerHtml = `<p><strong>Disciplina:</strong> ${activePlan.disciplina}</p><p><strong>Ano de Escolaridade:</strong> ${activePlan.anoEscolaridade}</p><p><strong>Tema da Aula:</strong> ${activePlan.assunto}</p><br>`;
            const finalSummaryHtml = headerHtml + summaryHtml;
            
            const updatedPlans = lessonPlans.map(p => 
                p.id === activePlanId ? { ...p, summaryContent: finalSummaryHtml, editedSummaryContent: undefined } : p
            );
            setLessonPlans(updatedPlans);
            setActiveTab('summary');
        } catch (err: any) { setError(err.message || 'Failed to generate summary.');
        } finally { setIsGeneratingSummary(false); }
    };

    const handlePlanSaveEdit = () => {
        if (!activePlan || !quillRef.current) return;
    
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }
    
        const currentEditorContent = quillRef.current.root.innerHTML;
        performSave(currentEditorContent);
        
        setIsEditing(false);
        setEditedPlanContent(null);
        setEditedSummaryContent(null);
        setIsMobileToolbarVisible(false);
        setAutoSaveStatus('idle');
    };
    
    const handleTabChange = (newTab: ActiveTab) => {
        if (isEditing && quillRef.current && activeSection === 'plan') {
            const currentContent = quillRef.current.root.innerHTML;
            if (activeTab === 'plan') {
                setEditedPlanContent(currentContent);
                quillRef.current.root.innerHTML = editedSummaryContent ?? '';
            } else {
                setEditedSummaryContent(currentContent);
                quillRef.current.root.innerHTML = editedPlanContent ?? '';
            }
        }
        setActiveTab(newTab);
    };

    const handleOpenExportModal = () => {
        if (!activeItem) return;
        // Safely access properties on the 'activeItem' union type. 'assunto' exists on LessonPlan/SavedQuiz, and 'topic' exists on SavedCrossword.
        setExportFilename((('assunto' in activeItem && activeItem.assunto) || ('topic' in activeItem && activeItem.topic) || 'documento').replace(/[^a-z0-9]/gi, '_').toLowerCase());
        
        if (activeSection === 'plan') {
            const initialSections = LESSON_PLAN_SECTIONS.reduce((acc, section) => ({ ...acc, [section]: true }), {} as Record<string, boolean>);
            setSectionsToExport(initialSections);
        } else {
            setSectionsToExport({});
        }
        setIsExportModalOpen(true);
    };
    
    const handleCloseExportModal = () => {
        setIsExportModalOpen(false);
        setExportFormat('pdf');
    };

    const handleSectionToggle = (section: string) => setSectionsToExport(prev => ({...prev, [section]: !prev[section]}));
    
    const handleToggleAllSections = (selectAll: boolean) => {
        const newSections = LESSON_PLAN_SECTIONS.reduce((acc, section) => ({ ...acc, [section]: selectAll }), {} as Record<string, boolean>);
        setSectionsToExport(newSections);
    };
    
    const handleConfirmExport = async () => {
        if (!activeItem) return;
        if ((!window.html2pdf && exportFormat === 'pdf') || (!window.htmlDocx && exportFormat === 'docx')) {
            setError("A biblioteca de exportação não foi carregada. Tente recarregar a página.");
            handleCloseExportModal();
            return;
        }
    
        try {
            // 1. Prepare the HTML content for export
            let contentToExport = displayedContentInView;
    
            // For lesson plans, filter sections based on user selection
            if (activeSection === 'plan' && activePlan) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(displayedContentInView, 'text/html');
                const body = doc.body;
                const headerElements: Element[] = [];
                const sectionElements = new Map<string, Element[]>();
                let currentSection: string | null = null;
    
                for (const child of Array.from(body.children)) {
                    const strong = child.querySelector('strong');
                    const potentialTitle = strong?.textContent?.replace(':', '').trim();
                    if (potentialTitle && LESSON_PLAN_SECTIONS.includes(potentialTitle)) {
                        currentSection = potentialTitle;
                        sectionElements.set(currentSection, [child]);
                    } else if (currentSection && sectionElements.has(currentSection)) {
                        sectionElements.get(currentSection)!.push(child);
                    } else {
                        headerElements.push(child);
                    }
                }
    
                let filteredHtml = headerElements.map(el => el.outerHTML).join('');
                LESSON_PLAN_SECTIONS.forEach(section => {
                    if (sectionsToExport[section] && sectionElements.has(section)) {
                        filteredHtml += sectionElements.get(section)!.map(el => el.outerHTML).join('');
                    }
                });
                contentToExport = filteredHtml;
            }
    
            // 2. Generate and download the file based on the selected format
            if (exportFormat === 'pdf') {
                let elementToExport;
                const opt = {
                    margin: activeSection === 'crossword' ? 0 : 0.5,
                    filename: `${exportFilename}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
                    jsPDF: { unit: activeSection === 'crossword' ? 'mm' : 'in', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'avoid-all'] }
                };
    
                if (activeSection === 'crossword') {
                    elementToExport = document.getElementById('crossword-pdf-container');
                } else {
                    const finalElement = document.createElement('div');
                    const qlSnow = document.createElement('div');
                    qlSnow.className = 'ql-snow';
                    const qlEditor = document.createElement('div');
                    qlEditor.className = 'ql-editor';
                    qlEditor.innerHTML = contentToExport;
                    qlSnow.appendChild(qlEditor);
                    finalElement.appendChild(qlSnow);
                    elementToExport = finalElement;
                }
    
                if (!elementToExport) {
                    throw new Error("Elemento para exportar não foi encontrado.");
                }
                
                await window.html2pdf().from(elementToExport).set(opt).save();
    
            } else if (exportFormat === 'docx') {
                let contentHtml = '';
                if (activeSection === 'crossword') {
                    const element = document.getElementById('crossword-pdf-container');
                    if (element) contentHtml = element.innerHTML;
                } else {
                    const finalElement = document.createElement('div');
                    finalElement.innerHTML = contentToExport;
                    contentHtml = finalElement.innerHTML;
                }
    
                const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;}div[style*="page-break-before: always"]{page-break-before: always;}</style></head><body>${contentHtml}</body></html>`;
    
                const fileBuffer = await window.htmlDocx.asBlob(fullHtml, { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } });
                const url = URL.createObjectURL(fileBuffer);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${exportFilename}.docx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error("Error generating export file:", e);
            setError(`Falha ao gerar o arquivo ${exportFormat.toUpperCase()}. Tente novamente.`);
        } finally {
            handleCloseExportModal();
        }
    };


    const handleDeletePlan = (id: number) => {
        setLessonPlans(prev => prev.filter(p => p.id !== id));
        if (activePlanId === id) setActivePlanId(null);
    };
    
    const selectPlan = (id: number) => {
        setActivePlanId(id);
        setIsEditing(false);
        setActiveTab('plan');
        setMobileView('viewer');
    };
    
    // Quiz Specific Handlers
    const handleQuizInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setQuizFormData(prev => {
                const currentTypes = new Set(prev.tiposQuestao);
                if (checked) currentTypes.add(value as 'multipla' | 'discursiva');
                else currentTypes.delete(value as 'multipla' | 'discursiva');
                return { ...prev, tiposQuestao: Array.from(currentTypes) };
            });
        } else {
             const numValue = (type === 'range') ? parseInt(value, 10) : value;
             setQuizFormData(prev => ({ ...prev, [name]: numValue }));
        }
    }, []);

    const handleSuggestQuizTopics = async () => {
        if (!quizFormData.componente || !quizFormData.ano) {
            alert('Selecione Componente Curricular e Ano de Escolaridade primeiro.');
            return;
        }
        setIsSuggestingTopic(true); setError(null);
        try {
            const suggestion = await suggestQuizTopics(quizFormData.componente, quizFormData.ano);
            setQuizFormData(prev => ({ ...prev, assunto: suggestion }));
        } catch (err: any) { setError(err.message || 'Falha ao sugerir tópicos.');
        } finally { setIsSuggestingTopic(false); }
    };

    const handleQuizSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (quizFormData.numQuestoesMultipla === 0 && quizFormData.numQuestoesDiscursiva === 0) {
            setError("Selecione pelo menos um tipo de questão e defina um número de questões maior que zero.");
            return;
        }
        setIsLoading(true); setError(null); setIsEditing(false);

        try {
            const result = await generateQuiz(quizFormData, fileContent);
            const newQuiz: SavedQuiz = {
                ...quizFormData,
                id: Date.now(),
                questions: result.questions,
                generatedContent: '', // Will be set below
            };
            newQuiz.generatedContent = quizJsonToHtml(newQuiz);
            
            setSavedQuizzes(prev => [newQuiz, ...prev]);
            setActiveQuizId(newQuiz.id);
            setMobileView('viewer');

        } catch (err: any) { setError(err.message || 'Ocorreu um erro ao gerar a prova.');
        } finally { setIsLoading(false); }
    };
    
    const handleQuizSaveEdit = () => {
        if (!activeQuiz || !quillRef.current) return;
    
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }
    
        const currentEditorContent = quillRef.current.root.innerHTML;
        performSave(currentEditorContent);
    
        setIsEditing(false);
        setEditedQuizContent(null);
        setIsMobileToolbarVisible(false);
        setAutoSaveStatus('idle');
    };

    const handleDeleteQuiz = (id: number) => {
        setSavedQuizzes(prev => prev.filter(q => q.id !== id));
        if (activeQuizId === id) setActiveQuizId(null);
    };

    const selectQuiz = (id: number) => {
        setActiveQuizId(id);
        setIsEditing(false);
        setMobileView('viewer');
    };

    const handleSaveEdit = () => {
        if (activeSection === 'plan') handlePlanSaveEdit();
        else if (activeSection === 'quiz') handleQuizSaveEdit();
    };

    // Crossword Specific Handlers
    const handleCrosswordInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCrosswordFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleWordCountChange = useCallback((newCount: number) => {
        setCrosswordFormData(prev => {
            const currentEntries = prev.wordEntries;
            const currentCount = currentEntries.length;
            let newEntries = [...currentEntries];
            if (newCount > currentCount) {
                newEntries = [...newEntries, ...Array(newCount - currentCount).fill({ word: '', clue: '' })];
            } else {
                newEntries = newEntries.slice(0, newCount);
            }
            return { ...prev, wordCount: newCount, wordEntries: newEntries };
        });
    }, []);

    const handleEntryChange = useCallback((index: number, field: 'word' | 'clue', value: string) => {
        setCrosswordFormData(prev => {
            const newEntries = [...prev.wordEntries];
            newEntries[index] = { ...newEntries[index], [field]: value };
            return { ...prev, wordEntries: newEntries };
        });
    }, []);

    const handleAiGenerateCrossword = useCallback(async () => {
        const { topic, curricularComponent, schoolYear, wordCount } = crosswordFormData;
        if (!topic.trim()) { setGenerationError("Por favor, insira um tema."); return; }
        if (!curricularComponent || !schoolYear) { setGenerationError("Selecione Componente e Ano."); return; }
        setIsAiLoading(true); setGenerationError('');
        const countForAI = wordCount > 0 ? wordCount : 10;
        try {
            const generatedEntries = await generateCrosswordWords(topic, curricularComponent, schoolYear, countForAI);
            const normalizeString = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';
            const validEntries = generatedEntries.map(e => ({ word: normalizeString(e.word), clue: e.clue })).filter(e => e.word && e.clue && !e.word.includes(' ') && !e.word.includes('-') && e.word.length <= 15);
            const finalEntries = validEntries.slice(0, countForAI);
            setCrosswordFormData(prev => ({ ...prev, wordEntries: finalEntries, wordCount: finalEntries.length }));
        } catch (error) {
            console.error("Erro ao gerar palavras com IA:", error);
            setGenerationError("Não foi possível gerar as palavras. Tente novamente.");
        } finally {
            setIsAiLoading(false);
        }
    }, [crosswordFormData]);

    const handleGeneratePuzzle = useCallback(() => {
        setIsLoading(true); setGenerationError(''); setGeneratedPuzzle(null);
        setTimeout(() => {
            try {
                const normalizeString = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';
                let words = crosswordFormData.wordEntries.map(entry => ({ word: normalizeString(entry.word), clue: entry.clue.trim() })).filter(item => item.word.length > 1 && item.clue.length > 0);
                words = [...new Map(words.map(item => [item.word, item])).values()];
                words.sort((a, b) => b.word.length - a.word.length);
                if (words.length < 2) {
                    throw new Error("São necessárias pelo menos 2 palavras válidas.");
                }
                
                const GRID_SIZE = 30;
                let newGrid: any[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
                const newClues = { across: [], down: [] };
                let clueCounter = 1;
                let placedWords: any[] = [];
                const numberLocations = new Map();
                
                // --- Algorithm logic ---
                const canPlaceWord = (word: string, row: number, col: number, direction: 'across' | 'down') => {
                    if (row < 0 || col < 0) return false;
                    if (direction === 'across') {
                        if (col + word.length > GRID_SIZE) return false;
                        if (col > 0 && newGrid[row][col - 1]) return false;
                        if (col + word.length < GRID_SIZE && newGrid[row][col + word.length]) return false;
                        for (let i = 0; i < word.length; i++) {
                            const cell = newGrid[row][col + i];
                            if (cell && cell.letter !== word[i]) return false;
                            if (!cell) {
                                if (row > 0 && newGrid[row - 1][col + i]) return false;
                                if (row < GRID_SIZE - 1 && newGrid[row + 1][col + i]) return false;
                            }
                        }
                    } else {
                        if (row + word.length > GRID_SIZE) return false;
                        if (row > 0 && newGrid[row - 1][col]) return false;
                        if (row + word.length < GRID_SIZE && newGrid[row + word.length][col]) return false;
                        for (let i = 0; i < word.length; i++) {
                            const cell = newGrid[row + i][col];
                            if (cell && cell.letter !== word[i]) return false;
                            if (!cell) {
                                if (col > 0 && newGrid[row + i][col - 1]) return false;
                                if (col < GRID_SIZE - 1 && newGrid[row + i][col + 1]) return false;
                            }
                        }
                    }
                    return true;
                };
                const placeWordOnGrid = (wordObj: WordEntry, row: number, col: number, direction: 'across' | 'down') => {
                    const { word, clue } = wordObj;
                    const posKey = `${row}-${col}`;
                    let clueNum;
                    if (numberLocations.has(posKey)) {
                        clueNum = numberLocations.get(posKey);
                    } else {
                        clueNum = clueCounter++;
                        numberLocations.set(posKey, clueNum);
                    }
                    (direction === 'across' ? newClues.across : newClues.down).push({ number: clueNum, clue });
                    for (let i = 0; i < word.length; i++) {
                        const r = direction === 'across' ? row : row + i;
                        const c = direction === 'across' ? col + i : col;
                        if (!newGrid[r][c]) newGrid[r][c] = { letter: word[i] };
                        newGrid[r][c]![direction] = clueNum;
                        if (i === 0) newGrid[r][c]!.clueNumber = clueNum;
                    }
                };

                const firstWord = words.shift();
                if(!firstWord) throw new Error("A lista de palavras está vazia.");
                const startRow = Math.floor(GRID_SIZE / 2);
                const startCol = Math.floor((GRID_SIZE - firstWord.word.length) / 2);
                placeWordOnGrid(firstWord, startRow, startCol, 'across');
                placedWords.push({ ...firstWord, row: startRow, col: startCol, direction: 'across' });
                
                let attempts = 0;
                while (words.length > 0 && attempts < words.length) {
                    let placedInPass = false;
                    for (let i = words.length - 1; i >= 0; i--) {
                        const wordObj = words[i];
                        let bestFit = null;
                        let maxIntersections = 0;
                        for (let j = 0; j < wordObj.word.length; j++) {
                            for (const pWord of placedWords) {
                                for (let k = 0; k < pWord.word.length; k++) {
                                    if (wordObj.word[j] === pWord.word[k]) {
                                        const direction = pWord.direction === 'across' ? 'down' : 'across';
                                        const row = direction === 'down' ? pWord.row - j : pWord.row + k;
                                        const col = direction === 'down' ? pWord.col + k : pWord.col - j;
                                        if (canPlaceWord(wordObj.word, row, col, direction)) {
                                            let intersections = 0;
                                            for(let l = 0; l < wordObj.word.length; l++){
                                            if(direction === 'across' && newGrid[row]?.[col+l]) intersections++;
                                            if(direction === 'down' && newGrid[row+l]?.[col]) intersections++;
                                            }
                                            if (intersections > maxIntersections) {
                                                maxIntersections = intersections;
                                                bestFit = { row, col, direction };
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (bestFit && maxIntersections > 0) {
                            placeWordOnGrid(wordObj, bestFit.row, bestFit.col, bestFit.direction);
                            placedWords.push({ ...wordObj, ...bestFit });
                            words.splice(i, 1);
                            placedInPass = true;
                            attempts = 0; 
                            break; 
                        }
                    }
                    if (!placedInPass) attempts++;
                }
                // --- End Algorithm ---

                if (words.length > 0) {
                    setGenerationError(`Não foi possível encaixar: ${words.map(w => w.word).join(', ')}`);
                }
                newClues.across.sort((a, b) => a.number - b.number);
                newClues.down.sort((a, b) => a.number - b.number);
                
                const finalWordEntries = placedWords.map(({ word, clue }) => ({ word, clue }));

                // Auto-save the generated puzzle
                const newCrossword: SavedCrossword = {
                    id: Date.now(),
                    curricularComponent: crosswordFormData.curricularComponent,
                    schoolYear: crosswordFormData.schoolYear,
                    topic: crosswordFormData.topic || 'Palavra Cruzada',
                    wordEntries: finalWordEntries,
                    grid: newGrid,
                    clues: newClues,
                };
                setSavedCrosswords(prev => [newCrossword, ...prev]);
                setActiveCrosswordId(newCrossword.id);
                setGeneratedPuzzle(null);
                setMobileView('viewer');

            } catch (e: any) {
                setGenerationError(e.message || "Ocorreu um erro inesperado.");
            } finally {
                setIsLoading(false);
            }
        }, 100);
    }, [crosswordFormData, setSavedCrosswords]);


    const handleDeleteCrossword = (id: number) => {
        setSavedCrosswords(prev => prev.filter(c => c.id !== id));
        if (activeCrosswordId === id) {
             setActiveCrosswordId(null);
             setGeneratedPuzzle(null);
        }
    };

    const selectCrossword = (id: number) => {
        setActiveCrosswordId(id);
        setGeneratedPuzzle(null);
        setIsEditingCrossword(false);
        setEditedClues(null);
        setMobileView('viewer');
    };
    
    // Crossword clue editing handlers
    const handleStartEditCrossword = () => {
        if (!activeCrossword) return;
        setEditedClues(JSON.parse(JSON.stringify(activeCrossword.clues))); // Deep copy
        setIsEditingCrossword(true);
    };

    const handleCancelEditCrossword = () => {
        setIsEditingCrossword(false);
        setEditedClues(null);
    };

    const handleSaveCrosswordEdit = () => {
        if (!activeCrosswordId || !editedClues) return;
        setSavedCrosswords(prev => prev.map(cw =>
            cw.id === activeCrosswordId ? { ...cw, clues: editedClues } : cw
        ));
        setIsEditingCrossword(false);
        setEditedClues(null);
    };

    const handleClueChange = (direction: 'across' | 'down', clueNumber: number, newClueText: string) => {
        setEditedClues((prevClues: any) => {
            if (!prevClues) return null;
            const newClues = { ...prevClues };
            newClues[direction] = newClues[direction].map((clue: any) =>
                clue.number === clueNumber ? { ...clue, clue: newClueText } : clue
            );
            return newClues;
        });
    };

    // Abstract mobile navigation to a variable to avoid TypeScript control flow analysis errors.
    const mobileNavMenu = (
        <div className="flex w-full bg-slate-200 rounded-md p-1">
            <button onClick={() => setActiveSection('management')} className={`w-1/4 py-2 text-xs font-semibold rounded-md transition-colors ${activeSection === 'management' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:bg-white'}`}>
                Gestão
            </button>
            <button onClick={() => setActiveSection('plan')} className={`w-1/4 py-2 text-xs font-semibold rounded-md transition-colors ${activeSection === 'plan' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:bg-white'}`}>
                Planos
            </button>
            <button onClick={() => setActiveSection('quiz')} className={`w-1/4 py-2 text-xs font-semibold rounded-md transition-colors ${activeSection === 'quiz' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:bg-white'}`}>
                Provas
            </button>
            <button onClick={() => setActiveSection('crossword')} className={`w-1/4 py-2 text-xs font-semibold rounded-md transition-colors ${activeSection === 'crossword' ? 'bg-cyan-600 text-white shadow' : 'text-slate-600 hover:bg-white'}`}>
                Cruzada
            </button>
        </div>
    );

    return (
        <div className="flex h-screen bg-slate-100 font-sans">
            <nav className="hidden md:flex flex-col items-center w-16 py-4 bg-slate-900 text-slate-300 space-y-6">
                <div className="p-2">
                    <PencilIcon className="w-7 h-7 text-cyan-400" />
                </div>
                <div className="flex flex-col items-center space-y-2 w-full px-2">
                    <button 
                        onClick={() => setActiveSection('management')}
                        className={`group flex flex-col items-center justify-center w-full p-2 rounded-md transition-colors ${activeSection === 'management' ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        title="Gestão Escolar"
                        aria-current={activeSection === 'management'}
                    >
                        <ManagementIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">Gestão</span>
                    </button>
                    <button 
                        onClick={() => setActiveSection('plan')}
                        className={`group flex flex-col items-center justify-center w-full p-2 rounded-md transition-colors ${activeSection === 'plan' ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        title="Plano de Aula"
                        aria-current={activeSection === 'plan'}
                    >
                        <BookOpenIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">Planos</span>
                    </button>
                    <button 
                        onClick={() => setActiveSection('quiz')}
                        className={`group flex flex-col items-center justify-center w-full p-2 rounded-md transition-colors ${activeSection === 'quiz' ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        title="Gerador de Provas"
                        aria-current={activeSection === 'quiz'}
                    >
                        <QuizIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">Provas</span>
                    </button>
                    <button 
                        onClick={() => setActiveSection('crossword')}
                        className={`group flex flex-col items-center justify-center w-full p-2 rounded-md transition-colors ${activeSection === 'crossword' ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        title="Palavra Cruzada"
                        aria-current={activeSection === 'crossword'}
                    >
                        <CrosswordIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">Cruzada</span>
                    </button>
                </div>
            </nav>
            <div className="flex-1 flex flex-col overflow-hidden">
                 <header className="w-full h-10 bg-slate-700 flex justify-end items-center px-4 flex-shrink-0">
                    {!isOnline && (
                        <div className="flex items-center gap-2 text-yellow-300 mr-4" title="Você está offline. Suas alterações serão salvas e sincronizadas quando a conexão retornar.">
                            <CloudOffIcon className="w-5 h-5" />
                            <span className="text-sm font-medium hidden sm:inline">Modo Offline</span>
                        </div>
                    )}
                    <button 
                        onClick={onLogout} 
                        className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                        title="Sair"
                    >
                        <span className="text-sm font-medium hidden sm:inline">Sair</span>
                        <LogoutIcon className="w-5 h-5" />
                    </button>
                </header>
                <div className="md:hidden p-4 border-b border-slate-200 bg-white">
                    {mobileNavMenu}
                </div>
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {activeSection === 'plan' && (
                    <>
                        <aside className={`w-full md:w-1/4 bg-white border-r border-slate-200 p-4 flex-col ${mobileView === 'history' ? 'flex' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:flex'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h1 className="text-2xl font-bold text-slate-800">Planos de Aula</h1>
                                <button
                                    onClick={() => { setActivePlanId(null); setPlanFormData(initialPlanFormData); handleRemoveFile(); setMobileView('form'); }}
                                    title="Gerar Novo Plano de Aula"
                                    className="text-cyan-600 hover:text-cyan-800 transition-transform transform hover:scale-110 md:hidden"
                                >
                                    <i className="fas fa-plus-circle fa-xl"></i>
                                </button>
                            </div>
                            <div className="relative mb-4">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon className="w-5 h-5 text-slate-400" /></span>
                                <input type="text" placeholder="Buscar por disciplina, ano..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" aria-label="Buscar planos de aula"/>
                            </div>
                            <div className="overflow-y-auto flex-grow">
                                {lessonPlans.length === 0 ? <p className="text-slate-500">Nenhum plano gerado.</p>
                                : filteredLessonPlans.length === 0 ? <p className="text-slate-500">Nenhum plano encontrado.</p>
                                : <ul>{filteredLessonPlans.map(plan => (
                                    <li key={plan.id} className={`p-3 rounded-md mb-2 cursor-pointer transition-colors ${activePlanId === plan.id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`} onClick={() => selectPlan(plan.id)}>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-slate-700">{plan.assunto}</p>
                                                <p className="text-sm text-slate-500">{plan.disciplina} - {plan.anoEscolaridade}</p>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id) }} className="text-slate-400 hover:text-red-600 p-1 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </li>
                                ))}</ul>}
                            </div>
                        </aside>
                        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                            <div className={`w-full md:w-1/3 bg-slate-50 p-6 overflow-y-auto border-r border-slate-200 ${mobileView === 'form' ? 'block' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:block'}`}>
                                <div className="flex items-center mb-4">
                                    <button onClick={() => setMobileView('history')} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button>
                                    <h2 className="text-xl font-semibold text-slate-800">Gerar Novo Plano</h2>
                                </div>
                                <form onSubmit={handlePlanSubmit} className="space-y-4">
                                    <div>
                                        <label htmlFor="disciplina" className="block text-sm font-medium text-slate-700">Disciplina</label>
                                        <select name="disciplina" value={planFormData.disciplina} onChange={handlePlanInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${planFormData.disciplina ? 'text-slate-900' : 'text-slate-400'}`} required>
                                            <option value="" disabled>Selecione uma disciplina</option>
                                            <option>Língua Portuguesa</option> <option>Arte</option> <option>Educação Física</option> <option>Língua Inglesa</option> <option>Matemática</option> <option>Ciências</option> <option>Geografia</option> <option>História</option> <option>Ensino Religioso</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="anoEscolaridade" className="block text-sm font-medium text-slate-700">Ano de Escolaridade</label>
                                        <select name="anoEscolaridade" value={planFormData.anoEscolaridade} onChange={handlePlanInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${planFormData.anoEscolaridade ? 'text-slate-900' : 'text-slate-400'}`} required>
                                            <option value="" disabled>Selecione um ano</option>
                                            <option>6º Ano do Ensino Fundamental</option> <option>7º Ano do Ensino Fundamental</option> <option>8º Ano do Ensino Fundamental</option> <option>9º Ano do Ensino Fundamental</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="assunto" className="block text-sm font-medium text-slate-700">Tema/Assunto</label>
                                        <input type="text" name="assunto" value={planFormData.assunto} onChange={handlePlanInputChange} placeholder={file ? "Opcional: o tema será extraído do anexo" : "Digite o tema central da aula"} className="mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" required={!file}/>
                                    </div>
                                    <div>
                                        <label htmlFor="bncc" className="block text-sm font-medium text-slate-700">Habilidade da BNCC (Opcional)</label>
                                        <input type="text" name="bncc" value={planFormData.bncc} onChange={handlePlanInputChange} placeholder="Ex: EF09HI01" className="mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" />
                                    </div>
                                    <div>
                                        <label htmlFor="detalhesAdicionais" className="block text-sm font-medium text-slate-700">Detalhes Adicionais</label>
                                        <textarea name="detalhesAdicionais" value={planFormData.detalhesAdicionais} onChange={handlePlanInputChange} rows={3} placeholder="Ex: A turma é muito participativa..." className="mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" />
                                    </div>
                                    <div>
                                        <label htmlFor="duracaoAula" className="block text-sm font-medium text-slate-700">Duração da Aula (minutos)</label>
                                        <select name="duracaoAula" value={planFormData.duracaoAula} onChange={handlePlanInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${planFormData.duracaoAula !== 'None' ? 'text-slate-900' : 'text-slate-400'}`}>
                                            <option value="None">Não especificar</option> <option value="30">30</option> <option value="45">45</option> <option value="50">50</option> <option value="90">90</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="metodologia" className="block text-sm font-medium text-slate-700">Metodologia</label>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <input 
                                                type="text" 
                                                name="metodologia" 
                                                value={planFormData.metodologia} 
                                                onChange={handlePlanInputChange} 
                                                placeholder="Será sugerido pela IA se deixado em branco" 
                                                className="block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400"
                                            />
                                            <button 
                                                type="button" 
                                                onClick={handleSuggestMethodology} 
                                                disabled={isSuggesting} 
                                                className="p-2 text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50 flex-shrink-0"
                                                aria-label="Sugerir metodologia com IA"
                                            >
                                                {isSuggesting ? <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div> : <SparklesIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center">
                                            <label className="block text-sm font-medium text-slate-700">Anexar material</label>
                                            {!file && (
                                                <label htmlFor="file-upload" className="flex items-center space-x-1 cursor-pointer text-sm font-medium text-cyan-600 hover:text-cyan-800">
                                                    <PaperclipIcon className="w-4 h-4" /> <span>Anexar</span>
                                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.docx,.txt" />
                                                </label>
                                            )}
                                        </div>
                                        {file && (
                                            <div className="mt-2 flex items-center justify-between bg-slate-100 p-2 rounded-md">
                                                <div className="flex items-center space-x-2 min-w-0">
                                                    <FileIcon className="w-5 h-5 text-slate-500" />
                                                    <span className="text-sm text-slate-700 truncate" title={file.name}>{file.name}</span>
                                                </div>
                                                <button onClick={handleRemoveFile} className="text-slate-500 hover:text-red-600 flex-shrink-0 ml-2"><XIcon className="w-4 h-4" /></button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        <input id="buscarNaWeb" name="buscarNaWeb" type="checkbox" checked={planFormData.buscarNaWeb} onChange={handlePlanInputChange} className="h-4 w-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500" />
                                        <label htmlFor="buscarNaWeb" className="ml-2 block text-sm text-slate-900">Buscar na Web</label>
                                    </div>
                                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-70 transition-all">
                                        {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Gerar Plano de Aula"}
                                    </button>
                                </form>
                            </div>
                            <div className={`w-full ${isFullscreen ? 'md:w-full' : 'md:w-2/3'} bg-white ${mobileView === 'viewer' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0`}>
                                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative m-6 mb-0 flex-shrink-0" role="alert"><span className="block sm:inline">{error}</span></div>}
                                {activePlan ? (
                                    <div className="flex flex-col h-full">
                                        {isFullscreen && <button onClick={handleToggleFullscreen} className="fixed top-4 right-4 z-50 p-2 bg-white rounded-full shadow-lg border text-slate-700 hover:bg-slate-50"><FullscreenExitIcon className="w-4 h-4" /></button>}
                                        <div className="p-6 pb-0 flex-shrink-0">
                                            <div className={isFullscreen ? 'hidden' : ''}>
                                                <div className="mb-4">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center min-w-0">
                                                            <button onClick={() => setMobileView('history')} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button>
                                                            <h2 className="text-2xl font-bold text-slate-800 truncate hidden md:block" title={activePlan.assunto}>{activePlan.assunto}</h2>
                                                        </div>
                                                        <div className="flex items-center space-x-2 flex-shrink-0">
                                                            {isEditing ? (
                                                                <>
                                                                    <div className="flex items-center justify-end w-32">
                                                                        <span className="text-sm text-slate-500 italic transition-opacity duration-300">
                                                                            {autoSaveStatus === 'saving' ? 'Salvando...' : 
                                                                            autoSaveStatus === 'saved' ? 'Salvo' : 
                                                                            'Modo de Edição'}
                                                                        </span>
                                                                    </div>
                                                                    <button onClick={handleSaveEdit} className="flex items-center justify-center p-2 rounded-full text-sm font-medium text-white bg-green-600 hover:bg-green-700 md:rounded-md md:px-3"><SaveIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Salvar</span></button>
                                                                    <button onClick={handleCancelEdit} className="flex items-center justify-center p-2 rounded-full border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:rounded-md md:px-3"><XIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Cancelar</span></button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={handleGenerateSummary} disabled={isGeneratingSummary || isEditing} className="flex items-center justify-center p-2 rounded-md text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 disabled:opacity-50 md:px-3" title="Gerar Resumo">
                                                                        {isGeneratingSummary ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <SparklesIcon className="w-4 h-4" />}
                                                                        <span className="hidden md:inline ml-2">Resumo</span>
                                                                    </button>
                                                                    <button onClick={handleStartEdit} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3"><EditIcon className="w-4 h-4"/> <span className="hidden md:inline ml-2">Editar</span></button>
                                                                    <button onClick={handleToggleFullscreen} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3">{isFullscreen ? <FullscreenExitIcon className="w-4 h-4" /> : <FullscreenEnterIcon className="w-4 h-4" />}<span className="hidden md:inline ml-2">{isFullscreen ? "Sair" : "Tela Cheia"}</span></button>
                                                                    <button onClick={handleOpenExportModal} disabled={isEditing} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3 disabled:opacity-50"><ExportIcon className="w-4 h-4" /><span className="hidden md:inline ml-2">Exportar</span></button>
                                                                    <button onClick={handleCopy} disabled={isEditing} className={`relative flex items-center justify-center p-2 rounded-md border text-sm font-medium bg-white hover:bg-slate-50 md:px-3 disabled:opacity-50 ${copySuccess ? 'border-green-500 text-green-600' : 'border-slate-300 text-slate-700'}`}>
                                                                        {copySuccess ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                                                                        <span className="hidden md:inline ml-2">{copySuccess ? "Copiado!" : "Copiar"}</span>
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="border-b border-slate-200">
                                                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                                        <button onClick={() => handleTabChange('plan')} className={`${activeTab === 'plan' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Plano de Aula</button>
                                                        {activePlan.summaryContent && <button onClick={() => handleTabChange('summary')} className={`${activeTab === 'summary' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Resumo</button>}
                                                    </nav>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-grow min-h-0 relative">
                                            {isEditing && (
                                                <>
                                                    <div ref={planToolbarRef} className="ql-toolbar ql-snow sticky top-0 bg-white z-10 p-2 border-b border-slate-200"></div>
                                                    <div ref={planEditorRef} className="p-6 h-full overflow-y-auto"></div>
                                                </>
                                            )}
                                            {!isEditing && (
                                                <div ref={viewerRef} className="ql-snow h-full overflow-y-auto">
                                                    <div className="ql-editor p-6">
                                                        <div dangerouslySetInnerHTML={{ __html: displayedContentInView }}></div>
                                                        {activePlan.sources && activePlan.sources.length > 0 && activeTab === 'plan' && (
                                                            <div className="mt-8 pt-4 border-t border-slate-200">
                                                                <h3 className="text-base font-bold text-slate-700 mb-3">Fontes da Web</h3>
                                                                <ul className="space-y-2 list-disc pl-5">
                                                                    {activePlan.sources.map((source, index) => (
                                                                        <li key={index} className="text-sm">
                                                                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline break-all">
                                                                                {source.title}
                                                                            </a>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                                        <BookOpenIcon className="w-16 h-16 text-slate-300 mb-4" />
                                        <h2 className="text-xl font-semibold text-slate-700">Selecione ou Crie um Plano de Aula</h2>
                                        <p className="text-slate-500 mt-2">Use o formulário à esquerda para gerar um novo plano ou selecione um existente no seu histórico.</p>
                                    </div>
                                )}
                            </div>
                        </main>
                    </>
                    )}
                    {activeSection === 'quiz' && (
                    <>
                        <aside className={`w-full md:w-1/4 bg-white border-r border-slate-200 p-4 flex-col ${mobileView === 'history' ? 'flex' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:flex'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h1 className="text-2xl font-bold text-slate-800">Provas</h1>
                                <button
                                    onClick={() => { setActiveQuizId(null); setQuizFormData(initialQuizFormData); handleRemoveFile(); setMobileView('form'); }}
                                    title="Gerar Nova Prova"
                                    className="text-cyan-600 hover:text-cyan-800 transition-transform transform hover:scale-110 md:hidden"
                                >
                                    <i className="fas fa-plus-circle fa-xl"></i>
                                </button>
                            </div>
                            <div className="relative mb-4">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon className="w-5 h-5 text-slate-400" /></span>
                                <input type="text" placeholder="Buscar por componente, ano..." value={quizSearchTerm} onChange={(e) => setQuizSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" aria-label="Buscar provas"/>
                            </div>
                            <div className="overflow-y-auto flex-grow">
                                {savedQuizzes.length === 0 ? <p className="text-slate-500">Nenhuma prova gerada.</p>
                                : filteredQuizzes.length === 0 ? <p className="text-slate-500">Nenhuma prova encontrada.</p>
                                : <ul>{filteredQuizzes.map(quiz => (
                                    <li key={quiz.id} className={`p-3 rounded-md mb-2 cursor-pointer transition-colors ${activeQuizId === quiz.id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`} onClick={() => selectQuiz(quiz.id)}>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-slate-700">{quiz.assunto}</p>
                                                <p className="text-sm text-slate-500">{quiz.componente} - {quiz.ano}</p>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(quiz.id) }} className="text-slate-400 hover:text-red-600 p-1 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </li>
                                ))}</ul>}
                            </div>
                        </aside>
                        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                            <div className={`w-full md:w-1/3 bg-slate-50 p-6 overflow-y-auto border-r border-slate-200 ${mobileView === 'form' ? 'block' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:block'}`}>
                                <div className="flex items-center mb-4">
                                    <button onClick={() => setMobileView('history')} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button>
                                    <h2 className="text-xl font-semibold text-slate-800">Gerar Nova Prova</h2>
                                </div>
                                <form onSubmit={handleQuizSubmit} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="quiz-componente" className="block text-sm font-medium text-slate-700">Componente</label>
                                            <select id="quiz-componente" name="componente" value={quizFormData.componente} onChange={handleQuizInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${quizFormData.componente ? 'text-slate-900' : 'text-slate-400'}`} required>
                                                <option value="" disabled>Selecione</option><option>Língua Portuguesa</option><option>Arte</option><option>Educação Física</option><option>Língua Inglesa</option><option>Matemática</option><option>Ciências</option><option>Geografia</option><option>História</option><option>Ensino Religioso</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="quiz-ano" className="block text-sm font-medium text-slate-700">Ano</label>
                                            <select id="quiz-ano" name="ano" value={quizFormData.ano} onChange={handleQuizInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${quizFormData.ano ? 'text-slate-900' : 'text-slate-400'}`} required>
                                                <option value="" disabled>Selecione</option><option>6º Ano</option><option>7º Ano</option><option>8º Ano</option><option>9º Ano</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="quiz-assunto" className="block text-sm font-medium text-slate-700">Assunto/Tópico</label>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <input type="text" id="quiz-assunto" name="assunto" value={quizFormData.assunto} onChange={handleQuizInputChange} placeholder="Ex: Ecossistemas brasileiros" className="block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" required />
                                            <button type="button" onClick={handleSuggestQuizTopics} disabled={isSuggestingTopic} className="p-2 text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50 flex-shrink-0" aria-label="Sugerir tópico com IA">
                                                {isSuggestingTopic ? <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div> : <SparklesIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Tipos de Questão</label>
                                        <div className="mt-2 space-x-4 flex">
                                            <div className="flex items-center"><input id="multipla" value="multipla" name="tiposQuestao" type="checkbox" checked={quizFormData.tiposQuestao.includes('multipla')} onChange={handleQuizInputChange} className="h-4 w-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500" /><label htmlFor="multipla" className="ml-2 block text-sm text-slate-900">Múltipla Escolha</label></div>
                                            <div className="flex items-center"><input id="discursiva" value="discursiva" name="tiposQuestao" type="checkbox" checked={quizFormData.tiposQuestao.includes('discursiva')} onChange={handleQuizInputChange} className="h-4 w-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500" /><label htmlFor="discursiva" className="ml-2 block text-sm text-slate-900">Discursiva</label></div>
                                        </div>
                                    </div>
                                    {quizFormData.tiposQuestao.includes('multipla') && (
                                        <div>
                                            <label htmlFor="numQuestoesMultipla" className="flex justify-between text-sm font-medium text-slate-700"><span>Múltipla Escolha</span> <span className="font-bold text-cyan-700">{quizFormData.numQuestoesMultipla}</span></label>
                                            <input id="numQuestoesMultipla" name="numQuestoesMultipla" type="range" min="0" max="50" value={quizFormData.numQuestoesMultipla} onChange={handleQuizInputChange} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer range-thumb mt-4" />
                                        </div>
                                    )}
                                    {quizFormData.tiposQuestao.includes('discursiva') && (
                                        <div>
                                            <label htmlFor="numQuestoesDiscursiva" className="flex justify-between text-sm font-medium text-slate-700"><span>Discursivas</span> <span className="font-bold text-cyan-700">{quizFormData.numQuestoesDiscursiva}</span></label>
                                            <input id="numQuestoesDiscursiva" name="numQuestoesDiscursiva" type="range" min="0" max="20" value={quizFormData.numQuestoesDiscursiva} onChange={handleQuizInputChange} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer range-thumb mt-4" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="flex justify-between items-center"><label className="block text-sm font-medium text-slate-700">Anexar material de apoio</label>{!file && (<label htmlFor="file-upload-quiz" className="flex items-center space-x-1 cursor-pointer text-sm font-medium text-cyan-600 hover:text-cyan-800"><PaperclipIcon className="w-4 h-4" /><span>Anexar</span><input id="file-upload-quiz" name="file-upload-quiz" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.docx,.txt" /></label>)}</div>
                                        {file && (<div className="mt-2 flex items-center justify-between bg-slate-100 p-2 rounded-md"><div className="flex items-center space-x-2 min-w-0"><FileIcon className="w-5 h-5 text-slate-500" /><span className="text-sm text-slate-700 truncate" title={file.name}>{file.name}</span></div><button onClick={handleRemoveFile} className="text-slate-500 hover:text-red-600 flex-shrink-0 ml-2"><XIcon className="w-4 h-4" /></button></div>)}
                                    </div>
                                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-70 transition-all">{isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Gerar Prova"}</button>
                                </form>
                            </div>
                            <div className={`w-full ${isFullscreen ? 'md:w-full' : 'md:w-2/3'} bg-white ${mobileView === 'viewer' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0`}>
                                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative m-6 mb-0 flex-shrink-0" role="alert"><span className="block sm:inline">{error}</span></div>}
                                {activeQuiz ? (
                                    <div className="flex flex-col h-full">
                                        {isFullscreen && <button onClick={handleToggleFullscreen} className="fixed top-4 right-4 z-50 p-2 bg-white rounded-full shadow-lg border text-slate-700 hover:bg-slate-50"><FullscreenExitIcon className="w-4 h-4" /></button>}
                                        <div className="p-6 pb-0 flex-shrink-0">
                                            <div className={isFullscreen ? 'hidden' : ''}>
                                                <div className="flex justify-between items-center mb-4">
                                                    <div className="flex items-center min-w-0"><button onClick={() => setMobileView('history')} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button><h2 className="text-2xl font-bold text-slate-800 truncate" title={activeQuiz.assunto}>{activeQuiz.assunto}</h2></div>
                                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                                        {isEditing ? (
                                                            <>
                                                                <div className="flex items-center justify-end w-32">
                                                                    <span className="text-sm text-slate-500 italic transition-opacity duration-300">
                                                                        {autoSaveStatus === 'saving' ? 'Salvando...' : 
                                                                        autoSaveStatus === 'saved' ? 'Salvo' : 
                                                                        'Modo de Edição'}
                                                                    </span>
                                                                </div>
                                                                <button onClick={handleSaveEdit} className="flex items-center justify-center p-2 rounded-full text-sm font-medium text-white bg-green-600 hover:bg-green-700 md:rounded-md md:px-3"><SaveIcon className="w-4 h-4" /><span className="hidden md:inline ml-2">Salvar</span></button>
                                                                <button onClick={handleCancelEdit} className="flex items-center justify-center p-2 rounded-full border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:rounded-md md:px-3"><XIcon className="w-4 h-4" /><span className="hidden md:inline ml-2">Cancelar</span></button>
                                                            </>
                                                        ) : (
                                                            <><button onClick={handleStartEdit} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3"><EditIcon className="w-4 h-4"/><span className="hidden md:inline ml-2">Editar</span></button><button onClick={handleToggleFullscreen} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3">{isFullscreen ? <FullscreenExitIcon className="w-4 h-4" /> : <FullscreenEnterIcon className="w-4 h-4" />}<span className="hidden md:inline ml-2">{isFullscreen ? "Sair" : "Tela Cheia"}</span></button><button onClick={handleOpenExportModal} disabled={isEditing} className="flex items-center justify-center p-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 md:px-3 disabled:opacity-50"><ExportIcon className="w-4 h-4" /><span className="hidden md:inline ml-2">Exportar</span></button><button onClick={handleCopy} disabled={isEditing} className={`relative flex items-center justify-center p-2 rounded-md border text-sm font-medium bg-white hover:bg-slate-50 md:px-3 disabled:opacity-50 ${copySuccess ? 'border-green-500 text-green-600' : 'border-slate-300 text-slate-700'}`}>{copySuccess ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}<span className="hidden md:inline ml-2">{copySuccess ? "Copiado!" : "Copiar"}</span></button></>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-grow min-h-0 relative">
                                            {isEditing && (<><div ref={quizToolbarRef} className="ql-toolbar ql-snow sticky top-0 bg-white z-10 p-2 border-b border-slate-200"></div><div ref={quizEditorRef} className="p-6 h-full overflow-y-auto"></div></>)}
                                            {!isEditing && (<div ref={viewerRef} className="ql-snow h-full overflow-y-auto"><div className="ql-editor p-6" dangerouslySetInnerHTML={{ __html: displayedContentInView }}></div></div>)}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6"><QuizIcon className="w-16 h-16 text-slate-300 mb-4" /><h2 className="text-xl font-semibold text-slate-700">Selecione ou Crie uma Prova</h2><p className="text-slate-500 mt-2">Use o formulário à esquerda para gerar uma nova prova ou selecione uma existente no seu histórico.</p></div>
                                )}
                            </div>
                        </main>
                    </>
                    )}
                    {activeSection === 'crossword' && (
                    <>
                        <aside className={`w-full md:w-1/4 bg-white border-r border-slate-200 p-4 flex-col ${mobileView === 'history' ? 'flex' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:flex'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h1 className="text-2xl font-bold text-slate-800">Palavra Cruzada</h1>
                                <button
                                    onClick={() => { setActiveCrosswordId(null); setCrosswordFormData(initialCrosswordFormData); handleRemoveFile(); setGeneratedPuzzle(null); setMobileView('form'); }}
                                    title="Gerar Nova Palavra Cruzada"
                                    className="text-cyan-600 hover:text-cyan-800 transition-transform transform hover:scale-110 md:hidden"
                                >
                                    <i className="fas fa-plus-circle fa-xl"></i>
                                </button>
                            </div>
                            <div className="relative mb-4">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon className="w-5 h-5 text-slate-400" /></span>
                                <input type="text" placeholder="Buscar por componente, ano..." value={crosswordSearchTerm} onChange={(e) => setCrosswordSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400" aria-label="Buscar palavra cruzada"/>
                            </div>
                            <div className="overflow-y-auto flex-grow">
                                {savedCrosswords.length === 0 ? <p className="text-slate-500">Nenhuma cruzada salva.</p>
                                : filteredCrosswords.length === 0 ? <p className="text-slate-500">Nenhuma cruzada encontrada.</p>
                                : <ul>{filteredCrosswords.map(cw => (
                                    <li key={cw.id} className={`p-3 rounded-md mb-2 cursor-pointer transition-colors ${activeCrosswordId === cw.id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`} onClick={() => selectCrossword(cw.id)}>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-slate-700">{cw.topic}</p>
                                                <p className="text-sm text-slate-500">{cw.curricularComponent} - {cw.schoolYear}</p>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteCrossword(cw.id) }} className="text-slate-400 hover:text-red-600 p-1 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </li>
                                ))}</ul>}
                            </div>
                        </aside>
                        <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                            <div className={`w-full md:w-1/3 bg-slate-50 p-6 overflow-y-auto border-r border-slate-200 ${mobileView === 'form' ? 'block' : 'hidden'} ${isFullscreen ? 'md:hidden' : 'md:block'}`}>
                                <div className="flex items-center mb-4">
                                    <button onClick={() => setMobileView('history')} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button>
                                    <h2 className="text-xl font-semibold text-slate-800">Gerar Palavra Cruzada</h2>
                                </div>
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="crossword-curricularComponent" className="block text-sm font-medium text-slate-700">Componente</label>
                                            <select id="crossword-curricularComponent" name="curricularComponent" value={crosswordFormData.curricularComponent} onChange={handleCrosswordInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${crosswordFormData.curricularComponent ? 'text-slate-900' : 'text-slate-400'}`} required>
                                                <option value="" disabled>Selecione</option><option>Língua Portuguesa</option><option>Arte</option><option>Educação Física</option><option>Língua Inglesa</option><option>Matemática</option><option>Ciências</option><option>Geografia</option><option>História</option><option>Ensino Religioso</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="crossword-schoolYear" className="block text-sm font-medium text-slate-700">Ano</label>
                                            <select id="crossword-schoolYear" name="schoolYear" value={crosswordFormData.schoolYear} onChange={handleCrosswordInputChange} className={`mt-1 block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm ${crosswordFormData.schoolYear ? 'text-slate-900' : 'text-slate-400'}`} required>
                                                <option value="" disabled>Selecione</option><option>6º Ano</option><option>7º Ano</option><option>8º Ano</option><option>9º Ano</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="crossword-topic" className="block text-sm font-medium text-slate-700">Tema</label>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <input
                                                type="text"
                                                id="crossword-topic"
                                                name="topic"
                                                placeholder="Será sugerido pela IA se deixado em branco"
                                                value={crosswordFormData.topic}
                                                onChange={handleCrosswordInputChange}
                                                disabled={isAiLoading}
                                                className="block w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm placeholder:text-slate-400"
                                                onKeyPress={(e) => e.key === 'Enter' && handleAiGenerateCrossword()}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAiGenerateCrossword}
                                                disabled={isAiLoading}
                                                className="p-2 text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50 flex-shrink-0"
                                                aria-label="Gerar palavras com IA"
                                            >
                                                {isAiLoading ? <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div> : <MoonIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center"><label className="block text-sm font-medium text-slate-700">Anexar material de apoio</label>{!file && (<label htmlFor="file-upload-crossword" className="flex items-center space-x-1 cursor-pointer text-sm font-medium text-cyan-600 hover:text-cyan-800"><PaperclipIcon className="w-4 h-4" /><span>Anexar</span><input id="file-upload-crossword" name="file-upload-crossword" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.docx" /></label>)}</div>
                                        {file && (<div className="mt-2 flex items-center justify-between bg-slate-100 p-2 rounded-md"><div className="flex items-center space-x-2 min-w-0"><FileIcon className="w-5 h-5 text-slate-500" /><span className="text-sm text-slate-700 truncate" title={file.name}>{file.name}</span></div><button onClick={handleRemoveFile} className="text-slate-500 hover:text-red-600 flex-shrink-0 ml-2"><XIcon className="w-4 h-4" /></button></div>)}
                                    </div>
                                    <div>
                                        <label htmlFor="word-count-slider" className="flex justify-between text-sm font-medium text-slate-700"><span>Número de Palavras</span><span className="font-bold text-cyan-700">{crosswordFormData.wordCount}</span></label>
                                        <input id="word-count-slider" type="range" min="0" max="20" value={crosswordFormData.wordCount} onChange={(e) => handleWordCountChange(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer range-thumb mt-4" />
                                    </div>
                                    {crosswordFormData.wordCount > 0 && (
                                        <div className="border-t border-slate-200 pt-4">
                                            <h3 className="text-sm font-semibold text-slate-600 mb-2">Insira as Palavras e Dicas</h3>
                                            <div className="space-y-3 max-h-[25vh] overflow-y-auto pr-2">
                                                {crosswordFormData.wordEntries.map((entry, index) => (
                                                    <div key={index} className="grid grid-cols-1 gap-2">
                                                        <input type="text" placeholder={`Palavra ${index + 1}`} value={entry.word} onChange={(e) => handleEntryChange(index, 'word', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 text-sm" />
                                                        <input type="text" placeholder={`Dica ${index + 1}`} value={entry.clue} onChange={(e) => handleEntryChange(index, 'clue', e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 text-sm" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button onClick={handleGeneratePuzzle} disabled={isLoading || isAiLoading || crosswordFormData.wordEntries.filter(e => e.word && e.clue).length === 0} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-70 transition-all">{isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Gerar Palavras Cruzadas'}</button>
                                    {generationError && <p className="text-red-600 mt-2 text-sm">{generationError}</p>}
                                </form>
                            </div>
                            <div className={`w-full ${isFullscreen ? 'md:w-full' : 'md:w-2/3'} bg-white ${mobileView === 'viewer' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-h-0`}>
                                { (generatedPuzzle || activeCrossword) ? (
                                    <CrosswordViewer
                                        puzzleData={generatedPuzzle ? { ...crosswordFormData, ...generatedPuzzle } : activeCrossword!}
                                        onExport={handleOpenExportModal}
                                        isFullscreen={isFullscreen}
                                        onToggleFullscreen={handleToggleFullscreen}
                                        onMobileBack={() => setMobileView('history')}
                                        isEditing={isEditingCrossword}
                                        editedClues={editedClues}
                                        onStartEdit={handleStartEditCrossword}
                                        onCancelEdit={handleCancelEditCrossword}
                                        onSaveEdit={handleSaveCrosswordEdit}
                                        onClueChange={handleClueChange}
                                    />
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6"><CrosswordIcon className="w-16 h-16 text-slate-300 mb-4" /><h2 className="text-xl font-semibold text-slate-700">Selecione ou Crie uma Palavra Cruzada</h2><p className="text-slate-500 mt-2">Use o formulário para gerar um novo puzzle ou selecione um existente no seu histórico.</p></div>
                                )}
                            </div>
                        </main>
                    </>
                    )}
                    {activeSection === 'management' && (
                        <Management 
                            schoolsData={schoolsData} 
                            setSchoolsData={setSchoolsData}
                            onBack={() => setActiveSection('plan')} 
                            selectedSchool={selectedSchool}
                            setSelectedSchool={setSelectedSchool}
                            selectedDiscipline={selectedDiscipline}
                            setSelectedDiscipline={setSelectedDiscipline}
                        />
                    )}
                </div>
            </div>
            {isExportModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Exportar Documento</h3>
                            <button onClick={handleCloseExportModal} className="p-1 rounded-full text-slate-400 hover:bg-slate-100"><XIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Formato do Arquivo</label>
                                <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-md">
                                    <button onClick={() => setExportFormat('pdf')} className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-colors ${exportFormat === 'pdf' ? 'bg-white text-cyan-700 shadow' : 'text-slate-600 hover:bg-white/50'}`}>
                                        PDF
                                    </button>
                                    <button onClick={() => setExportFormat('docx')} className={`w-1/2 py-2 text-sm font-semibold rounded-md transition-colors ${exportFormat === 'docx' ? 'bg-white text-cyan-700 shadow' : 'text-slate-600 hover:bg-white/50'}`}>
                                        Word (.docx)
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="filename" className="block text-sm font-medium text-slate-700 mb-1">Nome do Arquivo</label>
                                <input type="text" id="filename" value={exportFilename} onChange={(e) => setExportFilename(e.target.value)} className="w-full px-3 py-2.5 border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm" />
                            </div>
                            {activeSection === 'plan' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Seções para incluir</label>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    {LESSON_PLAN_SECTIONS.map(section => (
                                        <div key={section} className="flex items-center"><input id={`sec-${section}`} type="checkbox" checked={sectionsToExport[section]} onChange={() => handleSectionToggle(section)} className="h-4 w-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500" /><label htmlFor={`sec-${section}`} className="ml-2 text-slate-700">{section}</label></div>
                                    ))}
                                </div>
                                <div className="flex justify-between mt-3 text-xs">
                                    <button onClick={() => handleToggleAllSections(true)} className="font-medium text-cyan-600 hover:underline">Selecionar Todos</button>
                                    <button onClick={() => handleToggleAllSections(false)} className="font-medium text-cyan-600 hover:underline">Limpar Seleção</button>
                                </div>
                            </div>
                            )}
                            <div className="flex justify-end space-x-3 pt-2">
                                <button onClick={handleCloseExportModal} className="py-2 px-4 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">Cancelar</button>
                                <button onClick={handleConfirmExport} className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700">Confirmar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const RoleSelectionScreen: React.FC<{ onSelectRole: (role: 'teacher' | 'student') => void }> = ({ onSelectRole }) => (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <PencilIcon className="w-16 h-16 text-cyan-500 mb-6" />
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Bem-vindo ao SIGA</h1>
        <p className="text-slate-600 mb-8">Selecione seu perfil para continuar.</p>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <button onClick={() => onSelectRole('teacher')} className="w-full text-center py-4 px-6 bg-cyan-600 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-700 transition-all transform hover:-translate-y-1">
                Sou Professor
            </button>
            <button onClick={() => onSelectRole('student')} className="w-full text-center py-4 px-6 bg-slate-700 text-white font-semibold rounded-lg shadow-md hover:bg-slate-800 transition-all transform hover:-translate-y-1">
                Sou Aluno
            </button>
        </div>
    </div>
);

const StudentLoginScreen: React.FC<{
    schoolsData: SchoolsData;
    onLogin: (details: { school: string; discipline: string; studentName: string }) => void;
    onBack: () => void;
}> = ({ schoolsData, onLogin, onBack }) => {
    const [selectedSchool, setSelectedSchool] = useState('');
    const [selectedDiscipline, setSelectedDiscipline] = useState('');
    const [selectedStudentName, setSelectedStudentName] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [error, setError] = useState('');

    const disciplines = selectedSchool ? Object.keys(schoolsData[selectedSchool]?.disciplinas || {}) : [];
    const students = selectedSchool && selectedDiscipline ? schoolsData[selectedSchool].disciplinas[selectedDiscipline]?.alunos || [] : [];

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSchool || !selectedDiscipline || !selectedStudentName) {
            setError('Por favor, selecione todas as opções.');
            return;
        }

        const student = schoolsData[selectedSchool]
            ?.disciplinas[selectedDiscipline]
            ?.alunos.find(s => s.nome === selectedStudentName);

        if (student && student.accessCode) {
            if (accessCode.toUpperCase() === student.accessCode) {
                setError('');
                onLogin({ school: selectedSchool, discipline: selectedDiscipline, studentName: selectedStudentName });
            } else {
                setError('Código de acesso inválido.');
            }
        } else if (student) {
            setError('');
            onLogin({ school: selectedSchool, discipline: selectedDiscipline, studentName: selectedStudentName });
        } else {
            setError('Aluno não encontrado.');
        }
    };

    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-100 p-4 relative">
             <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold">
                <ArrowLeftIcon className="w-5 h-5"/>
                Voltar
            </button>
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Acesso do Aluno</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="school-select" className="block text-sm font-medium text-slate-700">Escola</label>
                        <select id="school-select" value={selectedSchool} onChange={e => { setSelectedSchool(e.target.value); setSelectedDiscipline(''); setSelectedStudentName(''); }} className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500" required>
                            <option value="">Selecione sua escola</option>
                            {Object.keys(schoolsData).map(school => <option key={school} value={school}>{school}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="discipline-select" className="block text-sm font-medium text-slate-700">Turma</label>
                        <select id="discipline-select" value={selectedDiscipline} onChange={e => { setSelectedDiscipline(e.target.value); setSelectedStudentName(''); }} className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500" disabled={!selectedSchool} required>
                            <option value="">Selecione sua turma</option>
                            {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="student-select" className="block text-sm font-medium text-slate-700">Seu Nome</label>
                        <select id="student-select" value={selectedStudentName} onChange={e => setSelectedStudentName(e.target.value)} className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500" disabled={!selectedDiscipline} required>
                            <option value="">Selecione seu nome</option>
                            {students.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="access-code" className="block text-sm font-medium text-slate-700">Código de Acesso</label>
                        <input
                            type="text"
                            id="access-code"
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 uppercase placeholder:normal-case"
                            placeholder="Peça ao seu professor"
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm text-center">{error}</p>}
                    <button type="submit" className="w-full text-center py-3 px-6 bg-cyan-600 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-700 transition-all">
                        Entrar
                    </button>
                    <p className="text-xs text-slate-400 text-center pt-2">
                        Se nenhum código foi gerado para você, o campo pode ser deixado em branco.
                    </p>
                </form>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    // Auth and Role State
    const [role, setRole] = useState<'teacher' | 'student' | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(false);
    const [isOnline, setIsOnline] = useState(true);

    // Student Login State
    const [studentDetails, setStudentDetails] = useState<{ school: string; discipline: string; studentName: string } | null>(null);

    // Teacher Data State (now from Firestore)
    const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
    const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>([]);
    const [savedCrosswords, setSavedCrosswords] = useState<SavedCrossword[]>([]);
    const [schoolsData, setSchoolsData] = useState<SchoolsData>({}); // Teacher's own schools
    const [selectedSchool, setSelectedSchool] = useState<string>('');
    const [selectedDiscipline, setSelectedDiscipline] = useState<string>('');
    
    // Public Data State (for student login)
    const [allSchoolsData, setAllSchoolsData] = useState<SchoolsData>({});

    // Debounce refs for saving data
    // FIX: Replaced NodeJS.Timeout with `number` for browser compatibility, as `setTimeout` in the browser returns a number.
    const saveTimeoutRef = useRef<number | null>(null);

    // Firestore listener unsubscribe function
    const firestoreListenerUnsubscribeRef = useRef<(() => void) | null>(null);


    // Fetch all schools data for student login once on mount
    useEffect(() => {
        getAllSchools().then(setAllSchoolsData).catch(console.error);
    }, []);

    // Auth state listener and Firestore connection listener
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Clean up previous Firestore listener if it exists
            if (firestoreListenerUnsubscribeRef.current) {
                firestoreListenerUnsubscribeRef.current();
                firestoreListenerUnsubscribeRef.current = null;
            }

            setUser(currentUser);
            if (currentUser) {
                setRole('teacher');
                setDataLoading(true);

                // Set up a listener on the user's document to detect connection status
                const userDocRef = doc(db, 'users', currentUser.uid);
                firestoreListenerUnsubscribeRef.current = onSnapshot(userDocRef, 
                    (snapshot) => {
                        const isFromCache = snapshot.metadata.fromCache;
                        setIsOnline(!isFromCache);
                    },
                    (error) => {
                        console.error("Firestore snapshot error:", error);
                        setIsOnline(false); // Assume offline on error
                    }
                );
                
                try {
                    const [userData, teacherSchools] = await Promise.all([
                        getUserData(currentUser.uid),
                        getSchoolsForTeacher(currentUser.uid)
                    ]);

                    setLessonPlans(userData?.lessonPlans || []);
                    setSavedQuizzes(userData?.savedQuizzes || []);
                    setSavedCrosswords(userData?.savedCrosswords || []);
                    setSchoolsData(teacherSchools || {});
                    setSelectedSchool(userData?.selectedSchool || '');
                    setSelectedDiscipline(userData?.selectedDiscipline || '');
                } catch (error) {
                    console.error("Error fetching user data from Firestore:", error);
                } finally {
                    setDataLoading(false);
                }
            } else {
                setRole(null);
                setStudentDetails(null);
                setIsOnline(true); // Default to online when logged out
                // Clear teacher-specific data on logout
                setLessonPlans([]);
                setSavedQuizzes([]);
                setSavedCrosswords([]);
                setSchoolsData({});
                setSelectedSchool('');
                setSelectedDiscipline('');
            }
            setAuthLoading(false);
        });

        return () => {
             unsubscribeAuth();
             if (firestoreListenerUnsubscribeRef.current) {
                firestoreListenerUnsubscribeRef.current();
            }
        };
    }, []);

    // Debounced effect to save user data fields to Firestore
    useEffect(() => {
        if (!user || dataLoading) return;

        const dataToSave = {
            lessonPlans,
            savedQuizzes,
            savedCrosswords,
            selectedSchool,
            selectedDiscipline,
        };

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // FIX: Explicitly use `window.setTimeout` to resolve TypeScript type conflict.
        saveTimeoutRef.current = window.setTimeout(() => {
            Object.entries(dataToSave).forEach(([key, value]) => {
                updateUserField(user.uid, key, value).catch(console.error);
            });
        }, 1500); // Debounce saves by 1.5 seconds

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [lessonPlans, savedQuizzes, savedCrosswords, selectedSchool, selectedDiscipline, user, dataLoading]);

    // Debounced effect to save school data to Firestore
    useEffect(() => {
         if (!user || dataLoading) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // FIX: Explicitly use `window.setTimeout` to resolve TypeScript type conflict.
        saveTimeoutRef.current = window.setTimeout(() => {
            saveSchoolsForUser(user.uid, schoolsData).catch(console.error);
            // Also refresh allSchoolsData for consistency after a save
            getAllSchools().then(setAllSchoolsData).catch(console.error);
        }, 2000); // A slightly longer debounce for potentially larger school data

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [schoolsData, user, dataLoading]);


    const handleSelectRole = (selectedRole: 'teacher' | 'student') => {
        setRole(selectedRole);
    };

    const handleStudentLogin = (details: { school: string; discipline: string; studentName: string }) => {
        setStudentDetails(details);
        setUser(null);
    };

    const handleLogout = async () => {
        if (user) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
            }
        }
        setUser(null);
        setRole(null);
        setStudentDetails(null);
    };

    if (authLoading || (user && dataLoading)) {
        return (
            <div className="w-full h-screen flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (user) {
        return (
            <TeacherView 
                user={user} 
                onLogout={handleLogout}
                isOnline={isOnline}
                lessonPlans={lessonPlans}
                setLessonPlans={setLessonPlans}
                savedQuizzes={savedQuizzes}
                setSavedQuizzes={setSavedQuizzes}
                savedCrosswords={savedCrosswords}
                setSavedCrosswords={setSavedCrosswords}
                schoolsData={schoolsData}
                setSchoolsData={setSchoolsData}
                selectedSchool={selectedSchool}
                setSelectedSchool={setSelectedSchool}
                selectedDiscipline={selectedDiscipline}
                setSelectedDiscipline={setSelectedDiscipline}
            />
        );
    }

    if (role === 'teacher') {
        return <TeacherLoginScreen onBack={() => setRole(null)} />;
    }

    if (role === 'student') {
        if (studentDetails) {
            return <StudentView schoolsData={allSchoolsData} studentDetails={studentDetails} onLogout={handleLogout} />;
        }
        return <StudentLoginScreen schoolsData={allSchoolsData} onLogin={handleStudentLogin} onBack={() => setRole(null)} />;
    }

    return <RoleSelectionScreen onSelectRole={handleSelectRole} />;
};

export default App;