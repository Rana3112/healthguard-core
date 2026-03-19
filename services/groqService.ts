import Groq from "groq-sdk";
import { ChatMessage, MessageRole } from "../types";

const getEnvVar = (key: string): string | undefined => {
    const viteEnv = (import.meta as any)?.env?.[key];
    if (viteEnv) return viteEnv;
    if (typeof process !== 'undefined') {
        return (process as any)?.env?.[key];
    }
    return undefined;
};

// Initialize Groq client
// Note: In client-side Vite, we access it via process.env.GROQ_API_KEY (configured in vite.config.ts)
const groq = new Groq({
    apiKey: getEnvVar('VITE_GROQ_API_KEY') || getEnvVar('GROQ_API_KEY') || "dummy_key",
    dangerouslyAllowBrowser: true // Required for client-side use
});

export const sendMessageToGroq = async (
    history: ChatMessage[],
    message: string,
    systemInstruction: string = "You are a helpful assistant.",
    model: string = "llama-3.1-8b-instant"
) => {
    try {
        // Convert history to Groq format
        const messages: any[] = [
            { role: "system", content: systemInstruction + "\n\nCRITICAL INSTRUCTION: You MUST format ALL your responses using strict Markdown.\n- Use `### ` for headings.\n- Use `- ` for bullet points.\n- Use `**text**` for bold emphasis.\n- For any tabular data, you MUST use strict Markdown tables with `|` dividers (e.g., `| Column 1 | Column 2 |\n|---|---|`).\n- DO NOT output plain text lists or tables separated only by spaces/tabs.\n\nIMPORTANT: At the very end of your response, provide 4-5 short, relevant options for what the USER might say next. \nINCLUDE ACTIONABLE ITEMS if relevant (e.g., 'Order this product', 'Find a doctor nearby', 'Set a reminder').\nFormat them exactly like this:\n>> suggested user reply 1\n>> suggested user reply 2\n>> suggested user reply 3\n>> suggested user reply 4\n>> suggested user reply 5" },
            ...history.filter(msg => msg.role !== MessageRole.SYSTEM).map(msg => ({
                role: msg.role === MessageRole.USER ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: message }
        ];

        const completion = await groq.chat.completions.create({
            messages: messages,
            model: model,
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stop: null,
            stream: false
        });

        const rawText = completion.choices[0]?.message?.content || "No response received.";

        // Extract suggested actions
        const suggestedActions: string[] = [];
        const lines = rawText.split('\n');
        const cleanLines: string[] = [];

        for (const line of lines) {
            if (line.trim().startsWith('>>')) {
                const action = line.replace(/^>>\s*/, '').trim();
                if (action) suggestedActions.push(action);
            } else {
                cleanLines.push(line);
            }
        }

        return {
            text: cleanLines.join('\n').trim(),
            toolCalls: null,
            groundingMetadata: null,
            suggestedActions: suggestedActions.slice(0, 5)
        };

    } catch (error) {
        console.error("Groq API Error:", error);
        throw error;
    }
};
