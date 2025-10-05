import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { PencilIcon, ArrowLeftIcon } from './icons';

interface TeacherLoginScreenProps {
    onBack: () => void;
}

export const TeacherLoginScreen: React.FC<TeacherLoginScreenProps> = ({ onBack }) => {
    const [name, setName] = useState(''); // Mantido para o fluxo de cadastro
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('E-mail e senha são obrigatórios.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Tenta fazer o login primeiro
            await signInWithEmailAndPassword(auth, email, password);
            // O onAuthStateChanged no App.tsx cuidará da navegação
        } catch (loginError: any) {
            // Se o usuário não for encontrado, tenta criar uma nova conta
            if (loginError.code === 'auth/user-not-found') {
                 if (!name.trim()) {
                    setError('Por favor, preencha seu nome para criar uma nova conta.');
                    setIsLoading(false);
                    return;
                }
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                    // O onAuthStateChanged no App.tsx cuidará da navegação
                } catch (signUpError: any) {
                     switch (signUpError.code) {
                        case 'auth/email-already-in-use':
                            setError('Este e-mail já está em uso.');
                            break;
                        case 'auth/weak-password':
                            setError('A senha deve ter no mínimo 6 caracteres.');
                            break;
                        default:
                            setError('Erro ao criar a conta. Tente novamente.');
                            console.error("Firebase SignUp Error:", signUpError);
                    }
                }
            } else {
                 switch (loginError.code) {
                    case 'auth/wrong-password':
                        setError('Senha incorreta. Tente novamente.');
                        break;
                    case 'auth/invalid-email':
                         setError('Formato de e-mail inválido.');
                        break;
                    case 'auth/invalid-credential':
                        setError('Credenciais inválidas. Verifique o e-mail e a senha.');
                        break;
                    case 'auth/invalid-api-key':
                    case 'auth/api-key-not-valid': // Handling the specific error from user log
                        setError('Chave de API do Firebase inválida. Verifique a configuração no arquivo firebase.ts.');
                        break;
                    default:
                        setError('E-mail ou senha inválidos.');
                        console.error("Firebase Login Error:", loginError);
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-100 p-4 relative">
            <button 
                onClick={onBack} 
                className="absolute top-6 left-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-semibold"
            >
                <ArrowLeftIcon className="w-5 h-5"/>
                Voltar
            </button>
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                <div className="flex justify-center mb-6">
                    <PencilIcon className="w-12 h-12 text-cyan-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Acesso do Professor</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700">Nome (para primeiro acesso)</label>
                        <input
                            type="text"
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="Seu nome completo"
                        />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="seu.email@exemplo.com"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-700">Senha</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2.5 border border-slate-300 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="Mínimo 6 caracteres"
                            required
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm text-center">{error}</p>}
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full flex justify-center text-center py-3 px-6 bg-cyan-600 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-700 transition-all disabled:opacity-50"
                    >
                        {isLoading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Entrar ou Cadastrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};
