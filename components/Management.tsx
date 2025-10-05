import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SchoolsData, Student } from '../types';
import { UserPlusIcon, UploadIcon, FilePdfIcon, FileImageIcon, XIcon, ArrowLeftIcon, ClockIcon, EditIcon, KeyIcon, CopyIcon, CheckIcon, UserMinusIcon } from './icons';
import { extractStudentNames } from '../services/geminiService';

const initialFormData = {
    escola: '', componente: '', etapa: '',
    modalidade: '', turma: '', serie: '', turno: ''
};

const initialScheduleFormData = {
    selectedClass: '',
    schedule: {} as { [day: string]: { [period: number]: boolean } }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Componente isolado para o campo de nome editável, garantindo que o cursor não se perca.
const EditableStudentName: React.FC<{
    studentName: string;
    onBlur: (newName: string) => void;
}> = React.memo(({ studentName, onBlur }) => {
    const divRef = useRef<HTMLDivElement>(null);

    // Efeito para sincronizar o conteúdo do div com o estado do pai,
    // mas apenas quando o campo não está focado para não interromper a edição.
    useEffect(() => {
        if (divRef.current && document.activeElement !== divRef.current) {
            divRef.current.textContent = studentName;
        }
    }, [studentName]);

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const newName = e.currentTarget.textContent || '';
        // Só chama a função de salvar se o nome realmente mudou.
        if (newName.trim() !== studentName) {
            onBlur(newName.trim());
        } else if (newName !== studentName) { // Reverte se apenas espaços em branco foram adicionados/removidos.
            e.currentTarget.textContent = studentName;
        }
    };

    return (
        <div
            ref={divRef}
            contentEditable={true}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                }
            }}
            onBlur={handleBlur}
            suppressContentEditableWarning={true}
            className="w-full bg-transparent p-0 text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:bg-slate-50 rounded-md px-1 py-0.5"
            data-placeholder="Nome do aluno"
        />
    );
});


interface ManagementProps {
  onBack: () => void;
  schoolsData: SchoolsData;
  setSchoolsData: React.Dispatch<React.SetStateAction<SchoolsData>>;
  selectedSchool: string;
  setSelectedSchool: React.Dispatch<React.SetStateAction<string>>;
  selectedDiscipline: string;
  setSelectedDiscipline: React.Dispatch<React.SetStateAction<string>>;
}

