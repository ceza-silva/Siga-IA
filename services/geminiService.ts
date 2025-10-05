import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import type { FormData, QuizFormData, WordEntry } from '../types';

// Assume que process.env.API_KEY está disponível no ambiente de execução
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'gemini-2.5-flash';

// Função auxiliar para criar um prompt de texto para a API Gemini
const createPrompt = (baseInstruction: string, details: Record<string, any>, fileContent?: string, fileName?: string): string => {
    let prompt = `${baseInstruction}\n\n`;
    for (const [key, value] of Object.entries(details)) {
        if (value && value !== 'None') {
            prompt += `**${key}:** ${value}\n`;
        }
    }
    if (fileContent) {
        prompt += `\n**Conteúdo do Arquivo Anexado (${fileName || 'anexo'}):**\n---\n${fileContent}\n---\n`;
    }
    return prompt;
};

export const generateLessonPlan = async (formData: FormData, fileContent: string, fileName: string): Promise<{ text: string; sources: { uri: string; title: string; }[] | undefined }> => {
    const { buscarNaWeb, ...details } = formData;
    const prompt = createPrompt(
        "Você é um assistente especialista em educação. Crie um plano de aula detalhado e estruturado com base nas seguintes especificações. O plano deve ser bem organizado, com seções claras (como 'Objetivos de Aprendizagem', 'Habilidades da BNCC', 'Metodologia', etc.), e alinhado às práticas pedagógicas modernas.",
        {
            "Disciplina": details.disciplina,
            "Ano de Escolaridade": details.anoEscolaridade,
            "Tema/Assunto": details.assunto,
            "Habilidade da BNCC (Opcional)": details.bncc,
            "Duração da Aula (minutos)": details.duracaoAula,
            "Metodologia Proposta (Opcional)": details.metodologia,
            "Detalhes Adicionais (Opcional)": details.detalhesAdicionais,
        },
        fileContent,
        fileName
    );
    
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            tools: buscarNaWeb ? [{ googleSearch: {} }] : undefined,
        },
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || 'Fonte da Web',
    }))?.filter((source: any) => source.uri);

    return { text: response.text, sources };
};

export const suggestMethodology = async (formData: FormData): Promise<string> => {
    const prompt = `Com base nos seguintes detalhes de um plano de aula, sugira uma metodologia de ensino inovadora e eficaz. Forneça uma descrição breve e direta da metodologia.
- Disciplina: ${formData.disciplina}
- Ano de Escolaridade: ${formData.anoEscolaridade}
- Tema/Assunto: ${formData.assunto}
- Detalhes Adicionais: ${formData.detalhesAdicionais}`;

    const response = await ai.models.generateContent({ model: model, contents: prompt });
    return response.text;
};

export const generateSummary = async (currentPlanContent: string): Promise<string> => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = currentPlanContent;
    const textContent = tempDiv.textContent || "";
    
    const prompt = `Resuma o seguinte plano de aula em um formato conciso e claro, ideal para uma visão rápida do professor. Mantenha os pontos essenciais e a estrutura principal.
    ---
    ${textContent.substring(0, 8000)}
    ---`;

    const response = await ai.models.generateContent({ model: model, contents: prompt });
    return response.text;
};

export const generateQuiz = async (formData: QuizFormData, fileContent: string): Promise<{ questions: any[] }> => {
    const { tiposQuestao, numQuestoesMultipla, numQuestoesDiscursiva, ...details } = formData;
    const questionTypesDescription = tiposQuestao.join(' e ');
    let questionsDescription = '';
    if (tiposQuestao.includes('multipla') && numQuestoesMultipla > 0) {
        questionsDescription += ` - ${numQuestoesMultipla} questões de múltipla escolha (com 4 opções cada e indicação da correta).\n`;
    }
    if (tiposQuestao.includes('discursiva') && numQuestoesDiscursiva > 0) {
        questionsDescription += ` - ${numQuestoesDiscursiva} questões discursivas (com sugestão de resposta).`;
    }

    const prompt = createPrompt(
        `Crie uma prova (avaliação) com base nas especificações abaixo. As questões devem ser claras, relevantes e adequadas ao nível de ensino. ${fileContent ? 'Utilize o conteúdo do arquivo anexado como base principal para as questões.' : ''} O resultado deve ser um JSON.`,
        {
            "Componente Curricular": details.componente,
            "Ano de Escolaridade": details.ano,
            "Assunto": details.assunto,
            "Tipos de Questão": questionTypesDescription,
            "Estrutura": `\n${questionsDescription}`,
        },
        fileContent
    );
    
    const quizSchema = {
        type: Type.OBJECT,
        properties: {
            questions: {
                type: Type.ARRAY,
                description: "Lista de questões da prova.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            description: "Tipo da questão, 'multiple_choice' ou 'discursive'.",
                            enum: ['multiple_choice', 'discursive'],
                        },
                        question: {
                            type: Type.STRING,
                            description: "O enunciado da questão.",
                        },
                        options: {
                            type: Type.ARRAY,
                            description: "Lista de 4 opções para questões de múltipla escolha.",
                            items: { type: Type.STRING },
                        },
                        answer: {
                            type: Type.STRING,
                            description: "A resposta correta. Para múltipla escolha, deve ser o texto de uma das opções. Para discursiva, uma resposta esperada.",
                        },
                    },
                    required: ["type", "question", "answer"],
                },
            },
        },
        required: ["questions"],
    };

    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: quizSchema,
        },
    });

    try {
        const jsonResponse = JSON.parse(response.text);
        if (jsonResponse.questions && Array.isArray(jsonResponse.questions)) {
             return { questions: jsonResponse.questions };
        }
        throw new Error("Formato de resposta da IA inesperado: a propriedade 'questions' não foi encontrada ou não é um array.");
    } catch (e: any) {
        console.error("Erro ao parsear a resposta JSON do quiz:", e);
        throw new Error(`Não foi possível gerar a prova. A resposta da IA não é um JSON válido. Detalhes: ${e.message}`);
    }
};

