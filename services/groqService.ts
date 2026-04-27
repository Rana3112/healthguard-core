import Groq from "groq-sdk";
import { ChatMessage, MessageRole } from "../types";
import { getGroqApiKey } from "../src/lib/apiKeys";

const RESPONSE_FORMAT_INSTRUCTIONS = `
CRITICAL INSTRUCTION: You MUST format ALL responses using strict Markdown.
- Start health, fitness, and coaching answers with \`### Most Important\` followed by one **bold** sentence with the key takeaway.
- Use \`###\` headings for each major section.
- Use \`- \` bullet points for actions, precautions, symptoms, and next steps.
- Use **bold** for warnings, medicine names, and critical actions.
- Use *italics* for notes, monitoring advice, or softer guidance.
- For medicines, food plans, workout sets, schedules, comparisons, or any structured data, you MUST use Markdown tables with \`|\` dividers.
- DO NOT output plain text lists or fake tables separated only by spaces.
- For health explanations after the intake/question flow, include visually useful sections:
  - \`### Care Flow\` with 4 short steps: understand -> start care -> monitor -> seek help.
  - \`### Simple Explanation\` explaining cause/effect in plain language.
  - \`### Do First\` and \`### Seek Help If\` as short bullet lists.
- Keep each bullet short enough for a mobile card.

IMPORTANT: At the very end of your response, provide 4-5 short, relevant options for what the USER might say next.
INCLUDE ACTIONABLE ITEMS if relevant (e.g., 'Order this product', 'Find a doctor nearby', 'Set a reminder').
Format them exactly like this:
>> suggested user reply 1
>> suggested user reply 2
>> suggested user reply 3
>> suggested user reply 4
>> suggested user reply 5`;

const getGroqClient = (): Groq => {
    const apiKey = getGroqApiKey();

    if (!apiKey) {
        throw new Error("Missing VITE_GROQ_API_KEY in frontend environment.");
    }

    if (!apiKey.startsWith('gsk_')) {
        throw new Error("Invalid GROQ API key format. Expected key starting with 'gsk_'.");
    }

    return new Groq({
        apiKey,
        dangerouslyAllowBrowser: true
    });
};

export const sendMessageToGroq = async (
    history: ChatMessage[],
    message: string,
    systemInstruction: string = "You are a helpful assistant.",
    model: string = "llama-3.1-8b-instant"
) => {
    try {
        const groq = getGroqClient();

        // Convert history to Groq format
        const messages: any[] = [
            { role: "system", content: `${systemInstruction}\n\n${RESPONSE_FORMAT_INSTRUCTIONS}` },
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
