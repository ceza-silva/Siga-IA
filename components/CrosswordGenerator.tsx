import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { SavedCrossword } from '../types';
import { ArrowLeftIcon, EditIcon, ExportIcon, FullscreenEnterIcon, FullscreenExitIcon, SaveIcon, XIcon } from './icons';

// --- Tipos Específicos do Componente ---
type PuzzleGrid = ({
    letter: string;
    clueNumber?: number;
    across?: number;
    down?: number;
} | null)[][];

type PuzzleClues = {
    across: { number: number; clue: string }[];
    down: { number: number; clue: string }[];
};

// --- Props do Componente Principal ---
interface CrosswordViewerProps {
    puzzleData: SavedCrossword | (Omit<SavedCrossword, 'id' | 'grid' | 'clues'> & { grid: PuzzleGrid, clues: PuzzleClues });
    onExport: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    onMobileBack: () => void;
    isEditing: boolean;
    editedClues: PuzzleClues | null;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;
    onClueChange: (direction: 'across' | 'down', clueNumber: number, newClueText: string) => void;
}

// Helper component to render a non-interactive grid for the PDF
const PdfPuzzleGrid: React.FC<{ gridData: PuzzleGrid | null }> = ({ gridData }) => {
    if (!gridData) return null;
    const GRID_SIZE = 30;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, border: '1px solid black' }}>
            {gridData.map((row, r) => row.map((cell, c) => {
                if (!cell) {
                    return <div key={`${r}-${c}`} style={{ aspectRatio: '1/1' }} />;
                }
                return (
                    <div key={`${r}-${c}`} style={{ aspectRatio: '1/1', border: '0.5px solid #ccc', backgroundColor: 'white', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                        {cell.clueNumber && <span style={{ position: 'absolute', top: '1px', left: '2px', fontSize: '8px' }}>{cell.clueNumber}</span>}
                    </div>
                );
            }))}
        </div>
    );
};

// Helper component to render the answer grid for the PDF
const PdfAnswerGrid: React.FC<{ gridData: PuzzleGrid | null }> = ({ gridData }) => {
    if (!gridData) return null;
    const GRID_SIZE = 30;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, border: '1px solid black' }}>
            {gridData.map((row, r) => row.map((cell, c) => {
                if (!cell) {
                    return <div key={`${r}-${c}`} style={{ aspectRatio: '1/1' }} />;
                }
                return (
                    <div key={`${r}-${c}`} style={{ aspectRatio: '1/1', border: '0.5px solid #ccc', backgroundColor: 'white', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        {cell.letter}
                    </div>
                );
            }))}
        </div>
    );
};


