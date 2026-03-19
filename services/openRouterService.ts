import { ChatMessage, MessageRole } from "../types";

const getEnvVar = (key: string): string | undefined => {
    const viteEnv = (import.meta as any)?.env?.[key];
    if (viteEnv) return viteEnv;
    if (typeof process !== 'undefined') {
        return (process as any)?.env?.[key];
    }
    return undefined;
};

const OPENROUTER_API_KEY = getEnvVar('VITE_OPENROUTER_API_KEY') || getEnvVar('OPENROUTER_API_KEY');
const SITE_URL = "http://localhost:5175"; // Optional, for OpenRouter rankings
const SITE_NAME = "HealthGuard AI"; // Optional

export const sendMessageToOpenRouter = async (
    history: ChatMessage[],
    message: string,
    systemInstruction: string = "You are a helpful assistant.",
    model: string = "openai/gpt-oss-120b", // Default to the requested model
    image?: string // Base64 image string
) => {
    if (!OPENROUTER_API_KEY) {
        throw new Error("OpenRouter API Key is missing. Please check .env.local");
    }

    try {
        const messages: any[] = [
            { role: "system", content: systemInstruction + "\n\nIMPORTANT: At the very end of your response, provide 4-5 short, relevant options for what the USER might say next. \nINCLUDE ACTIONABLE ITEMS if relevant (e.g., 'Order this product', 'Find a doctor nearby', 'Set a reminder').\nFormat them exactly like this:\n>> suggested user reply 1\n>> suggested user reply 2\n>> suggested user reply 3\n>> suggested user reply 4\n>> suggested user reply 5" },
            ...history.filter(msg => msg.role !== MessageRole.SYSTEM).map(msg => {
                const content: any = [{ type: "text", text: msg.text }];
                if (msg.image) {
                    // If history has images, we can include them if the model supports it. 
                    // For now, let's keep history text-only to save tokens unless it's critical.
                    // Or strictly follow the user's current request multimodal format.
                }
                return {
                    role: msg.role === MessageRole.USER ? "user" : "assistant",
                    content: msg.text // Simplified for history
                };
            })
        ];

        // Construct current user message
        const currentContent: any[] = [{ type: "text", text: message }];
        if (image) {
            currentContent.push({
                type: "image_url",
                image_url: {
                    url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
                }
            });
        }

        messages.push({ role: "user", content: currentContent });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2048, // Higher for "Deep Think"
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`OpenRouter API Error: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.choices[0]?.message?.content || "No response received.";

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
            groundingMetadata: null, // OpenRouter doesn't typically provide grounding like Gemini
            suggestedActions: suggestedActions.slice(0, 5)
        };

    } catch (error) {
        console.error("OpenRouter Service Error:", error);
        throw error;
    }
};
