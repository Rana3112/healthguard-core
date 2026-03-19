import React from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Tool, Schema, Modality } from "@google/genai";
import { sendMessageToGroq } from './groqService';
import { AgentAction, HealthOrder, HealthAlert, ChatMessage, MessageRole } from "../types";

export type ModelMode = 'fast' | 'standard' | 'thinking' | 'max_deep_think' | 'vision' | 'agent';

// Tools Definition for Agentic AI

// Tools Definition for Agentic AI
const searchMedicineTool: FunctionDeclaration = {
  name: 'searchMedicine',
  description: 'Search for medicine or healthcare product prices across multiple Indian e-commerce platforms (Amazon, Flipkart, 1mg, Apollo, PharmEasy, Netmeds). Returns real prices and buy links sorted by cheapest. Use this when the user asks to buy, order, or find prices for any medicine, supplement, or health product.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Name of the medicine or health product to search for' },
    },
    required: ['query']
  }
};

const setHealthAlertTool: FunctionDeclaration = {
  name: 'setHealthAlert',
  description: 'Set a reminder or alert for taking medicine, drinking water, or dietary checks.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING, description: 'The content of the alert' },
      time: { type: Type.STRING, description: 'Time for the alert (e.g., "2:00 PM")' }
    },
    required: ['message', 'time']
  }
};

export const toolsDef: Tool[] = [
  { functionDeclarations: [searchMedicineTool, setHealthAlertTool] },
];

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'https://healthguard-backend-yo9a.onrender.com';

