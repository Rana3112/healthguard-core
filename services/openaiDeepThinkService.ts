import { ChatMessage, MessageRole } from "../types";

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5001';
const INVOKE_URL = `${BACKEND_URL}/api/nvidia-deepthink`;

const getEnvVar = (key: string): string | undefined => {
    const viteEnv = (import.meta as any)?.env?.[key];
    if (viteEnv) return viteEnv;
    if (typeof process !== 'undefined') {
        return (process as any)?.env?.[key];
    }
    return undefined;
};

export const sendMessageToOpenAI = async (
    history: ChatMessage[],
    message: string,
    onAnswerChunk?: (text: string) => void,
    onThinkingChunk?: (text: string) => void,
    systemInstruction: string = "You are an incredibly advanced medical reasoning AI. Take your time to think through problems deeply and provide comprehensive, step-by-step reasoning before drawing a conclusion."
) => {
    // Try NVIDIA Kimi K2.5 via backend first
    try {
        const messages: any[] = [
            { role: "system", content: systemInstruction + "\n\nCRITICAL INSTRUCTION: You MUST format ALL your responses using strict Markdown.\n- Use `### ` for headings.\n- Use `- ` for bullet points.\n- Use `**text**` for bold emphasis." },
            ...history.filter(msg => msg.role !== MessageRole.SYSTEM).map(msg => ({
                role: msg.role === MessageRole.USER ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: message }
        ];

        const payload = {
            messages: messages,
            stream: true
        };

        console.log('[Max Deep Think] Calling NVIDIA backend:', INVOKE_URL);

        const response = await fetch(INVOKE_URL, {
            method: 'POST',
            headers: {
                "Accept": "text/event-stream",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[Max Deep Think] Backend error:', response.status, errorData);
            throw new Error(`Backend unavailable: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        let reasoningText = "";
        let buffer = "";

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (dataStr === '[DONE]') break;
                        try {
                            const json = JSON.parse(dataStr);
                            const delta = json.choices?.[0]?.delta;

                            if (delta) {
                                if (delta.reasoning_content) {
                                    reasoningText += delta.reasoning_content;
                                    if (onThinkingChunk) onThinkingChunk(delta.reasoning_content);
                                }

                                if (delta.content) {
                                    fullText += delta.content;
                                    if (onAnswerChunk) onAnswerChunk(delta.content);
                                }
                            }
                        } catch (e) {
                            // ignore partial JSON errors
                        }
                    }
                }
            }
        }

        return {
            text: fullText.trim(),
            reasoningText: reasoningText.trim(),
            toolCalls: null,
            groundingMetadata: null,
            suggestedActions: []
        };

    } catch (backendError) {
        console.warn('[Max Deep Think] NVIDIA backend failed, falling back to OpenRouter:', backendError);

        // Fallback: Use a reasoning model via OpenRouter
        const OPENROUTER_API_KEY = getEnvVar('VITE_OPENROUTER_API_KEY') || getEnvVar('OPENROUTER_API_KEY');
        
        if (!OPENROUTER_API_KEY) {
            throw new Error('Neither NVIDIA backend nor OpenRouter API key available for Max Deep Think');
        }

        const messages: any[] = [
            { role: "system", content: systemInstruction + "\n\nCRITICAL INSTRUCTION: You MUST format ALL your responses using strict Markdown.\n- Use `### ` for headings.\n- Use `- ` for bullet points.\n- Use `**text**` for bold emphasis.\n\nProvide detailed step-by-step reasoning before your final answer." },
            ...history.filter(msg => msg.role !== MessageRole.SYSTEM).map(msg => ({
                role: msg.role === MessageRole.USER ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: message }
        ];

        console.log('[Max Deep Think] Using OpenRouter fallback with deepseek-r1');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-ai/deepseek-r1-0528-qwen3-8b:free', // Free reasoning model
                messages,
                temperature: 0.3,
                max_tokens: 4096,
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[Max Deep Think] OpenRouter fallback error:', errorData);
            throw new Error(`Max Deep Think failed: ${response.status}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || '';

        // Parse thinking content from OpenRouter format (often wrapped in <think> tags)
        let thinkingText = '';
        let finalText = rawContent;

        const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
            thinkingText = thinkMatch[1].trim();
            finalText = rawContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        }

        if (onThinkingChunk && thinkingText) {
            onThinkingChunk(thinkingText);
        }
        if (onAnswerChunk && finalText) {
            onAnswerChunk(finalText);
        }

        return {
            text: finalText.trim(),
            reasoningText: thinkingText.trim(),
            toolCalls: null,
            groundingMetadata: null,
            suggestedActions: []
        };
    }
};