export const suggestQuizTopics = async (componente: string, ano: string): Promise<string> => {
    const prompt = `Sugira um tópico específico e relevante para uma avaliação de ${componente} para o ${ano}. Seja breve e direto, retorne apenas o nome do tópico.`;
    const response = await ai.models.generateContent({ model: model, contents: prompt });
    return response.text.replace(/["*]/g, '').trim();
};

const generateCrosswordWordsFromPrompt = async (prompt: string, wordCount: number): Promise<WordEntry[]> => {
     const crosswordSchema = {
        type: Type.ARRAY,
        description: `Lista de ${wordCount} palavras e suas dicas para as palavras cruzadas.`,
        items: {
            type: Type.OBJECT,
            properties: {
                word: {
                    type: Type.STRING,
                    description: "A palavra, com no máximo 15 letras, sem espaços ou hífens, e em maiúsculas.",
                },
                clue: {
                    type: Type.STRING,
                    description: "A dica correspondente para a palavra.",
                },
            },
            required: ["word", "clue"],
        },
    };

    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: crosswordSchema,
        },
    });

    try {
        return JSON.parse(response.text);
    } catch (e: any) {
        console.error("Erro ao parsear a resposta JSON das palavras cruzadas:", e);
        throw new Error(`Não foi possível gerar as palavras. A resposta da IA não é um JSON válido. Detalhes: ${e.message}`);
    }
};

export const generateCrosswordWords = async (
    topic: string,
    curricularComponent: string,
    schoolYear: string,
    wordCount: number
): Promise<WordEntry[]> => {
    const prompt = `Gere uma lista de ${wordCount} palavras (com no máximo 15 letras, sem espaços ou hífens) e suas respectivas dicas para um jogo de palavras cruzadas. As palavras devem estar em maiúsculas.
    - Tema: ${topic}
    - Componente Curricular: ${curricularComponent}
    - Ano Escolar: ${schoolYear}`;
    return generateCrosswordWordsFromPrompt(prompt, wordCount);
};

export const generateCrosswordWordsFromFileContent = async (
    fileContent: string,
    curricularComponent: string,
    schoolYear: string,
    wordCount: number
): Promise<WordEntry[]> => {
    const prompt = `Com base no conteúdo do texto abaixo, gere uma lista de ${wordCount} palavras-chave (com no máximo 15 letras, sem espaços ou hífens) e suas respectivas dicas para um jogo de palavras cruzadas. As palavras devem estar em maiúsculas.
    - Componente Curricular: ${curricularComponent}
    - Ano Escolar: ${schoolYear}
    ---
    ${fileContent.substring(0, 8000)}
    ---`;
    return generateCrosswordWordsFromPrompt(prompt, wordCount);
};

export const extractStudentNames = async (
    content: { text?: string; imageBase64?: string; mimeType?: string }
): Promise<string[]> => {
    const parts: any[] = [];
    const promptText = "A partir do conteúdo a seguir, extraia os nomes completos dos alunos. Retorne o resultado em formato JSON com uma chave 'names' contendo uma lista de strings. Se não houver nomes, retorne uma lista vazia.";

    if (content.text) {
        parts.push({ text: content.text });
    }
    if (content.imageBase64 && content.mimeType) {
        parts.push({
            inlineData: {
                mimeType: content.mimeType,
                data: content.imageBase64,
            },
        });
    }
    
    if (parts.length === 0) {
        return [];
    }
    
    parts.push({ text: promptText }); // Adiciona o prompt como a última parte

    const schema = {
        type: Type.OBJECT,
        properties: {
            names: {
                type: Type.ARRAY,
                description: "Lista de nomes completos dos alunos extraídos do conteúdo.",
                items: { type: Type.STRING },
            },
        },
        required: ["names"],
    };

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: { parts: parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
        },
    });

    try {
        const jsonResponse = JSON.parse(response.text);
        return jsonResponse.names || [];
    } catch (e: any) {
        console.error("Erro ao parsear a resposta JSON da extração de nomes:", e);
        throw new Error(`Não foi possível extrair os nomes. A resposta da IA não é um JSON válido. Detalhes: ${e.message}`);
    }
};