// Helper to handle tool calls — now async for API calls
export const handleToolCall = async (
  functionCall: any,
  dispatch: React.Dispatch<AgentAction>
): Promise<any> => {
  const { name, args } = functionCall;

  if (name === 'searchMedicine') {
    const query = args.query || '';

    try {
      const response = await fetch(`${BACKEND_URL}/search-medicine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();

      if (data.success && data.best_picks && data.best_picks.length > 0) {
        // Build a text summary for the AI to reference
        const cheapest = data.cheapest;
        let summary = `Found ${data.total_results} results for "${query}". `;
        summary += `Cheapest: ${cheapest?.title} at ${cheapest?.price_display} on ${cheapest?.platform}. `;
        summary += `Prices across platforms: `;
        summary += data.best_picks.map((r: any) => `${r.platform}: ${r.price_display}`).join(', ');

        return {
          result: summary,
          priceData: {
            query,
            results: data.best_picks,
            cheapest: data.cheapest
          }
        };
      } else {
        return { result: data.error || `No results found for "${query}". The search API may not be configured.` };
      }
    } catch (err) {
      console.error("Search Tool Error:", err);
      return { result: `[SYSTEM ERROR] Medicine search failed: Could not reach the backend server at ${BACKEND_URL}. Ensure server.py is running.` };
    }
  }

  if (name === 'setHealthAlert') {
    const alert: HealthAlert = {
      id: Math.random().toString(36).substr(2, 9),
      message: args.message,
      time: args.time,
      active: true
    };
    dispatch({ type: 'ADD_ALERT', payload: alert });
    return { result: `Alert set for ${args.time}: ${args.message}` };
  }

  return { result: 'Function executed successfully' };
};



// Standard Text/Multimodal Chat
import { sendMessageToOpenRouter } from './openRouterService';



// Define the return type explicitly
interface AgentResponse {
  text: string;
  toolCalls: any;
  groundingMetadata: any;
  suggestedActions: string[];
  image: any;
  audio: any;
  priceComparison?: {
    query: string;
    results: any[];
    cheapest: any;
  };
}

export const sendMessageToAgent = async (
  history: ChatMessage[],
  message: string,
  image?: string,
  isEditRequest: boolean = false,
  userLocation?: { lat: number; lng: number } | null,
  mode: ModelMode = 'standard',
  clinicalMemory?: string
): Promise<AgentResponse> => {
  // Initialize Gemini AI Client (Optional if only using Groq/OpenRouter)
  let ai: any = null;
  const geminiApiKey =
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    (import.meta as any)?.env?.API_KEY ||
    (typeof process !== 'undefined' ? (process as any)?.env?.API_KEY : undefined);
  if (geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
  }

  // --- MODE ROUTING ---

  // VISION MODE: Gemini 2.5 Flash (direct API) for image analysis
  if (mode === 'vision') {
    console.log("VISION MODE: Using Gemini 2.5 Flash for Visual Analysis.");
    console.log("Image present:", !!image, "Image length:", image?.length);

    if (!ai) return { text: "Error: Gemini API Key missing. Cannot analyze images without it.", toolCalls: null, groundingMetadata: null, suggestedActions: [], image: undefined, audio: null };

    if (!image) {
      return { text: "Please attach an image first, then send your query in Vision mode.", toolCalls: null, groundingMetadata: null, suggestedActions: [], image: undefined, audio: null };
    }

    const locationString = userLocation ? `User is located near ${userLocation.lat}, ${userLocation.lng}.` : '';

    const visionSystemPrompt = `You are HealthGuard, an expert medical AI assistant.
    You MUST analyze the attached image in detail. The user has explicitly asked for image analysis.
    ${locationString}
    Guidelines: 
    1. If it's a medicine bottle/box/strip, identify the exact product (name, generic name, strength, manufacturer) and provide:
       - What it's used for
       - Typical dosage
       - Side effects
       - Precautions
       - Indian home remedy alternatives (if applicable)
    2. If it's a prescription or medical report, extract and explain all details.
    3. If it's a physical symptom photo, analyze with care (always disclaim that this is not a substitute for professional medical advice).
    4. Be specific, helpful, and empathetic. Do NOT ask the user to provide more info if the image clearly shows what they're asking about.

    FORMATTING RULES (CRITICAL):
    - You MUST use beautiful, structured Markdown formatting.
    - Use Markdown Tables (e.g. | Column | Column |) to present list of medications, their generic names, doses, or any structured data.
    - Use Markdown bolding (**text**) or highlighting if applicable for critical keywords, warnings, or medication names.
    - Always include a clear "Do's and Don'ts" section for precautions and instructions, formatted as bullet points.
    - Keep the visual hierarchy clean with appropriate headers (###).
    
    At the very end of your response, provide 4-5 suggested follow-up actions on separate lines, each prefixed with ">> ".`;

    const currentParts: any[] = [
      { inlineData: { mimeType: 'image/jpeg', data: image } },
      { text: message || "Analyze this image in detail." }
    ];

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: currentParts }],
        config: {
          systemInstruction: visionSystemPrompt
        }
      });

      const rawText = response.text || "I couldn't analyze the image. Please try again.";

      const suggestedActions: string[] = [];
      const cleanLines: string[] = [];
      for (const line of rawText.split('\n')) {
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
        suggestedActions: suggestedActions.slice(0, 5),
        image: undefined,
        audio: null
      };
    } catch (visionErr) {
      console.error("Gemini Vision Error:", visionErr);
      return { text: "Sorry, I couldn't analyze the image. Error: " + (visionErr as Error).message, toolCalls: null, groundingMetadata: null, suggestedActions: [], image: undefined, audio: null };
    }
  }

  // Fast Mode: Llama 3.1 via Groq
  if (mode === 'fast') {
    console.log("Using Llama 3.1 (Groq) for Fast Mode");
    const fastSystemPrompt = `You are HealthGuard. Response concisely. 
    ${clinicalMemory ? `
    PREVIOUS CLINICAL ANALYSIS MEMORY:
    ${clinicalMemory}
    Use this prior analysis as context for follow-up questions. Do not restart symptom questioning.` : ''}
     ${userLocation ? `User location: ${userLocation.lat}, ${userLocation.lng}` : ''}
     Guidelines: 1. Prioritize Indian home remedies. 2. Be direct.`;

    const groqResponse = await sendMessageToGroq(history, message, fastSystemPrompt);
    return { ...groqResponse, image: undefined, audio: null };

  } else if (mode === 'thinking') {
    // THINKING MODE: OpenRouter GPT-OSS-120B
    console.log("Using GPT-OSS-120B (OpenRouter) for Thinking Mode");
    const thinkingSystemPrompt = `You are HealthGuard, an expert medical AI. 
    Analyze the user's health query deeply. Think step-by-step.
    ${clinicalMemory ? `
    PREVIOUS CLINICAL ANALYSIS MEMORY:
    ${clinicalMemory}
    Use this as context and do not repeat the initial intake questions.` : ''}
    ${userLocation ? `User location: ${userLocation.lat}, ${userLocation.lng}` : ''}
    Guidelines: 1. Provide detailed, reasoning-based advice. 2. Consider multiple possibilities.`;

    const thinkingResponse = await sendMessageToOpenRouter(history, message, thinkingSystemPrompt, "openai/gpt-oss-120b");
    return { ...thinkingResponse, image: undefined, audio: null };

  } else if (mode === 'agent') {
    // --- AGENT MODE / GPT-OSS-120B OVERRIDE ---
    console.log("AGENT MODE: Using GPT-OSS-120B (OpenRouter) with Force Search.");

    // 1. Force Search Execution (heuristic: if message > 2 chars)
    let searchResults = null;
    let priceComparisonData = undefined;
    let toolResultSummary = "";

    if (message.length > 2) {
      try {
        console.log("Agent Mode: Executing searchMedicine for:", message);
        const manualToolCall = { name: 'searchMedicine', args: { query: message } };
        const toolResult = await handleToolCall(manualToolCall, () => { });

        if (toolResult.priceData) {
          priceComparisonData = toolResult.priceData;
          toolResultSummary = toolResult.result;
        }
      } catch (err) {
        console.error("Agent Search Failed:", err);
        toolResultSummary = "Search failed due to technical error.";
      }
    }

    // 2. Call OpenRouter Model with Context
    console.log("Agent Mode: Price Data Found:", !!priceComparisonData);
    if (priceComparisonData) {
      console.log("Agent Mode: Cheapest Price:", priceComparisonData.cheapest?.price_display);
    }

    const agentSystemPrompt = `You are HealthGuard, an automated shopping agent.
      The user is asking about medicines or health products.
      ${clinicalMemory ? `
      PREVIOUS CLINICAL ANALYSIS MEMORY:
      ${clinicalMemory}
      Use this prior clinical context when answering follow-up questions.` : ''}
      You have access to real-time pricing data.
      
      SEARCH RESULTS:
      ${toolResultSummary}

      GUIDELINES:
      1. Analyze the search results above.
      2. Recommend the best option based on price and platform reliability.
      3. If no results found, apologize and ask for the exact medicine name.
      4. Be concise and professional.
      5. Do NOT hallucinate prices. Use ONLY the data provided.
      `;

    try {
      const openRouterResponse = await sendMessageToOpenRouter(
        history,
        message,
        agentSystemPrompt,
        "openai/gpt-oss-120b"
      );

      console.log("Agent Mode: Final Response Object:", {
        hasText: !!openRouterResponse.text,
        hasPriceData: !!priceComparisonData
      });

      // Return combined response
      return {
        text: openRouterResponse.text,
        toolCalls: null,
        groundingMetadata: null,
        suggestedActions: openRouterResponse.suggestedActions || [],
        image: undefined,
        audio: null,
        priceComparison: priceComparisonData
      };

    } catch (orError) {
      console.error("OpenRouter Agent Call Failed:", orError);
      return {
        text: `I encountered an error connecting to the AI model. \n\n**Search Status:** ${priceComparisonData ? "Success" : "Failed"} \n\n**Debug Info:** ${toolResultSummary}`,
        toolCalls: null,
        groundingMetadata: null,
        suggestedActions: [],
        image: undefined,
        audio: null,
        priceComparison: priceComparisonData
      };
    }

  } else {
    // STANDARD MODE: Fallback to Groq Llama 3.3 70B (Unchanged for text-only)
    console.log("Using Llama 3.3 (Groq) for Standard Mode");

    const standardSystemPrompt = `You are HealthGuard, a compassionate Indian home healthcare assistant.
    ${clinicalMemory ? `
    PREVIOUS CLINICAL ANALYSIS MEMORY:
    ${clinicalMemory}
    Use this prior analysis as context for answering follow-up questions. Do not restart symptom questioning.` : ''}
    1. Prioritize 'Desi' Indian home remedies and affordable middle-class solutions.
    2. When suggesting diets or food, strictly use common, cheap Indian ingredients (e.g., moong dal, chana, sattu, local vegetables, soy chunks). DO NOT suggest expensive western foods like salmon, quinoa, or avocado natively.
    3. Explain in simple, supportive language.
    ${userLocation ? `User location: ${userLocation.lat}, ${userLocation.lng}` : ''}`;

    const standardResponse = await sendMessageToGroq(history, message, standardSystemPrompt, "llama-3.3-70b-versatile");
    return { ...standardResponse, image: undefined, audio: null };
  }

  // UNREACHABLE CODE BELOW (Gemini Legacy)

  // Mode 1: Image Editing (Nano Banana series) - Override mode if editing
  if (isEditRequest && image) {
    if (!ai) return { text: "Error: Gemini API Key missing for Image Editing.", toolCalls: null, groundingMetadata: null, suggestedActions: [], image: undefined, audio: null };
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: image } },
          { text: message }
        ]
      }
    });
    return {
      text: "I've processed the image based on your request.",
      image: response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data,
      groundingMetadata: null,
      toolCalls: null,
      suggestedActions: [],
      audio: null
    };
  }

  // Define Model and Config based on Mode
  let modelId = 'gemini-2.5-flash';
  let config: any = {};

  const locationString = userLocation ? `at latitude ${userLocation.lat}, longitude ${userLocation.lng}` : "unknown";

  let systemInstructionText = `
  You are HealthGuard, a compassionate and knowledgeable Indian home healthcare assistant AND an autonomous shopping agent.
  
  KEY GUIDELINES:
  1. **Indian Home Remedies**: Prioritize 'Desi' home remedies using common Indian kitchen ingredients.
  2. **Dietary Advice**: Prescribe Indian healthy dietary options.
  3. **Simple Language**: Explain everything in very simple, easy-to-understand language.
  4. **Autonomous Ordering**: If the user asks to "order" or "buy" a medicine/product, USE the \`orderProduct\` tool immediately.
`;

  if (mode === 'thinking') {
    // ... (Managed by OpenRouter now, unreachable here normally unless fallback)
  } else {
    // STANDARD MODE: Gemini 2.5 Flash with Grounding
    modelId = 'gemini-2.5-flash';
    systemInstructionText += `
  5. **Visual Aids**: If your advice involves a physical action or specific item, you can generate an image. To do this, include a \`visual_aid_prompt\` in your JSON metadata.
  6. **Location & Maps**: The user is currently located ${locationString}. 
     - If the user asks for a doctor, clinic, or hospital, use \`googleMaps\` to find nearby places.
     - Provide the Name, Address, and Rating if available.
     - Use \`googleSearch\` for broader queries if Maps fails.
  `;
    if (mode === 'agent') {
      systemInstructionText += `\n  7. **AGENT MODE ACTIVE**: You are a Shopping Agent. Your ONLY job is to find prices. \n  - If the user types a product name (e.g., "Paracetamol", "Dolo", "Creatine"), you MUST call the \`searchMedicine\` tool immediately.\n  - Do NOT explain what the product is. Do NOT give medical advice. JUST SEARCH PRICES.\n  - usage: searchMedicine({ query: "formatted_product_name" })\n`;
    }

    // Dynamic Tool Selection based on Intent
    const isOrderingIntent = /order|buy|purchase|price|cheapest|cheap|cost|compare|medicines?|tablets?|pills?|capsules?|pharmacy|amazon|flipkart|1mg|apollo|pharmeasy|netmeds/i.test(message);
    const isLocationIntent = /find|search|location|doctor|clinic|hospital|near|address|map/i.test(message);

    let selectedTools: Tool[] = [];

    if (mode === 'agent' || isOrderingIntent) {
      // Agent mode OR ordering intent: Always use medicine search tools
      selectedTools = [{ functionDeclarations: [searchMedicineTool, setHealthAlertTool] }];
      // FORCE tool use in Agent Mode
      if (mode === 'agent') {
        config.toolConfig = {
          functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['searchMedicine', 'setHealthAlert'] }
        };
      }
    } else if (isLocationIntent) {
      // Prioritize Location Tools
      selectedTools = [{ googleSearch: {}, googleMaps: {} }];
    } else {
      // Default: Enable Search/Maps for general knowledge
      selectedTools = [{ googleSearch: {}, googleMaps: {} }];
    }

    config = {
      tools: selectedTools,
      systemInstruction: systemInstructionText,
    };

    if (userLocation) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.lat,
            longitude: userLocation.lng
          }
        }
      };
    }
  }

  // Common JSON instruction for all modes
  config.systemInstruction += `
  CRITICAL FORMATTING RULES:
  - You MUST use strict Markdown for your entire response.
  - Use \`### \` for section headings.
  - Use \`- \` for bullet points.
  - Use \`| Column 1 | Column 2 |\` pipe syntax for ALL tabular data. Do NOT use spaces/tabs for tables.
  
  OUTPUT FORMAT:
  - Provide your response in rich Markdown text.
  - At the very end of your response, you MUST append a JSON block for metadata (suggested replies, visual aid prompts).
  
  The JSON structure to append:
  \`\`\`json
  {
    "answer": "Use this ONLY if outputting pure JSON.",
    "suggested_replies": ["Reply 1", "Reply 2"],
    "visual_aid_prompt": "Optional image generation prompt"
  }
  \`\`\`
`;


  const pastContent = history
    .filter(msg => msg.role !== MessageRole.SYSTEM)
    .map(msg => ({
      role: msg.role === MessageRole.USER ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

  const currentParts: any[] = [{ text: message }];
  if (image) {
    currentParts.unshift({ inlineData: { mimeType: 'image/jpeg', data: image } });
  }

  const allContents = [
    ...pastContent,
    { role: 'user', parts: currentParts }
  ];

  if (!ai) return { text: "Error: No AI Client available (Missing Gemini API Key and fallback mode not selected).", toolCalls: null, groundingMetadata: null, suggestedActions: [], image: undefined, audio: null };

  const response = await ai.models.generateContent({
    model: modelId,
    contents: allContents,
    config: config
  });

  const toolCalls = response.functionCalls
    ? response.functionCalls()
    : response.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

  let finalToolCalls = toolCalls || [];

  // FALLBACK: If Agent Mode and NO tool called, force search for short queries
  if (mode === 'agent' && (!finalToolCalls || finalToolCalls.length === 0)) {
    if (message.length < 50) { // likely a product name
      console.log("Agent Mode Fallback: Forcing search for:", message);
      finalToolCalls = [{
        name: 'searchMedicine',
        args: { query: message }
      }];
    }
  }

  let finalText = "";
  let suggestedActions: string[] = [];
  let generatedImageBase64: string | undefined = undefined;
  let priceComparisonData: any = undefined;

  // Handle Tool Calls (Synchronous for now, or just return the data for the UI)
  if (finalToolCalls && finalToolCalls.length > 0) {
    console.log("Agent Tool Calls:", finalToolCalls);
    for (const call of finalToolCalls) {
      // Execute the tool (searchMedicine)
      if (call.name === 'searchMedicine') {
        // Create a synthetic dispatch to handle the side effect or just get data
        // In this service architecture, we might just want the data to return to UI
        const toolResult = await handleToolCall(call, () => { }); // Verify handleToolCall logic!

        if (toolResult.priceData) {
          priceComparisonData = toolResult.priceData;
          finalText = toolResult.result; // Use the tool's summary as the bot text
        } else {
          finalText = toolResult.result;
        }
      }
    }
  }

  // If no tool text, use the model's text
  if (!finalText && response.text) {
    finalText = typeof response.text === 'function' ? response.text() : response.text;
  }

  if (!finalText) { // Fallback if still empty
    finalText = "I processed your request using the agent tools."; // generic fallback
  }

  if (finalText && !priceComparisonData) { // Only parse JSON if we are relying on text mode or non-search tools
    const rawText = finalText;
    // ... (rest of JSON parsing logic)
    let jsonFound = false;

    // 1. Try to find JSON block for structured metadata (can be anywhere)
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/) || rawText.match(/({[\s\S]*"suggested_replies"[\s\S]*})/);

    if (jsonMatch) {
      try {
        const potentialJson = jsonMatch[1] || jsonMatch[0];
        // Clean up markdown code block artifacts if present
        const cleanJson = potentialJson.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.suggested_replies || parsed.answer || parsed.visual_aid_prompt) {
          suggestedActions = parsed.suggested_replies || [];
          const visualAidPrompt = parsed.visual_aid_prompt;

          // If answer is provided in JSON, use it. Otherwise, use text minus JSON.
          if (parsed.answer) {
            if (!finalText) finalText = parsed.answer; // Only override if tool execution didn't set it
          } else {
            if (!finalText) finalText = rawText.replace(jsonMatch[0], '').trim();
          }

          // Handle Visual Aid (Only generate if standard mode or requested)
          if (visualAidPrompt && mode !== 'fast') {
            try {
              console.log("Generating visual aid for:", visualAidPrompt);
              const imgResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: visualAidPrompt }] },
                config: { imageConfig: { aspectRatio: '4:3' } }
              });
              const imgPart = imgResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
              if (imgPart?.inlineData?.data) {
                generatedImageBase64 = imgPart.inlineData.data;
              }
            } catch (imgErr) {
              console.error("Failed to generate visual aid:", imgErr);
            }
          }
          jsonFound = true;
        }
      } catch (e) {
        // Not valid JSON, ignore
      }
    }

    if (!jsonFound && !finalText) { // Only set if not already set by tool
      finalText = rawText;
    }

    // 2. Fallback: Neural Extraction from Text (if no JSON found)
    if (!jsonFound) {
      // Look for "Suggested next user replies" or similar headers followed by bullets
      const suggestionRegex = /(?:Suggested next user replies|Next steps|You might ask|Follow-up questions)[:\n]+((?:[-*•] .+(?:\n|$))+)/i;
      const match = rawText.match(suggestionRegex);

      if (match && match[1]) {
        // Remove bullets and trim
        const listItems = match[1].split(/\n/)
          .map(line => line.replace(/^[-*•\d\.]+\s*/, '').trim()) // remove *, -, 1.
          .filter(line => line.length > 5); // meaningful lines

        if (listItems.length > 0) {
          suggestedActions = listItems.slice(0, 4);
        }
      }
    }
  }

  // TTS Feature completely removed per user request
  let audioBase64 = null;

  return {
    text: finalText || "I processed your request.",
    image: generatedImageBase64,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata,
    toolCalls: toolCalls,
    suggestedActions: suggestedActions,
    audio: audioBase64,
    priceComparison: priceComparisonData
  };
};