// --- Componente de Visualização da Palavra Cruzada ---
export const CrosswordViewer: React.FC<CrosswordViewerProps> = ({ puzzleData, onExport, isFullscreen, onToggleFullscreen, onMobileBack, isEditing, editedClues, onStartEdit, onCancelEdit, onSaveEdit, onClueChange }) => {
  // State de Interação
  const [userInput, setUserInput] = useState<Record<string, string>>({});
  const [selectedCell, setSelectedCell] = useState<{ row: number, col: number, direction: 'across' | 'down' } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  
  const { grid, clues, topic } = puzzleData;
  const cluesToDisplay = isEditing ? editedClues : clues;
  const GRID_SIZE = 30;

  // Efeito para resetar a interação quando um novo puzzle é carregado
  useEffect(() => {
      setUserInput({});
      setIsChecking(false);
      setSelectedCell(null);
  }, [puzzleData]);

  // --- Funções de Interação com a Grade ---
  const normalizeString = useCallback((str: string) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
    const value = normalizeString(e.target.value);
    setUserInput(prev => ({ ...prev, [`${row}-${col}`]: value }));
    if (value && selectedCell && grid) {
        const { direction } = selectedCell;
        if (direction === 'across' && col + 1 < GRID_SIZE && grid[row][col + 1]) {
            document.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col + 1}"]`)?.focus();
        } else if (direction === 'down' && row + 1 < GRID_SIZE && grid[row + 1][col]) {
            document.querySelector<HTMLInputElement>(`[data-row="${row + 1}"][data-col="${col}"]`)?.focus();
        }
    }
  }, [selectedCell, grid, GRID_SIZE, normalizeString]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!grid?.[row]?.[col]) {
        setSelectedCell(null);
        return;
    }
    const cell = grid[row][col]!;
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
        if (selectedCell.direction === 'across' && cell.down) {
            setSelectedCell({ row, col, direction: 'down' });
        } else if (selectedCell.direction === 'down' && cell.across) {
            setSelectedCell({ row, col, direction: 'across' });
        }
    } else {
        const direction = cell.across ? 'across' : 'down';
        setSelectedCell({ row, col, direction: direction as 'across' | 'down' });
    }
  }, [grid, selectedCell]);

  const handleCheck = useCallback(() => setIsChecking(true), []);

  const handleReveal = useCallback(() => {
    if (!grid) return;
    const solution: Record<string, string> = {};
    grid.forEach((row, r) => row.forEach((cell, c) => {
        if (cell) solution[`${r}-${c}`] = cell.letter;
    }));
    setUserInput(solution);
    setIsChecking(false);
  }, [grid]);

  const handleReset = useCallback(() => { setUserInput({}); setIsChecking(false); setSelectedCell(null); }, []);
  
  const activeClueNumber = useMemo(() => {
    if (!selectedCell || !grid) return null;
    const { row, col, direction } = selectedCell;
    const cell = grid[row][col];
    return cell ? cell[direction] : null;
  }, [selectedCell, grid]);

  const isCellInActiveWord = useCallback((row: number, col: number) => {
    if (!selectedCell || !grid || !activeClueNumber) return false;
    const { direction } = selectedCell;
    const cell = grid[row][col];
    return !!(cell && cell[direction] === activeClueNumber);
  }, [selectedCell, grid, activeClueNumber]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && isFullscreen) onToggleFullscreen(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  return (
    <>
        <div className={`w-full h-full bg-white flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
            <div className="p-4 sm:p-6 flex justify-between items-center border-b border-slate-200 flex-shrink-0">
            <div className='flex items-center min-w-0'>
                <button onClick={onMobileBack} className="mr-2 p-2 text-slate-600 rounded-full hover:bg-slate-200 md:hidden"><ArrowLeftIcon className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold truncate pr-4">{topic || 'Palavra Cruzada'}</h2>
            </div>
            <div className="flex space-x-2 items-center flex-shrink-0">
                {isEditing ? (
                    <>
                        <button onClick={onSaveEdit} className="bg-green-100 text-green-800 font-semibold py-2 px-3 rounded-md hover:bg-green-200 text-sm flex items-center"><SaveIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Salvar</span></button>
                        <button onClick={onCancelEdit} className="bg-slate-100 text-slate-800 font-semibold py-2 px-3 rounded-md hover:bg-slate-200 text-sm flex items-center"><XIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Cancelar</span></button>
                    </>
                ) : (
                    <>
                        <button onClick={onStartEdit} className="bg-cyan-100 text-cyan-800 font-semibold py-2 px-3 rounded-md hover:bg-cyan-200 transition-all text-sm flex items-center"><EditIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Editar Dicas</span></button>
                        <button onClick={onExport} className="bg-cyan-100 text-cyan-800 font-semibold py-2 px-3 rounded-md hover:bg-cyan-200 transition-all text-sm flex items-center"><ExportIcon className="w-4 h-4" /> <span className="hidden md:inline ml-2">Exportar</span></button>
                        <button onClick={onToggleFullscreen} className="p-2.5 rounded-md hover:bg-slate-100 transition-all text-sm flex items-center" title={isFullscreen ? "Sair" : "Tela Cheia"}>{isFullscreen ? <FullscreenExitIcon className="w-4 h-4" /> : <FullscreenEnterIcon className="w-4 h-4" />}</button>
                    </>
                )}
            </div>
            </div>
            <div className="flex-grow overflow-y-auto" id="puzzle-area">
                <div className="p-4 sm:p-8 max-w-5xl mx-auto">
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="w-full lg:flex-1 mx-auto" style={{aspectRatio: '1/1'}}>
                            <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
                                {grid?.map((row, r) => row.map((cell, c) => {
                                    if (!cell) return <div key={`${r}-${c}`} className="aspect-square" />;
                                    const cellKey = `${r}-${c}`;
                                    const isSelected = selectedCell && selectedCell.row === r && selectedCell.col === c;
                                    const isInActiveWord = isCellInActiveWord(r, c);
                                    const isCorrect = isChecking && cell && userInput[cellKey] === cell.letter;
                                    const isIncorrect = isChecking && cell && userInput[cellKey] && userInput[cellKey] !== cell.letter;
                                    let cellClasses = "relative w-full aspect-square flex items-center justify-center text-xs sm:text-base font-bold uppercase select-none border border-slate-400 bg-white transition-colors duration-200";
                                    if (isInActiveWord) cellClasses += " bg-cyan-100";
                                    if (isSelected) cellClasses += " !bg-cyan-300 ring-2 ring-cyan-500 z-10";
                                    if (isCorrect) cellClasses += " !bg-green-200 text-green-800";
                                    if (isIncorrect) cellClasses += " !bg-red-200 text-red-800";

                                    return (
                                    <div key={cellKey} className={cellClasses}>
                                        {cell.clueNumber && <span className="absolute top-0 left-0.5 text-[7px] sm:text-[10px] font-normal text-slate-500">{cell.clueNumber}</span>}
                                        <input type="text" maxLength={1} value={userInput[cellKey] || ''} onChange={(e) => handleInputChange(e, r, c)} onClick={() => handleCellClick(r, c)} data-row={r} data-col={c} className="w-full h-full text-center bg-transparent border-0 p-0 focus:ring-0 focus:outline-none" disabled={isChecking} />
                                    </div>
                                    );
                                }))}
                            </div>
                        </div>
                        <div className="w-full lg:w-auto lg:max-w-xs text-sm">
                        <div>
                            <h3 className="text-lg font-bold border-b-2 border-slate-300 pb-1 mb-2">Horizontal</h3>
                            <ul className="space-y-2 pr-2 text-slate-700 max-h-64 overflow-y-auto">
                            {cluesToDisplay?.across.map(({ number, clue }) => (
                                <li key={`a-${number}`} className='leading-snug flex items-start text-left'>
                                    <strong className="mr-1.5 pt-1 flex-shrink-0">{number}.</strong>
                                    {isEditing ? (
                                        <textarea 
                                            value={clue} 
                                            onChange={(e) => onClueChange('across', number, e.target.value)}
                                            className="w-full text-sm p-2 border border-slate-300 rounded-md resize-none focus:ring-cyan-500 focus:border-cyan-500"
                                            rows={3}
                                            aria-label={`Editar dica horizontal ${number}`}
                                        />
                                    ) : (
                                        <span>{clue}</span>
                                    )}
                                </li>
                            ))}
                            </ul>
                        </div>
                        <div className="mt-6">
                            <h3 className="text-lg font-bold border-b-2 border-slate-300 pb-1 mb-2">Vertical</h3>
                            <ul className="space-y-2 pr-2 text-slate-700 max-h-64 overflow-y-auto">
                            {cluesToDisplay?.down.map(({ number, clue }) => (
                                <li key={`d-${number}`} className='leading-snug flex items-start text-left'>
                                    <strong className="mr-1.5 pt-1 flex-shrink-0">{number}.</strong>
                                    {isEditing ? (
                                        <textarea 
                                            value={clue} 
                                            onChange={(e) => onClueChange('down', number, e.target.value)}
                                            className="w-full text-sm p-2 border border-slate-300 rounded-md resize-none focus:ring-cyan-500 focus:border-cyan-500"
                                            rows={3}
                                            aria-label={`Editar dica vertical ${number}`}
                                        />
                                    ) : (
                                        <span>{clue}</span>
                                    )}
                                </li>
                            ))}
                            </ul>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-auto p-4 border-t border-slate-200 flex justify-center items-center space-x-4 flex-shrink-0">
                <button onClick={handleCheck} disabled={isEditing} className="bg-green-100 text-green-800 font-semibold py-2 px-4 rounded-md hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed">Verificar</button>
                <button onClick={handleReveal} disabled={isEditing} className="bg-yellow-100 text-yellow-800 font-semibold py-2 px-4 rounded-md hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed">Revelar</button>
                <button onClick={handleReset} disabled={isEditing} className="bg-red-100 text-red-800 font-semibold py-2 px-4 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed">Limpar</button>
            </div>
        </div>

        {/* Hidden container for PDF export */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0, color: 'black' }}>
            <div id="crossword-pdf-container">
                {/* Page 1: Puzzle */}
                <div style={{ width: '210mm', height: '297mm', padding: '10mm', boxSizing: 'border-box', backgroundColor: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>
                    <h2 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', flexShrink: 0 }}>{topic || 'Palavra Cruzada'}</h2>
                    <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
                        <div style={{ width: '100%', maxWidth: '180mm', aspectRatio: '1/1' }}>
                            <PdfPuzzleGrid gridData={grid} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px', fontSize: '9pt', lineHeight: 1.4, flexShrink: 0 }}>
                        <div>
                            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px' }}>Horizontal</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {clues?.across.map(({ number, clue }) => <li key={`pdf-a-${number}`} style={{ marginBottom: '4px' }}><strong style={{ marginRight: '4px' }}>{number}.</strong>{clue}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px' }}>Vertical</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {clues?.down.map(({ number, clue }) => <li key={`pdf-d-${number}`} style={{ marginBottom: '4px' }}><strong style={{ marginRight: '4px' }}>{number}.</strong>{clue}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Page 2: Answer Key (Gabarito) */}
                <div style={{ pageBreakBefore: 'always', width: '210mm', height: '297mm', padding: '10mm', boxSizing: 'border-box', backgroundColor: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>
                    <h2 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', flexShrink: 0 }}>Gabarito - {topic || 'Palavra Cruzada'}</h2>
                    <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
                        <div style={{ width: '100%', maxWidth: '180mm', aspectRatio: '1/1' }}>
                            <PdfAnswerGrid gridData={grid} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px', fontSize: '9pt', lineHeight: 1.4, flexShrink: 0 }}>
                        <div>
                            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px' }}>Horizontal</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {clues?.across.map(({ number, clue }) => <li key={`pdf-a-g-${number}`} style={{ marginBottom: '4px' }}><strong style={{ marginRight: '4px' }}>{number}.</strong>{clue}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px' }}>Vertical</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {clues?.down.map(({ number, clue }) => <li key={`pdf-d-g-${number}`} style={{ marginBottom: '4px' }}><strong style={{ marginRight: '4px' }}>{number}.</strong>{clue}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>
  );
};
