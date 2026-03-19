import { ClarificationCard, PatientState } from '../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const getEnvVar = (key: string): string | undefined => {
    const viteEnv = (import.meta as any)?.env?.[key];
    if (viteEnv) return viteEnv;
    if (key === 'VITE_GROQ_API_KEY') {
        return (import.meta as any)?.env?.GROQ_API_KEY || (typeof process !== 'undefined' ? (process as any)?.env?.GROQ_API_KEY : undefined) || (typeof process !== 'undefined' ? (process as any)?.env?.VITE_GROQ_API_KEY : undefined);
    }
    if (typeof process !== 'undefined') {
        return (process as any)?.env?.[key];
    }
    return undefined;
};

const DEFAULT_FOLLOW_UPS = [
    'What symptoms should I monitor next?',
    'What should I do right now at home?',
    'When should I see a doctor urgently?',
    'Are there any side effects I should watch for?',
    'Can you suggest Indian home remedies for this?'
];

export const sanitizeFollowUpQuestions = (questions: string[], maxCount: number = 5): string[] => {
    const normalized = questions
        .map((question) => String(question || '').replace(/^[-*•\d).\s]+/, '').trim())
        .filter((question) => question.length > 6 && question.length < 150)
        .map((question) => question.endsWith('?') ? question : `${question}?`);

    const deduped = normalized.filter((question, index, arr) => {
        const key = question.toLowerCase();
        return arr.findIndex((value) => value.toLowerCase() === key) === index;
    });

    return deduped.slice(0, maxCount);
};

export const ensureFollowUpQuestions = (questions: string[], userQuery: string): string[] => {
    const sanitized = sanitizeFollowUpQuestions(questions, 5);
    if (sanitized.length > 0) return sanitized;

    const compactQuery = userQuery.trim();
    if (compactQuery.length > 0) {
        return sanitizeFollowUpQuestions([
            'What are the next steps I should take?',
            'Do I need to see a doctor for this?',
            'Are there any warning signs to watch for?',
            'What home remedies can help with this?',
            'How long will this take to recover from?'
        ], 5);
    }

    return DEFAULT_FOLLOW_UPS;
};

export const FINAL_ANALYSIS_CARD_TEXT = "I have shared enough — provide final analysis";

export const generateCardFromGraphSignal = (
    graphOutput: Pick<PatientState, 'next_card' | 'phase'>
): ClarificationCard | null => {
    if (!graphOutput.next_card) return null;
    if (graphOutput.phase === 'complete') return null;

    const card = graphOutput.next_card;
    return {
        ...card,
        inputType: card.inputType || 'text',
        options: card.options || [],
        textPlaceholder: card.textPlaceholder || card.placeholder,
    };
};

export const generateClarificationCards = async (): Promise<ClarificationCard[]> => {
    return [];
};

// Generate follow-up questions using Groq API
export const generateFollowUpQuestions = async (
    userQuery: string,
    assistantResponse: string
): Promise<string[]> => {
    try {
        const apiKey = getEnvVar('VITE_GROQ_API_KEY');
        
        if (!apiKey) {
            console.warn("Groq API key not found for follow-up questions. Using fallback.");
            return ensureFollowUpQuestions(extractQuestionsFromText(assistantResponse), userQuery);
        }

        const prompt = `You are a helpful medical assistant. Based on the user's question and the AI's response, generate exactly 5 short, highly relevant follow-up questions that a typical Indian user might ask next.

User's Question: "${userQuery}"

AI's Response Summary: "${assistantResponse.substring(0, 800)}..."

Generate questions that:
1. Are things the user would naturally want to know after reading this response
2. Cover different angles: symptoms, remedies, warnings, lifestyle changes, doctor visits
3. Are specific to the context provided
4. Are short and clear (max 10 words each)
5. Are practical and actionable for an Indian household

Return ONLY a valid JSON array of 5 strings (questions with question marks). Nothing else.

Example:
["What home remedies can help?", "When should I see a doctor?", "Are there any side effects?", "What foods should I avoid?", "How long until I recover?"]`;

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You generate helpful follow-up questions. Return only a JSON array of question strings.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 512,
            }),
        });

        if (!response.ok) {
            console.error('Groq API error for follow-up questions:', response.status);
            return ensureFollowUpQuestions(extractQuestionsFromText(assistantResponse), userQuery);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        try {
            // Try to parse as JSON array
            let parsed = JSON.parse(content);
            
            // Handle if it's wrapped in markdown code blocks
            if (typeof parsed === 'string') {
                const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[1]);
                }
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
                return sanitizeFollowUpQuestions(parsed.map(q => String(q)), 5);
            }
        } catch (parseError) {
            console.error("Failed to parse follow-up questions JSON:", parseError);
        }

        return ensureFollowUpQuestions(extractQuestionsFromText(assistantResponse), userQuery);

    } catch (error) {
        console.error("Error generating follow-up questions:", error);
        return ensureFollowUpQuestions(extractQuestionsFromText(assistantResponse), userQuery);
    }
};

// Fallback method to extract questions from the response
const extractQuestionsFromText = (text: string): string[] => {
    const questions: string[] = [];
    
    // Extract sentences that end with ?
    const questionMatches = text.match(/[^.!?]*\?[^.!?]*[.!?]?/g);
    if (questionMatches) {
        for (const match of questionMatches) {
            const cleaned = match.trim().replace(/[.!?]$/, '').trim();
            if (cleaned.length > 10 && cleaned.length < 100 && !questions.includes(cleaned)) {
                questions.push(cleaned + '?');
            }
        }
    }
    
    if (questions.length === 0) {
        return DEFAULT_FOLLOW_UPS;
    }
    
    return sanitizeFollowUpQuestions(questions.slice(0, 5), 5);
};