export const Management: React.FC<ManagementProps> = ({ 
    onBack, 
    schoolsData, 
    setSchoolsData,
    selectedSchool,
    setSelectedSchool,
    selectedDiscipline,
    setSelectedDiscipline 
}) => {
    // --- STATE MANAGEMENT ---
    const [isCreationVisible, setIsCreationVisible] = useState(false);
    const [creationStep, setCreationStep] = useState(1); // 1 for class creation, 2 for scheduling
    
    // Form state for creation/editing
    const [formData, setFormData] = useState(initialFormData);
    const [scheduleFormData, setScheduleFormData] = useState(initialScheduleFormData);

    // Editing State
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [editingTarget, setEditingTarget] = useState<{ school: string; discipline?: string } | null>(null);

    // UI state for management
    const [selectedStudentIndex, setSelectedStudentIndex] = useState<number | null>(null);
    const [menuState, setMenuState] = useState({ category: 'Notas', bim: 0, view: 'all' });
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [activeMenuPath, setActiveMenuPath] = useState<string[]>([]);
    const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
    const [editingRecuperacao, setEditingRecuperacao] = useState<Record<string, string>>({});
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [isCodeModalVisible, setIsCodeModalVisible] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [menuPositionClass, setMenuPositionClass] = useState('left-0');
    const [viewedDate, setViewedDate] = useState(new Date());


    // Refs
    const periodInputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<any>(null);
    const menuContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // --- DATA PERSISTENCE (Now handled by App.tsx) ---

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    // --- EFFECT FOR LIBRARIES ---
    useEffect(() => {
        let picker: any = null;
        if (periodInputRef.current && window.Litepicker) {
            picker = new window.Litepicker({
                element: periodInputRef.current,
                singleMode: false,
                numberOfMonths: isMobile ? 1 : 2,
                numberOfColumns: isMobile ? 1 : 2,
                mobileFriendly: true,
                format: 'DD/MM/YYYY',
                lang: 'pt-BR',
                i18n: { 'pt-BR': { button: 'Aplicar', previousMonth: '<i class="fas fa-chevron-left"></i>', nextMonth: '<i class="fas fa-chevron-right"></i>', months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'], weekdays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] } },
                tooltipText: { one: 'dia', other: 'dias' }
            });
            pickerRef.current = picker;
        }
        return () => {
            picker?.destroy();
            pickerRef.current = null;
        };
    }, [isCreationVisible, isMobile]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
                setIsMenuVisible(false);
                setActiveMenuPath([]);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isMenuVisible && menuContainerRef.current) {
            const buttonRect = menuContainerRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const estimatedMenuWidth = isMobile ? 256 : 48 * 12; // w-64 for mobile, w-48 * 3 levels for desktop

            if (buttonRect.left + estimatedMenuWidth > viewportWidth) {
                setMenuPositionClass('right-0');
            } else {
                setMenuPositionClass('left-0');
            }
        }
    }, [isMenuVisible, isMobile]);


    // --- HELPERS ---
    const calculateAverage = useCallback((notes: (number | null)[] | undefined) => {
        const validNotes = (notes || []).filter(note => note !== null && note !== undefined && String(note).trim() !== '');
        if (validNotes.length === 0) return '-';
        const sum = validNotes.reduce((acc, note) => acc + parseFloat(String(note)), 0);
        return (sum / validNotes.length).toFixed(1);
    }, []);

    // --- EVENT HANDLERS ---
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        const finalValue = id === 'escola' ? value.toUpperCase() : value;
        setFormData(prev => ({ ...prev, [id]: finalValue }));
    };
    
    const handleScheduleFormChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setScheduleFormData(prev => ({ ...prev, selectedClass: e.target.value }));
    };

    const handleScheduleCheckboxChange = (day: string, period: number) => {
        setScheduleFormData(prev => {
            const newSchedule = { ...prev.schedule };
            if (!newSchedule[day]) newSchedule[day] = {};
            newSchedule[day][period] = !newSchedule[day][period];
            return { ...prev, schedule: newSchedule };
        });
    };
    
    const handleCancelEdit = () => {
        setIsCreationVisible(false);
        setIsEditingMode(false);
        setEditingTarget(null);
        setFormData(initialFormData);
        setScheduleFormData(initialScheduleFormData);
        setCreationStep(1);
        if (pickerRef.current) {
            pickerRef.current.clearSelection();
        }
    };

    const handleSaveSchedule = () => {
        const { selectedClass, schedule } = scheduleFormData;
        if (!selectedClass) return;

        const [schoolName, ...disciplineParts] = selectedClass.split(' - ');
        const disciplineName = disciplineParts.join(' - ');

        const finalSchedule: { [day: string]: number[] } = {};
        Object.entries(schedule).forEach(([day, periods]) => {
            const activePeriods = Object.entries(periods)
                .filter(([, isActive]) => isActive)
                .map(([period]) => parseInt(period, 10));
            if (activePeriods.length > 0) {
                finalSchedule[day] = activePeriods.sort((a,b) => a-b);
            }
        });

        setSchoolsData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            if (newData[schoolName]?.disciplinas[disciplineName]) {
                newData[schoolName].disciplinas[disciplineName].schedule = finalSchedule;
            }
            return newData;
        });

        handleCancelEdit();
    };

    const handleSaveClass = () => {
        const { escola, componente, serie, turma, turno, etapa, modalidade } = formData;
        const newClassDescription = `${componente} - ${serie} ${turma} - ${turno}`;

        if (isEditingMode && editingTarget) {
            const oldSchool = editingTarget.school;
            const newSchoolName = formData.escola;
            
            // --- Editing School Logic ---
            if (!editingTarget.discipline) {
                if (!newSchoolName.trim()) return;
                
                setSchoolsData(prev => {
                    const newData = JSON.parse(JSON.stringify(prev));
                    if (oldSchool !== newSchoolName && newData[oldSchool] && !newData[newSchoolName]) {
                        newData[newSchoolName] = newData[oldSchool];
                        delete newData[oldSchool];
                    }
                    const schoolToUpdate = newData[newSchoolName] || newData[oldSchool];
                    const startDate = pickerRef.current?.getStartDate();
                    const endDate = pickerRef.current?.getEndDate();
                    schoolToUpdate.schoolYearStart = startDate ? startDate.dateInstance.toISOString() : undefined;
                    schoolToUpdate.schoolYearEnd = endDate ? endDate.dateInstance.toISOString() : undefined;
                    return newData;
                });
                if (oldSchool !== newSchoolName) {
                    setSelectedSchool(newSchoolName);
                }
                handleCancelEdit();
                return;
            }

            // --- Editing Class Logic ---
            if (editingTarget.discipline) {
                const oldDiscipline = editingTarget.discipline;

                setSchoolsData(prev => {
                    const newData = JSON.parse(JSON.stringify(prev));
                    const schoolToUpdate = newData[escola];
                    if (!schoolToUpdate) return prev;

                    const disciplineData = schoolToUpdate.disciplinas[oldDiscipline];
                    if (!disciplineData) return prev;

                    // Update data with new form values
                    disciplineData.etapa = etapa;
                    disciplineData.modalidade = modalidade;

                    // Handle rename if necessary
                    if (oldDiscipline !== newClassDescription) {
                        schoolToUpdate.disciplinas[newClassDescription] = disciplineData;
                        delete schoolToUpdate.disciplinas[oldDiscipline];
                    }
                    return newData;
                });

                if (oldDiscipline !== newClassDescription) {
                    setSelectedDiscipline(newClassDescription);
                }
                
                setEditingTarget(prev => prev ? ({ ...prev, discipline: newClassDescription }) : null);
                setScheduleFormData(prev => ({ ...prev, selectedClass: `${escola} - ${newClassDescription}` }));
                setCreationStep(2);
                return;
            }
        }

        // --- Creating Class Logic ---
        if (!escola.trim() || !componente || !serie || !turma || !turno) return;
        
        const startDate = pickerRef.current?.getStartDate();
        const endDate = pickerRef.current?.getEndDate();

        setSchoolsData(prev => {
            const newSchoolsData = JSON.parse(JSON.stringify(prev));
            if (!newSchoolsData[escola]) {
                newSchoolsData[escola] = {
                    disciplinas: {},
                    schoolYearStart: startDate ? startDate.dateInstance.toISOString() : undefined,
                    schoolYearEnd: endDate ? endDate.dateInstance.toISOString() : undefined
                };
            }
            if (!newSchoolsData[escola].disciplinas[newClassDescription]) {
                const defaultStudents: Student[] = [ { nome: "Ana Carolina", notas: [[8.5, 7.0], [9.0], [], []] }, { nome: "Bruno Costa", notas: [[6.0, 7.5], [8.0], [], []] }, { nome: "Carlos Eduardo", notas: [[9.5, 9.0], [10.0], [], []] }, { nome: "Daniela Ferreira", notas: [[5.0, 6.5], [7.0], [], []] }, { nome: "Eduardo Martins", notas: [[7.0, 8.0], [7.5], [], []] } ];
                newSchoolsData[escola].disciplinas[newClassDescription] = {
                    alunos: defaultStudents,
                    etapa: etapa,
                    modalidade: modalidade,
                    // Add sample data for the new student features
                    announcements: [
                        { id: 1, title: 'Bem-vindos ao Ano Letivo!', content: 'Caros alunos, sejam bem-vindos! Estamos animados para começar esta jornada de aprendizado com todos vocês.', date: new Date().toISOString() },
                        { id: 2, title: 'Próxima Avaliação', content: 'Lembrete: nossa primeira avaliação será na próxima sexta-feira. O conteúdo abordará os capítulos 1 e 2.', date: new Date(Date.now() - 86400000 * 5).toISOString() }
                    ],
                    activities: [
                        { id: 1, title: 'Resumo do Capítulo 1', description: 'Entregar um resumo de uma página sobre os principais tópicos do primeiro capítulo.', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), status: 'Pendente' },
                        { id: 2, title: 'Exercícios de Fixação', description: 'Resolver os exercícios da página 25 do livro didático.', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), status: 'Pendente' },
                    ]
                };
            }
            return newSchoolsData;
        });
        
        const classId = `${escola} - ${newClassDescription}`;
        setScheduleFormData({ ...initialScheduleFormData, selectedClass: classId });
        setCreationStep(2);
    };

    const handleStartEdit = (school: string, discipline?: string) => {
        setIsEditingMode(true);
        const schoolData = schoolsData[school];
    
        if (discipline) { // Editing a class and its schedule
            setEditingTarget({ school, discipline });
            setCreationStep(1);
    
            const disciplineData = schoolData?.disciplinas[discipline];
            const [componente, serieTurma, turno] = discipline.split(' - ');
            const [serie, turma] = serieTurma.split(' ');
            
            setFormData({
                escola: school,
                componente,
                serie,
                turma,
                turno,
                etapa: disciplineData?.etapa || '', 
                modalidade: disciplineData?.modalidade || ''
            });
    
            const schedule = schoolData?.disciplinas[discipline]?.schedule || {};
            const scheduleForForm: { [day: string]: { [period: number]: boolean } } = {};
            Object.entries(schedule).forEach(([day, periods]) => {
                scheduleForForm[day] = {};
                (periods as number[]).forEach(p => {
                    scheduleForForm[day][p] = true;
                });
            });
            setScheduleFormData({
                selectedClass: `${school} - ${discipline}`,
                schedule: scheduleForForm
            });
    
        } else { // Editing a school
            setEditingTarget({ school });
            setCreationStep(1);
            setFormData({ ...initialFormData, escola: school });
        }
    
        // Common logic for both edits
        setTimeout(() => {
            if (pickerRef.current) {
                if (!discipline && schoolData?.schoolYearStart && schoolData?.schoolYearEnd) {
                    pickerRef.current.setDateRange(new Date(schoolData.schoolYearStart), new Date(schoolData.schoolYearEnd));
                } else {
                    pickerRef.current.clearSelection();
                }
            }
        }, 100);
        setIsCreationVisible(true);
    };

    const handleNoteInputChange = (alunoIndex: number, noteIndex: number, value: string) => {
        const key = `${selectedSchool}-${selectedDiscipline}-${menuState.bim}-${alunoIndex}-${noteIndex}`;
        const numericValue = value.replace(/[^0-9]/g, '');
        setEditingNotes(prev => ({ ...prev, [key]: numericValue }));
    };

    const handleNoteInputBlur = (alunoIndex: number, noteIndex: number) => {
        const key = `${selectedSchool}-${selectedDiscipline}-${menuState.bim}-${alunoIndex}-${noteIndex}`;
        const rawValue = editingNotes[key];

        if (rawValue === undefined) return;

        const formatGrade = (raw: string): number | null => {
            if (raw === '') return null;
            const num = parseInt(raw, 10);

            if (num >= 100) return 10.0;
            if (raw.length === 2) {
                if (raw === '10') return 10.0;
                return num / 10;
            }
            return num;
        };
        
        const formattedValue = formatGrade(rawValue);

        setSchoolsData(prev => {
            const newAlunos = [...prev[selectedSchool].disciplinas[selectedDiscipline].alunos];
            const studentToUpdate = { ...newAlunos[alunoIndex] };
            
            const newNotas = [...studentToUpdate.notas];
            const newNotasBimestre = [...(newNotas[menuState.bim] || [])];
            
            while(newNotasBimestre.length <= noteIndex) {
                newNotasBimestre.push(null);
            }
            newNotasBimestre[noteIndex] = formattedValue;

            newNotas[menuState.bim] = newNotasBimestre;
            studentToUpdate.notas = newNotas;
            newAlunos[alunoIndex] = studentToUpdate;

            return {
                ...prev,
                [selectedSchool]: {
                    ...prev[selectedSchool],
                    disciplinas: {
                        ...prev[selectedSchool].disciplinas,
                        [selectedDiscipline]: {
                            ...prev[selectedSchool].disciplinas[selectedDiscipline],
                            alunos: newAlunos,
                        },
                    },
                },
            };
        });

        setEditingNotes(prev => {
            const newEditing = { ...prev };
            delete newEditing[key];
            return newEditing;
        });
    };

    const handleRecuperacaoChange = (alunoIndex: number, value: string) => {
        const key = `${selectedSchool}-${selectedDiscipline}-${alunoIndex}`;
        const numericValue = value.replace(/[^0-9]/g, '');
        setEditingRecuperacao(prev => ({ ...prev, [key]: numericValue }));
    };
    
    const handleRecuperacaoBlur = (alunoIndex: number) => {
        const key = `${selectedSchool}-${selectedDiscipline}-${alunoIndex}`;
        const rawValue = editingRecuperacao[key];
    
        if (rawValue === undefined) return;
    
        const formatGrade = (raw: string): number | null => {
            if (raw === '') return null;
            const num = parseInt(raw, 10);
            if (num >= 100) return 10.0;
            if (raw.length === 2) {
                if (raw === '10') return 10.0;
                return num / 10;
            }
            return num;
        };
        
        const formattedValue = formatGrade(rawValue);
    
        setSchoolsData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            const studentToUpdate = newData[selectedSchool].disciplinas[selectedDiscipline].alunos[alunoIndex];
            studentToUpdate.recuperacaoAnual = formattedValue;
            return newData;
        });
    
        setEditingRecuperacao(prev => {
            const newEditing = { ...prev };
            delete newEditing[key];
            return newEditing;
        });
    };

    const handleStudentNameChange = (newName: string, alunoIndex: number) => {
        if (!selectedSchool || !selectedDiscipline) return;
    
        setSchoolsData(prev => {
            const originalName = prev[selectedSchool]?.disciplinas?.[selectedDiscipline]?.alunos?.[alunoIndex]?.nome;
            
            if (originalName === newName) {
                return prev;
            }
    
            const newData = JSON.parse(JSON.stringify(prev));
            const studentToUpdate = newData[selectedSchool]?.disciplinas?.[selectedDiscipline]?.alunos?.[alunoIndex];
    
            if (studentToUpdate) {
                studentToUpdate.nome = newName;
            }
            
            return newData;
        });
    };
    
    const handleAddStudent = () => {
        if (!selectedSchool || !selectedDiscipline) return;
    
        setSchoolsData(prev => {
            // Use a deep copy to safely modify the nested data structure.
            const newData = JSON.parse(JSON.stringify(prev));
            const discipline = newData[selectedSchool]?.disciplinas?.[selectedDiscipline];
            
            if (discipline) {
                const newStudent: Student = {
                    nome: "Novo Aluno",
                    notas: [[], [], [], []],
                    recuperacaoAnual: null,
                };
                discipline.alunos.push(newStudent);
            }
            
            return newData;
        });
    };

    const handleDeleteStudent = () => {
        if (selectedStudentIndex === null || !selectedSchool || !selectedDiscipline) return;
    
        const studentName = currentDiscipline?.alunos[selectedStudentIndex]?.nome || 'este aluno';
        if (!window.confirm(`Tem certeza que deseja excluir "${studentName}"? Esta ação não pode ser desfeita.`)) {
            return;
        }
    
        setSchoolsData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            const students = newData[selectedSchool].disciplinas[selectedDiscipline].alunos;
            students.splice(selectedStudentIndex, 1);
            return newData;
        });
    
        setSelectedStudentIndex(null);
    };

    const handleSelectStudent = (index: number) => {
        setSelectedStudentIndex(prev => (prev === index ? null : index));
    };

    const updateMenuDisplay = () => {
        const { category, bim, view } = menuState;
        if (category !== 'Notas') return category;
        const bimText = bim > -1 ? `${bim + 1}º Bimestre` : 'Resultado Final';
        let viewText = '';
        if (view === 'all') viewText = 'Todas as Notas';
        if (view.startsWith('note-')) viewText = `Nota ${view.split('-')[1]}`;
        return `${category}: ${bimText} ${view !== 'all' ? `- ${viewText}` : ''}`.trim();
    };
    
    const handleSelectMenuItem = (category: string, bim?: number, view?: string) => {
        setMenuState({
            category,
            bim: bim !== undefined ? bim : menuState.bim,
            view: view || 'all'
        });
        setIsMenuVisible(false);
        setActiveMenuPath([]);
    };

    const handleToggleCreationForm = () => {
        if (isCreationVisible) {
            handleCancelEdit();
        } else {
            setIsCreationVisible(true);
        }
    };

    const triggerFileUpload = (acceptType: string) => {
        if (fileInputRef.current) {
            fileInputRef.current.accept = acceptType;
            fileInputRef.current.click();
        }
    };

    const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedSchool || !selectedDiscipline) {
            if (event.target) event.target.value = '';
            return;
        }
    
        setIsImporting(true);
        setImportError(null);
    
        try {
            let studentNames: string[] = [];
    
            if (file.type === 'application/pdf' && window.pdfjsLib) {
                let textContent = '';
                const pdfData = new Uint8Array(await file.arrayBuffer());
                const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const text = await page.getTextContent();
                    textContent += text.items.map((s: any) => s.str).join(' ');
                }
                if (!textContent.trim()) throw new Error("PDF vazio ou sem texto para extrair.");
                studentNames = await extractStudentNames({ text: textContent });
    
            } else if (file.type.startsWith('image/')) {
                const base64Data = await blobToBase64(file);
                studentNames = await extractStudentNames({ imageBase64: base64Data, mimeType: file.type });
            } else {
                throw new Error("Tipo de arquivo não suportado. Use PDF ou Imagem.");
            }
    
            if (studentNames.length === 0) {
                throw new Error("A IA não conseguiu extrair nomes. Verifique o conteúdo do arquivo.");
            }
    
            const newStudents: Student[] = studentNames.map(name => ({
                nome: name,
                notas: [[], [], [], []],
                recuperacaoAnual: null,
            }));
    
            setSchoolsData(prev => {
                const newData = JSON.parse(JSON.stringify(prev));
                newData[selectedSchool].disciplinas[selectedDiscipline].alunos = newStudents;
                return newData;
            });
    
            setIsImportModalVisible(false);
    
        } catch (error: any) {
            console.error("Erro durante a importação:", error);
            setImportError(error.message || "Ocorreu um erro desconhecido durante a importação.");
        } finally {
            setIsImporting(false);
            if (event.target) event.target.value = '';
        }
    };
    
    const handleMenuNavigation = (e: React.MouseEvent, path: string[]) => {
        e.preventDefault();
        if (isMobile) {
            setActiveMenuPath(path);
        }
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const [year, month] = e.target.value.split('-').map(Number);
        setViewedDate(new Date(year, month));
    };

    // --- CODE GENERATION HANDLERS ---
    const generateAccessCode = (): string => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const handleGenerateCodeForAll = () => {
        if (!selectedSchool || !selectedDiscipline) return;
        setSchoolsData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            const students = newData[selectedSchool].disciplinas[selectedDiscipline].alunos;
            students.forEach((student: Student) => {
                if (!student.accessCode) { // Only generate if one doesn't exist
                    student.accessCode = generateAccessCode();
                }
            });
            return newData;
        });
    };

    const handleGenerateCodeForStudent = (studentIndex: number) => {
        if (!selectedSchool || !selectedDiscipline) return;
        setSchoolsData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            const student = newData[selectedSchool].disciplinas[selectedDiscipline].alunos[studentIndex];
            student.accessCode = generateAccessCode(); // Regenerates code
            return newData;
        });
    };

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };


    // --- RENDER LOGIC ---
    const disciplineOptions = selectedSchool ? Object.keys(schoolsData[selectedSchool]?.disciplinas || {}) : [];
    const currentDiscipline = schoolsData[selectedSchool]?.disciplinas[selectedDiscipline];
    const bimesterIndex = menuState.bim;
    const noteView = menuState.view;
    const noteIndexToShow = noteView.startsWith('note-') ? parseInt(noteView.replace('note-', '')) - 1 : -1;
    const PASSING_GRADE_ANNUAL = 7.0;
    const PASSING_GRADE_FINAL = 5.0;

    const renderNoteInput = (alunoIndex: number, noteIndex: number) => {
        if (!currentDiscipline) return null;
        
        const key = `${selectedSchool}-${selectedDiscipline}-${bimesterIndex}-${alunoIndex}-${noteIndex}`;
        const isEditing = editingNotes[key] !== undefined;
        
        const noteValue = currentDiscipline.alunos[alunoIndex]?.notas[bimesterIndex]?.[noteIndex];
        let displayValue: string;

        if (isEditing) {
            displayValue = editingNotes[key] as string;
        } else if (noteValue !== null && noteValue !== undefined) {
            displayValue = noteValue.toFixed(1);
        } else {
            displayValue = '';
        }

        return (
            <td key={noteIndex} className="px-4 py-2 text-center">
                <input
                    type="text"
                    maxLength={3}
                    value={displayValue}
                    onChange={(e) => handleNoteInputChange(alunoIndex, noteIndex, e.target.value)}
                    onBlur={() => handleNoteInputBlur(alunoIndex, noteIndex)}
                    placeholder="-"
                    className="w-20 text-center border border-slate-300 rounded-md shadow-sm p-1"
                />
            </td>
        );
    };

    const renderScheduleCalendar = () => {
        if (!currentDiscipline?.schedule) {
            return <p className="mt-4 text-slate-500">Nenhum horário agendado para esta turma. Crie ou edite o agendamento no formulário.</p>;
        }

        const schedule = currentDiscipline.schedule;
        const year = viewedDate.getFullYear();
        const month = viewedDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const scheduledDays = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dayOfWeek = weekDays[currentDate.getDay()];
            if (schedule && schedule[dayOfWeek]) {
                scheduledDays.push({
                    date: day,
                    dayName: dayOfWeek,
                    periods: schedule[dayOfWeek]
                });
            }
        }

        const formatPeriods = (periods: number[]): string => {
            return periods.map(p => `${p}ª`).join(', ') + ' aula';
        };

        const monthOptions = [];
        const schoolData = schoolsData[selectedSchool];
        const schoolYearStart = schoolData?.schoolYearStart ? new Date(schoolData.schoolYearStart) : null;
        const schoolYearEnd = schoolData?.schoolYearEnd ? new Date(schoolData.schoolYearEnd) : null;
        
        if (schoolYearStart && schoolYearEnd && selectedSchool) {
            let currentDate = new Date(schoolYearStart.getFullYear(), schoolYearStart.getMonth(), 1);
            const lastDate = new Date(schoolYearEnd.getFullYear(), schoolYearEnd.getMonth(), 1);

            while (currentDate <= lastDate) {
                const y = currentDate.getFullYear();
                const m = currentDate.getMonth();
                monthOptions.push({
                    value: `${y}-${m}`,
                    label: `${months[m]}/${y}`
                });
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        } else {
            // Fallback to current year only if no period is defined
            const currentFullYear = new Date().getFullYear();
            for (let m = 0; m < 12; m++) {
                monthOptions.push({
                    value: `${currentFullYear}-${m}`,
                    label: `${months[m]}/${currentFullYear}`
                });
            }
        }


        return (
            <div className="mt-6">
                <div className="flex items-center gap-4 mb-6">
                    <h3 className="text-xl font-bold text-slate-800"><i className="fas fa-calendar-alt text-slate-400 mr-2"></i> Calendário de Aulas</h3>
                    <select
                        value={`${year}-${month}`}
                        onChange={handleMonthChange}
                        className="px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                    >
                        {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                {scheduledDays.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {scheduledDays.map((day, index) => (
                            <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center text-center">
                                <p className="text-sm font-medium text-slate-500">{day.dayName}</p>
                                <p className="text-3xl font-bold text-slate-800 my-2">{String(day.date).padStart(2, '0')}</p>
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <ClockIcon className="w-4 h-4" />
                                    <span>{formatPeriods(day.periods)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500">Nenhuma aula agendada para {months[month]} de {year}.</p>
                )}
            </div>
        );
    };
    
    const creationView = (
        <>
            {isMobile && (
                <div className="flex items-center mb-8">
                    <button 
                        onClick={() => isEditingMode ? handleCancelEdit() : (creationStep === 1 ? handleToggleCreationForm() : setCreationStep(1))} 
                        className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <h1 className="text-xl font-semibold text-slate-800">
                      {isEditingMode ? `Editar ${editingTarget?.discipline ? 'Turma e Horário' : 'Escola'}` : (creationStep === 1 ? 'Criar Escola/Turma' : 'Agendar Aulas')}
                    </h1>
                </div>
            )}
            
            {/* Step 1: Create/Edit Class */}
            <div className={creationStep === 1 ? 'block' : 'hidden'}>
                {!isMobile && <h1 className="text-2xl font-bold text-cyan-600 mb-8">{isEditingMode ? `Editar ${editingTarget?.discipline ? 'Turma' : 'Escola'}` : 'Criar Escola/Turma'}</h1>}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    
                    {(!isEditingMode || !editingTarget?.discipline) && (
                         <div>
                            <label htmlFor="periodo" className="block text-sm font-medium text-slate-700 mb-1">Período do Ano Letivo</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="fas fa-calendar-alt text-slate-400"></i>
                                </div>
                                <input type="text" id="periodo" ref={periodInputRef} placeholder="Selecione um período" className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500" />
                            </div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="escola" className="block text-sm font-medium text-slate-700 mb-1">Inst. de Ensino</label>
                        <input type="text" id="escola" value={formData.escola} onChange={handleFormChange} placeholder="Nome da escola" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500" disabled={isEditingMode && !!editingTarget?.discipline}/>
                    </div>

                   {(!isEditingMode || !!editingTarget?.discipline) && (
                     <>
                        <div>
                            <label htmlFor="componente" className="block text-sm font-medium text-slate-700 mb-1">Componente Curricular</label>
                            <select id="componente" value={formData.componente} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.componente ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione um componente</option>
                                <option>Português</option><option>Matemática</option><option>Ciências</option><option>História</option><option>Geografia</option><option>Arte</option><option>Educação Física</option><option>Inglês</option><option>Ensino Religioso</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="etapa" className="block text-sm font-medium text-slate-700 mb-1">Etapa de Ensino</label>
                            <select id="etapa" value={formData.etapa} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.etapa ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione a etapa</option>
                                <option>Ensino Fundamental II</option><option>Ensino Fundamental I</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="modalidade" className="block text-sm font-medium text-slate-700 mb-1">Modalidade</label>
                            <select id="modalidade" value={formData.modalidade} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.modalidade ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione a modalidade</option>
                                <option>Regular</option><option>Integral</option><option>EJA</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="turma" className="block text-sm font-medium text-slate-700 mb-1">Turma</label>
                            <select id="turma" value={formData.turma} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.turma ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione a turma</option>
                                <option>A</option><option>B</option><option>C</option><option>D</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="serie" className="block text-sm font-medium text-slate-700 mb-1">Série</label>
                            <select id="serie" value={formData.serie} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.serie ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione a série</option>
                                <option>6º Ano</option><option>7º Ano</option><option>8º Ano</option><option>9º Ano</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="turno" className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
                            <select id="turno" value={formData.turno} onChange={handleFormChange} className={`w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 ${formData.turno ? 'text-slate-900' : 'text-slate-400'}`}>
                                <option value="" disabled>Selecione o turno</option>
                                <option>Manhã</option><option>Tarde</option><option>Noite</option><option>Integral</option>
                            </select>
                        </div>
                     </>
                   )}
                </div>
                <div className="mt-8 flex items-center gap-4">
                    <button onClick={handleSaveClass} className="flex-grow bg-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors">
                        {isEditingMode ? (editingTarget?.discipline ? 'Próximo: Editar Horário' : 'Salvar Alterações') : 'Criar Turma'}
                    </button>
                    <button onClick={handleCancelEdit} className="py-3 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">Cancelar</button>
                </div>
            </div>

            {/* Step 2: Schedule Class */}
            <div className={creationStep === 2 ? 'block' : 'hidden'}>
                {!isMobile && (
                    <div className="flex items-center mb-8">
                        <button onClick={() => setCreationStep(1)} className="mr-4 p-2 text-slate-600 rounded-full hover:bg-slate-200">
                            <ArrowLeftIcon className="w-5 h-5" />
                        </button>
                        <h1 className="text-2xl font-bold text-cyan-600">{isEditingMode ? 'Editar Agendamento' : 'Agendamento de Aula'}</h1>
                    </div>
                )}
                <div>
                    <label htmlFor="turma-agendamento" className="block text-sm font-medium text-slate-700 mb-1">Escola/Classe</label>
                    <select id="turma-agendamento" value={scheduleFormData.selectedClass} onChange={handleScheduleFormChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 bg-slate-100" disabled>
                        <option value="">Selecione uma turma</option>
                        {Object.keys(schoolsData).flatMap(school =>
                            Object.keys(schoolsData[school].disciplinas).map(discipline => {
                                const classId = `${school} - ${discipline}`;
                                return <option key={classId} value={classId}>{classId}</option>;
                            })
                        )}
                    </select>
                </div>
                <div className="mt-8">
                    <h3 className="text-sm font-medium text-slate-700 mb-4">Horários da Semana</h3>
                    <div className="grid grid-cols-6 gap-y-4 text-center">
                        <div></div>
                        {[...Array(5)].map((_, i) => <div key={i} className="font-medium text-slate-600">{i + 1}º</div>)}
                        {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].map(day => (
                            <React.Fragment key={day}>
                                <div className="font-medium text-slate-600 text-left self-center">{day}</div>
                                {[...Array(5)].map((_, i) => (
                                    <div key={i}>
                                        <input 
                                            type="checkbox"
                                            checked={!!scheduleFormData.schedule[day]?.[i + 1]}
                                            onChange={() => handleScheduleCheckboxChange(day, i + 1)}
                                            className="h-5 w-5 rounded text-cyan-600 border-slate-300 focus:ring-cyan-500"
                                        />
                                    </div>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                <div className="mt-8 flex items-center gap-4">
                     <button onClick={handleSaveSchedule} className="flex-grow bg-cyan-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors">
                        {isEditingMode ? 'Salvar Alterações e Concluir' : 'Agendar Aulas e Concluir'}
                    </button>
                    <button onClick={handleCancelEdit} className="py-3 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">Cancelar</button>
                </div>
            </div>

            {!isMobile && <hr className="my-12 border-slate-200" />}
        </>
    );

    const managementView = (
        <div className={isMobile && isCreationVisible ? 'hidden' : ''}>
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                    {isMobile && (
                        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 rounded-full hover:bg-slate-200">
                            <ArrowLeftIcon className="w-6 h-6" />
                        </button>
                    )}
                    <h2 className="text-2xl font-bold text-cyan-600">Gestão de Notas e Alunos</h2>
                </div>
                <button 
                    onClick={handleToggleCreationForm} 
                    title={isCreationVisible ? 'Ocultar formulário' : 'Criar Escola/Turma'} 
                    className="text-cyan-600 hover:text-cyan-800 transition-transform transform hover:scale-110"
                >
                    <i className={`fas ${isCreationVisible ? 'fa-minus-circle' : 'fa-plus-circle'} fa-xl`}></i>
                </button>
            </div>
            
            {Object.keys(schoolsData).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-8">
                    <div className="flex items-center gap-2">
                        <div className="flex-grow">
                            <label htmlFor="escola-select" className="block text-sm font-medium text-slate-700 mb-1">Selecione a Escola</label>
                            <select id="escola-select" value={selectedSchool} onChange={e => { setSelectedSchool(e.target.value); setSelectedDiscipline(''); setSelectedStudentIndex(null); }} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500">
                                <option value="">-- Escolha uma escola --</option>
                                {Object.keys(schoolsData).map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </div>
                         {selectedSchool && <button onClick={() => handleStartEdit(selectedSchool)} className="self-end p-2 text-slate-500 hover:text-cyan-600" title="Editar Escola"><EditIcon className="w-5 h-5"/></button>}
                    </div>
                    {selectedSchool && (
                        <div className="flex items-center gap-2">
                           <div className="flex-grow">
                             <label htmlFor="disciplina-select" className="block text-sm font-medium text-slate-700 mb-1">Selecione a Turma/Disciplina</label>
                             <select id="disciplina-select" value={selectedDiscipline} onChange={e => { setSelectedDiscipline(e.target.value); setSelectedStudentIndex(null); }} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500">
                                 <option value="">-- Escolha uma turma --</option>
                                 {disciplineOptions.map(name => <option key={name} value={name}>{name}</option>)}
                             </select>
                           </div>
                           {selectedDiscipline && <button onClick={() => handleStartEdit(selectedSchool, selectedDiscipline)} className="self-end p-2 text-slate-500 hover:text-cyan-600" title="Editar Turma e Horário"><EditIcon className="w-5 h-5"/></button>}
                        </div>
                    )}
                </div>
            ) : (
                !isCreationVisible && (
                     <div className="text-center py-8 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 mb-8">
                        <p className="text-slate-600 font-medium">Nenhuma escola cadastrada.</p>
                        <p className="text-slate-500 mt-1 text-sm">Use o formulário acima para criar sua primeira escola e turma.</p>
                    </div>
                )
            )}

            {selectedSchool && selectedDiscipline && (
                <div>
                    <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
                        <div ref={menuContainerRef} className="relative inline-block text-left">
                            <div>
                                <button type="button" onClick={() => setIsMenuVisible(p => !p)} className="inline-flex justify-center w-full rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500">
                                    <span>{updateMenuDisplay()}</span>
                                    <i className="fas fa-chevron-down -mr-1 ml-2 h-5 w-5"></i>
                                </button>
                            </div>
                            {isMenuVisible && (
                                <div className={`absolute mt-2 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10 ${menuPositionClass === 'left-0' ? 'origin-top-left' : 'origin-top-right'} ${menuPositionClass}`}>
                                {isMobile ? (
                                    <div className="py-1 w-64">
                                        {activeMenuPath.length > 0 && (
                                            <a href="#" onClick={(e) => { e.preventDefault(); setActiveMenuPath(prev => prev.slice(0, -1)); }} className="text-slate-700 group flex items-center px-4 py-2 text-sm font-semibold hover:bg-slate-100 border-b border-slate-200">
                                                 <i className="fas fa-chevron-left text-xs mr-3"></i>
                                                 Voltar
                                            </a>
                                        )}
                                        {activeMenuPath.length === 0 && (
                                            <>
                                                <a href="#" onClick={(e) => handleMenuNavigation(e, ['Notas'])} className="text-slate-700 group flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100">Notas <i className="fas fa-chevron-right text-xs"></i></a>
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Horários'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Horários</a>
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Atividades'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Atividades</a>
                                            </>
                                        )}
                                        {activeMenuPath[0] === 'Notas' && activeMenuPath.length === 1 && (
                                            <>
                                                {[0, 1, 2, 3].map(bim => (<a key={bim} href="#" onClick={(e) => handleMenuNavigation(e, ['Notas', `Bimestre ${bim}`])} className="text-slate-700 group flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100">{bim + 1}º Bimestre <i className="fas fa-chevron-right text-xs"></i></a>))}
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', -1, 'all'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Resultado Final</a>
                                            </>
                                        )}
                                        {activeMenuPath[0] === 'Notas' && activeMenuPath.length === 2 && (
                                            <>
                                                 <a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', parseInt(activeMenuPath[1].split(' ')[1]), 'all'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Todas as Notas</a>
                                                 {[1, 2, 3, 4, 5].map(n => (<a key={n} href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', parseInt(activeMenuPath[1].split(' ')[1]), `note-${n}`); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Nota {n}</a>))}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex" onMouseLeave={() => setActiveMenuPath([])}>
                                        <div className="py-1 w-48">
                                            <div className="relative" onMouseEnter={() => setActiveMenuPath(['Notas'])}>
                                                <a href="#" onClick={(e) => e.preventDefault()} className={`text-slate-700 group flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100 ${activeMenuPath[0] === 'Notas' ? 'bg-slate-100' : ''}`}>Notas <i className="fas fa-chevron-right text-xs"></i></a>
                                            </div>
                                            <div onMouseEnter={() => setActiveMenuPath([])}><a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Horários'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Horários</a></div>
                                            <div onMouseEnter={() => setActiveMenuPath([])}><a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Atividades'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Atividades</a></div>
                                        </div>
                                        {activeMenuPath[0] === 'Notas' && (
                                            <div className="py-1 w-48 border-l border-slate-200">
                                                {[0, 1, 2, 3].map(bim => (<div key={bim} className="relative" onMouseEnter={() => setActiveMenuPath(['Notas', `Bimestre ${bim}`])}><a href="#" onClick={(e) => e.preventDefault()} className={`text-slate-700 group flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100 ${activeMenuPath[1] === `Bimestre ${bim}` ? 'bg-slate-100' : ''}`}>{bim + 1}º Bimestre <i className="fas fa-chevron-right text-xs"></i></a></div>))}
                                                <div className="relative" onMouseEnter={() => setActiveMenuPath(['Notas', 'Resultado Final'])}><a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', -1, 'all'); }} className={`text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100 ${activeMenuPath[1] === 'Resultado Final' ? 'bg-slate-100' : ''}`}>Resultado Final</a></div>
                                            </div>
                                        )}
                                        {activeMenuPath[0] === 'Notas' && activeMenuPath[1]?.startsWith('Bimestre') && (
                                            <div className="py-1 w-48 border-l border-slate-200">
                                                <a href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', parseInt(activeMenuPath[1].split(' ')[1]), 'all'); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Todas as Notas</a>
                                                {[1, 2, 3, 4, 5].map(n => (<a key={n} href="#" onClick={(e) => { e.preventDefault(); handleSelectMenuItem('Notas', parseInt(activeMenuPath[1].split(' ')[1]), `note-${n}`); }} className="text-slate-700 block px-4 py-2 text-sm hover:bg-slate-100">Nota {n}</a>))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setImportError(null); setIsImportModalVisible(true); }}
                                title="Importar Lista de Alunos via IA"
                                className="flex items-center gap-2 py-2 px-3 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-cyan-700 transition-colors"
                            >
                                <UploadIcon className="w-5 h-5" />
                                <span className="hidden sm:inline">Importar Alunos</span>
                            </button>
                            <button
                                onClick={() => setIsCodeModalVisible(true)}
                                title="Gerar Códigos de Acesso"
                                className="flex items-center gap-2 py-2 px-3 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-cyan-700 transition-colors"
                            >
                                <KeyIcon className="w-5 h-5" />
                                <span className="hidden sm:inline">Gerar Códigos</span>
                            </button>
                        </div>
                    </div>
                    
                    {menuState.category === 'Notas' && menuState.bim > -1 && currentDiscipline && (
                        <div>
                            <div className="overflow-x-auto bg-white rounded-lg border">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nº</th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome do Aluno</th>
                                            {noteView === 'all' ? (
                                                [...Array(5)].map((_, i) => <th key={i} scope="col" className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Nota {i + 1}</th>)
                                            ) : (
                                                noteIndexToShow > -1 && <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Nota {noteIndexToShow + 1}</th>
                                            )}
                                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Média</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {currentDiscipline.alunos.map((aluno, alunoIndex) => (
                                            <tr 
                                                key={alunoIndex} 
                                                onClick={() => handleSelectStudent(alunoIndex)}
                                                className={`cursor-pointer ${selectedStudentIndex === alunoIndex ? 'bg-cyan-100' : 'transition-colors hover:bg-slate-50'}`}
                                            >
                                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-500">{alunoIndex + 1}</td>
                                                <td className="px-6 py-4 text-sm font-medium min-w-[150px]">
                                                    <EditableStudentName
                                                        studentName={aluno.nome}
                                                        onBlur={(newName) => handleStudentNameChange(newName, alunoIndex)}
                                                    />
                                                </td>
                                                {noteView === 'all' ? (
                                                    [...Array(5)].map((_, i) => renderNoteInput(alunoIndex, i))
                                                ) : (
                                                    noteIndexToShow > -1 ? renderNoteInput(alunoIndex, noteIndexToShow) : null
                                                )}
                                                <td className="px-6 py-4 text-center text-sm font-semibold text-slate-700">{calculateAverage(aluno.notas[bimesterIndex])}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <div className="flex items-center gap-4 text-slate-500">
                                    <button title="Copiar Tabela" className="hover:text-cyan-600"><i className="fas fa-copy fa-lg"></i></button>
                                    <button title="Ver Gráficos" className="hover:text-cyan-600"><i className="fas fa-chart-bar fa-lg"></i></button>
                                </div>
                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={handleDeleteStudent}
                                        title="Excluir Aluno Selecionado" 
                                        className="text-red-500 hover:text-red-700 transition-transform transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                        disabled={selectedStudentIndex === null}
                                    >
                                        <UserMinusIcon className="w-6 h-6"/>
                                    </button>
                                    <button 
                                        onClick={handleAddStudent} 
                                        title="Adicionar Aluno Manualmente" 
                                        className="text-cyan-600 hover:text-cyan-800 transition-transform transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={!selectedDiscipline}
                                    >
                                        <UserPlusIcon className="w-6 h-6"/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {menuState.category === 'Horários' && renderScheduleCalendar()}
                    {menuState.category === 'Atividades' && <p className="mt-4 text-slate-500">Visualização de '{menuState.category}' ainda não implementada.</p>}
                    {menuState.category === 'Notas' && menuState.bim === -1 && currentDiscipline && (
                        <div>
                            <div className="overflow-x-auto bg-white rounded-lg border">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nº</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome do Aluno</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">M1</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">M2</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">M3</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">M4</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">MA</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">RA</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">MF</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Situação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {currentDiscipline.alunos.map((aluno, alunoIndex) => {
                                            const bimesterAverages = [0, 1, 2, 3].map(i => {
                                                const avg = calculateAverage(aluno.notas[i]);
                                                return avg === '-' ? null : parseFloat(avg);
                                            });

                                            const validAverages = bimesterAverages.filter(a => a !== null) as number[];
                                            const annualAverageRaw = validAverages.length > 0 ? validAverages.reduce((sum, avg) => sum + avg, 0) / 4 : null;
                                            
                                            const recuperacaoAnual = aluno.recuperacaoAnual;
                                            const key = `${selectedSchool}-${selectedDiscipline}-${alunoIndex}`;
                                            const isEditingRA = editingRecuperacao[key] !== undefined;
                                            
                                            let finalAverage: number | null = null;
                                            let situation = 'Indefinido';
                                            let situationClass = 'text-slate-500';

                                            if (annualAverageRaw !== null) {
                                                if (annualAverageRaw >= PASSING_GRADE_ANNUAL) {
                                                    finalAverage = annualAverageRaw;
                                                    situation = 'Aprovado';
                                                    situationClass = 'text-green-600';
                                                } else {
                                                    const raValue = isEditingRA ? parseFloat(editingRecuperacao[key] || '0') / 10 : recuperacaoAnual;
                                                    if (raValue !== null && raValue !== undefined) {
                                                        const calculatedFinal = (annualAverageRaw + raValue) / 2;
                                                        finalAverage = calculatedFinal;
                                                        if (calculatedFinal >= PASSING_GRADE_FINAL) {
                                                            situation = 'Aprovado';
                                                            situationClass = 'text-green-600';
                                                        } else {
                                                            situation = 'Reprovado';
                                                            situationClass = 'text-red-600';
                                                        }
                                                    } else {
                                                        situation = 'Recuperação';
                                                        situationClass = 'text-yellow-600';
                                                    }
                                                }
                                            }
                                            
                                            return (
                                                <tr key={alunoIndex}>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-500">{alunoIndex + 1}</td>
                                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{aluno.nome}</td>
                                                    {bimesterAverages.map((avg, i) => <td key={i} className="px-4 py-4 text-center text-sm text-slate-600">{avg?.toFixed(1) ?? '-'}</td>)}
                                                    <td className="px-4 py-4 text-center text-sm font-semibold text-slate-800">{annualAverageRaw?.toFixed(1) ?? '-'}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <input
                                                            type="text"
                                                            maxLength={3}
                                                            value={isEditingRA ? editingRecuperacao[key] : (recuperacaoAnual !== null && recuperacaoAnual !== undefined ? recuperacaoAnual.toFixed(1) : '')}
                                                            onChange={(e) => handleRecuperacaoChange(alunoIndex, e.target.value)}
                                                            onBlur={() => handleRecuperacaoBlur(alunoIndex)}
                                                            placeholder="-"
                                                            className="w-20 text-center border border-slate-300 rounded-md shadow-sm p-1 disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                            disabled={annualAverageRaw === null || annualAverageRaw >= PASSING_GRADE_ANNUAL}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-4 text-center text-sm font-semibold text-slate-800">{finalAverage?.toFixed(1) ?? '-'}</td>
                                                    <td className={`px-6 py-4 text-center text-sm font-semibold ${situationClass}`}>{situation}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div className="w-full bg-white p-4 lg:p-8 rounded-2xl shadow-sm overflow-y-auto h-full">
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileImport}
            />

            {isCreationVisible && creationView}
            {managementView}

            {isImportModalVisible && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
                    aria-modal="true" 
                    role="dialog"
                >
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800">Importar Lista de Alunos</h3>
                            <button 
                                onClick={() => setIsImportModalVisible(false)} 
                                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
                                aria-label="Fechar modal de importação"
                                disabled={isImporting}
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        {isImporting ? (
                             <div className="flex flex-col items-center justify-center p-10">
                                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-slate-600 font-semibold">Analisando arquivo...</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-600 mb-6">
                                    Selecione o formato do arquivo que contém a lista de alunos. A IA irá extrair os nomes para preencher a turma.
                                </p>
        
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button onClick={() => triggerFileUpload('.pdf')} className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-lg border-2 border-transparent hover:border-cyan-500 hover:bg-cyan-50 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500">
                                        <FilePdfIcon className="w-12 h-12 text-red-500 mb-3" />
                                        <span className="font-semibold text-slate-700">PDF</span>
                                    </button>
        
                                    <button onClick={() => triggerFileUpload('image/*')} className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-lg border-2 border-transparent hover:border-cyan-500 hover:bg-cyan-50 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500">
                                        <FileImageIcon className="w-12 h-12 text-blue-500 mb-3" />
                                        <span className="font-semibold text-slate-700">Imagem</span>
                                    </button>
                                </div>
                                {importError && <p className="text-red-600 mt-4 text-sm text-center">{importError}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {isCodeModalVisible && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
                    aria-modal="true" 
                    role="dialog"
                >
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 flex flex-col" style={{maxHeight: '90vh'}}>
                        <div className="flex justify-between items-center mb-4 flex-shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">Gerador de Códigos de Acesso</h3>
                            <button onClick={() => setIsCodeModalVisible(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100"><XIcon className="w-5 h-5" /></button>
                        </div>
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200 flex-shrink-0">
                            <p className="text-sm text-slate-600">Gere e distribua códigos únicos para seus alunos.</p>
                            <button 
                                onClick={handleGenerateCodeForAll} 
                                className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700"
                            >
                                Gerar para toda a turma
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow">
                            <ul className="divide-y divide-slate-200">
                                {currentDiscipline?.alunos.map((aluno, index) => (
                                    <li key={index} className="py-3 flex items-center justify-between">
                                        <span className="font-medium text-slate-800">{aluno.nome}</span>
                                        <div className="flex items-center gap-3">
                                            {aluno.accessCode ? (
                                                <>
                                                    <span className="font-mono text-sm bg-slate-100 text-slate-700 py-1 px-2 rounded-md">{aluno.accessCode}</span>
                                                    <button onClick={() => handleCopyCode(aluno.accessCode!)} className="p-2 text-slate-500 hover:text-cyan-600" title="Copiar código">
                                                        {copiedCode === aluno.accessCode ? <CheckIcon className="w-4 h-4 text-green-600" /> : <CopyIcon className="w-4 h-4" />}
                                                    </button>
                                                    <button onClick={() => handleGenerateCodeForStudent(index)} className="py-1 px-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                                                        Gerar Novo
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => handleGenerateCodeForStudent(index)} className="py-1 px-2 text-xs font-medium text-white bg-slate-500 rounded-md hover:bg-slate-600">
                                                    Gerar
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
