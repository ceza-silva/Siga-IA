import React, { useState, useMemo } from 'react';
import type { SchoolsData, Student, Announcement, Activity } from '../types';
import { PencilIcon, ClockIcon, LogoutIcon } from './icons';

// --- TYPE DEFINITIONS ---
type StudentViewProps = {
    schoolsData: SchoolsData;
    studentDetails: {
        school: string;
        discipline: string;
        studentName: string;
    };
    onLogout: () => void;
};

type ActiveTab = 'dashboard' | 'grades' | 'calendar' | 'activities' | 'announcements';

// --- HELPER COMPONENTS ---
const GradeBar: React.FC<{ grade: number | null }> = ({ grade }) => {
    const percentage = grade !== null ? (grade / 10) * 100 : 0;
    let barColor = 'bg-slate-300';
    if (grade !== null) {
        if (grade >= 7) barColor = 'bg-green-500';
        else if (grade >= 5) barColor = 'bg-yellow-500';
        else barColor = 'bg-red-500';
    }

    return (
        <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div className={`${barColor} h-2.5 rounded-full`} style={{ width: `${percentage}%` }}></div>
        </div>
    );
};


// --- MAIN STUDENT VIEW COMPONENT ---
export const StudentView: React.FC<StudentViewProps> = ({ schoolsData, studentDetails, onLogout }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

    const { student, disciplineData, schoolData } = useMemo(() => {
        const school = schoolsData[studentDetails.school];
        const discipline = school?.disciplinas[studentDetails.discipline];
        const studentInfo = discipline?.alunos.find(s => s.nome === studentDetails.studentName);
        return { student: studentInfo, disciplineData: discipline, schoolData: school };
    }, [schoolsData, studentDetails]);

    if (!student || !disciplineData || !schoolData) {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
                <p className="text-red-600">Erro: Não foi possível carregar os dados do aluno.</p>
                <button onClick={onLogout} className="mt-4 py-2 px-4 bg-slate-700 text-white font-semibold rounded-lg">Voltar</button>
            </div>
        );
    }

    const renderContent = () => {
        switch(activeTab) {
            case 'dashboard': return <DashboardView student={student} discipline={disciplineData} />;
            case 'grades': return <GradesView student={student} />;
            case 'calendar': return <CalendarView schedule={disciplineData.schedule} schoolYearStart={schoolData.schoolYearStart} schoolYearEnd={schoolData.schoolYearEnd} />;
            case 'activities': return <ActivitiesView activities={disciplineData.activities} />;
            case 'announcements': return <AnnouncementsView announcements={disciplineData.announcements} />;
            default: return null;
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 font-sans text-slate-800">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-slate-800 text-slate-200 p-6 flex-col hidden md:flex">
                <div className="flex items-center gap-3 mb-10">
                    <PencilIcon className="w-8 h-8 text-cyan-400" />
                    <span className="text-xl font-bold">Área do Aluno</span>
                </div>
                <nav className="flex flex-col space-y-2">
                    <NavItem icon="fa-home" label="Início" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                    <NavItem icon="fa-chart-pie" label="Minhas Notas" active={activeTab === 'grades'} onClick={() => setActiveTab('grades')} />
                    <NavItem icon="fa-calendar-alt" label="Calendário" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
                    <NavItem icon="fa-tasks" label="Atividades" active={activeTab === 'activities'} onClick={() => setActiveTab('activities')} />
                    <NavItem icon="fa-bullhorn" label="Mural de Recados" active={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')} />
                </nav>
                <div className="mt-auto">
                    <button onClick={onLogout} className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-md hover:bg-slate-700 transition-colors">
                        <LogoutIcon className="w-5 h-5" />
                        <span>Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="w-full h-10 bg-slate-700 flex justify-end items-center px-4 flex-shrink-0">
                    <button 
                        onClick={onLogout} 
                        className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                        title="Sair"
                    >
                        <span className="text-sm font-medium hidden sm:inline">Sair</span>
                        <LogoutIcon className="w-5 h-5" />
                    </button>
                </div>
                <header className="bg-white p-4 shadow-sm flex justify-between items-center z-10">
                    <div>
                        <h1 className="text-xl font-bold">{studentDetails.studentName}</h1>
                        <p className="text-sm text-slate-500">{studentDetails.school} - {studentDetails.discipline}</p>
                    </div>
                     {/* Mobile Navigation (placeholder for future implementation) */}
                    <div className="md:hidden">
                        <i className="fas fa-bars fa-lg"></i>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

// --- NAVIGATION ITEM COMPONENT ---
const NavItem: React.FC<{ icon: string; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`flex items-center gap-3 py-2.5 px-3 rounded-md transition-colors text-left ${active ? 'bg-cyan-500 text-white' : 'hover:bg-slate-700'}`}>
        <i className={`fas ${icon} w-5 text-center`}></i>
        <span>{label}</span>
    </button>
);

// --- CONTENT VIEW COMPONENTS ---

const DashboardView: React.FC<{ student: Student; discipline: any }> = ({ student, discipline }) => {
    const nextAnnouncement = discipline.announcements?.[0];
    const pendingActivities = discipline.activities?.filter((a: Activity) => a.status === 'Pendente').length || 0;

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Início</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3">Último Recado</h3>
                    {nextAnnouncement ? (
                        <>
                           <p className="font-semibold text-cyan-700">{nextAnnouncement.title}</p>
                           <p className="text-sm text-slate-600 mt-1 line-clamp-2">{nextAnnouncement.content}</p>
                        </>
                    ) : <p className="text-sm text-slate-500">Nenhum recado recente.</p>}
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3">Atividades Pendentes</h3>
                    <p className="text-4xl font-bold text-cyan-600">{pendingActivities}</p>
                </div>
                 <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3">Visão Geral das Notas</h3>
                    <p className="text-sm text-slate-500">Acompanhe seu progresso ao longo dos bimestres. Detalhes na seção "Minhas Notas".</p>
                </div>
            </div>
        </div>
    );
};

const GradesView: React.FC<{ student: Student }> = ({ student }) => (
    <div>
        <h2 className="text-2xl font-bold mb-6">Minhas Notas</h2>
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="space-y-6">
                {student.notas.map((bimesterNotes, i) => (
                    <div key={i}>
                        <h3 className="font-bold text-lg mb-3">{i + 1}º Bimestre</h3>
                        {bimesterNotes && bimesterNotes.length > 0 ? (
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {bimesterNotes.map((note, j) => (
                                    <div key={j} className="text-center bg-slate-50 p-3 rounded-md border border-slate-200">
                                        <p className="text-sm font-semibold text-slate-500 mb-2">Nota {j + 1}</p>
                                        <p className="text-2xl font-bold">{note?.toFixed(1) ?? '-'}</p>
                                        <div className="mt-2">
                                            <GradeBar grade={note} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 italic">Nenhuma nota lançada para este bimestre.</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const CalendarView: React.FC<{ schedule?: { [key: string]: number[] }, schoolYearStart?: string, schoolYearEnd?: string }> = ({ schedule, schoolYearStart, schoolYearEnd }) => {
    const [viewedDate, setViewedDate] = useState(new Date());

    const year = viewedDate.getFullYear();
    const month = viewedDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const scheduledDays = useMemo(() => {
        if (!schedule) return [];
        const days = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dayOfWeek = weekDays[currentDate.getDay()];
            if (schedule[dayOfWeek]) {
                days.push({
                    date: day,
                    dayName: dayOfWeek,
                    periods: schedule[dayOfWeek]
                });
            }
        }
        return days;
    }, [schedule, year, month, daysInMonth, weekDays]);

    const monthOptions = useMemo(() => {
        const options = [];
        const start = schoolYearStart ? new Date(schoolYearStart) : new Date(new Date().getFullYear(), 0, 1);
        const end = schoolYearEnd ? new Date(schoolYearEnd) : new Date(new Date().getFullYear(), 11, 31);
        let currentDate = new Date(start.getFullYear(), start.getMonth(), 1);
        const lastDate = new Date(end.getFullYear(), end.getMonth(), 1);

        while (currentDate <= lastDate) {
            const y = currentDate.getFullYear();
            const m = currentDate.getMonth();
            options.push({ value: `${y}-${m}`, label: `${months[m]} de ${y}` });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        return options;
    }, [schoolYearStart, schoolYearEnd, months]);

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const [year, month] = e.target.value.split('-').map(Number);
        setViewedDate(new Date(year, month));
    };

    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold">Calendário de Aulas</h2>
                <select value={`${year}-${month}`} onChange={handleMonthChange} className="px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm bg-white">
                    {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
            {!schedule ? (
                 <div className="bg-white p-6 rounded-lg shadow-sm">
                    <p className="text-slate-500">O horário desta turma ainda não foi definido.</p>
                </div>
            ) : scheduledDays.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {scheduledDays.map((day, index) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col items-center text-center shadow-sm">
                            <p className="text-sm font-medium text-slate-500">{day.dayName}</p>
                            <p className="text-4xl font-bold text-slate-800 my-2">{String(day.date).padStart(2, '0')}</p>
                            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                                <ClockIcon className="w-4 h-4" />
                                <span>{day.periods.map(p => `${p}ª`).join(', ')} aulas</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="bg-white p-6 rounded-lg shadow-sm">
                    <p className="text-slate-500">Nenhuma aula agendada para {months[month]} de {year}.</p>
                </div>
            )}
        </div>
    );
};

const ActivitiesView: React.FC<{ activities?: Activity[] }> = ({ activities = [] }) => {
    const sortedActivities = [...activities].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Atividades</h2>
            <div className="bg-white p-4 rounded-lg shadow-sm">
                <ul className="divide-y divide-slate-200">
                    {sortedActivities.length > 0 ? sortedActivities.map(activity => (
                        <li key={activity.id} className="py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold">{activity.title}</p>
                                    <p className="text-sm text-slate-600 mt-1">{activity.description}</p>
                                </div>
                                <div className="text-right ml-4 flex-shrink-0">
                                    <p className={`text-sm font-semibold px-2 py-1 rounded-full ${activity.status === 'Pendente' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{activity.status}</p>
                                    <p className="text-xs text-slate-500 mt-2">Entrega: {new Date(activity.dueDate).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>
                        </li>
                    )) : <p className="text-center py-8 text-slate-500">Nenhuma atividade postada.</p>}
                </ul>
            </div>
        </div>
    );
};

const AnnouncementsView: React.FC<{ announcements?: Announcement[] }> = ({ announcements = [] }) => {
    const sortedAnnouncements = [...announcements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Mural de Recados</h2>
            <div className="space-y-6">
                {sortedAnnouncements.length > 0 ? sortedAnnouncements.map(ann => (
                    <div key={ann.id} className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-cyan-500">
                        <div className="flex justify-between items-baseline">
                             <h3 className="font-bold text-lg">{ann.title}</h3>
                             <p className="text-xs text-slate-500">{new Date(ann.date).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <p className="text-slate-600 mt-2">{ann.content}</p>
                    </div>
                )) : (
                     <div className="bg-white text-center py-12 px-6 rounded-lg shadow-sm">
                        <p className="text-slate-500">Nenhum recado no mural.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
