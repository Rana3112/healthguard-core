import React from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Tool, Schema, Modality } from "@google/genai";
import { AgentAction, HealthOrder, HealthAlert, ChatMessage, MessageRole } from "../types";

export type ModelMode = 'fast' | 'standard' | 'thinking';

// Tools Definition for Agentic AI
const orderProductTool: FunctionDeclaration = {
  name: 'orderProduct',
  description: 'Automatically order a healthcare product, medicine, or dietary food item from online stores (Amazon, Flipkart, 1mg) and process payment.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      item: { type: Type.STRING, description: 'Name of the medicine or food item' },
      type: { type: Type.STRING, description: 'Category: "medicine" or "food"', enum: ['medicine', 'food'] },
      quantity: { type: Type.INTEGER, description: 'Quantity to order' },
      platform: { 
        type: Type.STRING, 
        description: 'Preferred online platform', 
        enum: ['Amazon', 'Flipkart', '1mg', 'Apollo'] 
      }
    },
    required: ['item', 'type']
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
  { functionDeclarations: [orderProductTool, setHealthAlertTool] },
  { googleSearch: {}, googleMaps: {} } // Enable Search and Maps Grounding
];

// Helper to handle tool calls locally
export const handleToolCall = (
  functionCall: any, 
  dispatch: React.Dispatch<AgentAction>
): any => {
  const { name, args } = functionCall;
  
  if (name === 'orderProduct') {
    const platform = args.platform || 'Amazon';
    const quantity = args.quantity || 1;
    
    // Instead of creating the order immediately, we start the visual agent session
    // The AgentActivityMonitor component will handle the actual order creation after simulation
    dispatch({ 
      type: 'START_AGENT_SESSION', 
      payload: { 
        platform: platform as any, 
        item: args.item, 
        quantity: quantity 
      } 
    });

    return { result: `Initiated autonomous browser session to order ${quantity}x ${args.item} on ${platform}. Monitoring window opened for user.` };
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

// TTS Helper
async function generateSpeech(text: string): Promise<string | null> {
  if (!process.env.API_KEY) return null;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    // Truncate text if too long to prevent latency issues or model limits
    // For now, assume reasonable length or just take the first 500 chars if huge
    const textToSpeak = text.length > 1000 ? text.substring(0, 1000) + "..." : text;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: textToSpeak }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (e) {
    console.warn("TTS generation failed", e);
    return null;
  }
}

// Standard Text/Multimodal Chat
export const sendMessageToAgent = async (
  history: ChatMessage[], 
  message: string, 
  image?: string,
  isEditRequest: boolean = false,
  userLocation?: { lat: number; lng: number } | null,
  mode: ModelMode = 'standard'
) => {
  if (!process.env.API_KEY) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Mode 1: Image Editing (Nano Banana series) - Override mode if editing
  if (isEditRequest && image) {
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

  if (mode === 'fast') {
    // FAST MODE: Low latency, lighter model, no heavy tools
    modelId = 'gemini-flash-lite-latest';
    systemInstructionText += `\nKeep responses very concise and direct.`;
    // We disable complex tools in fast mode to ensure speed, but keep function calling if needed for basic tasks
    config = {
      tools: [{ functionDeclarations: [orderProductTool, setHealthAlertTool] }],
      systemInstruction: systemInstructionText,
    };
  } else if (mode === 'thinking') {
    // THINKING MODE: High reasoning, Gemini 3 Pro
    modelId = 'gemini-3-pro-preview';
    systemInstructionText += `\nAnalyze the user's health query deeply. Consider multiple factors, potential causes, and detailed lifestyle adjustments. Think through the problem step-by-step.`;
    config = {
      // High thinking budget for complex queries
      thinkingConfig: { thinkingBudget: 32768 },
      // Maps/Search are often not compatible or optimal with pure Thinking mode (Maps is 2.5 only).
      // We disable them to focus on internal reasoning.
      tools: [{ functionDeclarations: [orderProductTool, setHealthAlertTool] }],
      systemInstruction: systemInstructionText,
    };
    // DO NOT set maxOutputTokens when using thinking
  } else {
    // STANDARD MODE: Gemini 2.5 Flash with Grounding
    modelId = 'gemini-2.5-flash';
    systemInstructionText += `
    5. **Visual Aids**: If your advice involves a physical action or specific item, you can generate an image. To do this, include a \`visual_aid_prompt\` in your JSON metadata.
    6. **Location & Maps**: The user is currently located ${locationString}. 
       - Use the \`googleMaps\` tool to find doctors, clinics, and hospitals near the user.
       - Provide the Name, Address, and Rating if available.
       - Use \`googleSearch\` for broader queries if Maps fails.
    `;
    
    config = {
      tools: toolsDef, // Includes Maps and Search
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
    OUTPUT FORMAT:
    - You may provide your response in natural language.
    - HOWEVER, at the very end of your response, you MUST append a JSON block for metadata (suggested replies, visual aid prompts).
    
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
      parts: [ { text: msg.text } ]
    }));

  const currentParts: any[] = [{ text: message }];
  if (image) {
    currentParts.unshift({ inlineData: { mimeType: 'image/jpeg', data: image } });
  }

  const allContents = [
    ...pastContent,
    { role: 'user', parts: currentParts }
  ];

  const response = await ai.models.generateContent({
    model: modelId,
    contents: allContents,
    config: config
  });

  const toolCalls = response.functionCalls;
  
  let finalText = "";
  let suggestedActions: string[] = [];
  let generatedImageBase64: string | undefined = undefined;

  if (response.text) {
    const rawText = response.text;
    let cleanText = rawText.replace(/```json\n?|```/g, "");
    const lastOpenBrace = cleanText.lastIndexOf('{');
    
    let jsonPart = null;
    let textPart = cleanText;

    if (lastOpenBrace !== -1) {
      const potentialJson = cleanText.substring(lastOpenBrace);
      try {
        const parsed = JSON.parse(potentialJson);
        if (parsed.suggested_replies || parsed.answer || parsed.visual_aid_prompt) {
          jsonPart = parsed;
          textPart = cleanText.substring(0, lastOpenBrace).trim();
        }
      } catch (e) {
        // Not valid JSON at the end, treat entire thing as text
      }
    }

    if (jsonPart) {
      suggestedActions = jsonPart.suggested_replies || [];
      const visualAidPrompt = jsonPart.visual_aid_prompt;
      if (textPart.length > 0) {
        finalText = textPart;
      } else {
        finalText = jsonPart.answer || "";
      }

      // Handle Visual Aid (Only generate if standard mode or requested)
      if (visualAidPrompt) {
         try {
           console.log("Generating visual aid for:", visualAidPrompt);
           const imgResponse = await ai.models.generateContent({
             model: 'gemini-2.5-flash-image',
             contents: { parts: [{ text: visualAidPrompt }] },
             config: { imageConfig: { aspectRatio: '4:3' } }
           });
           const imgPart = imgResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
           if (imgPart?.inlineData?.data) {
             generatedImageBase64 = imgPart.inlineData.data;
           }
         } catch (imgErr) {
           console.error("Failed to generate visual aid:", imgErr);
         }
      }
    } else {
      try {
        const parsed = JSON.parse(cleanText);
        finalText = parsed.answer || cleanText;
        suggestedActions = parsed.suggested_replies || [];
      } catch (e) {
        finalText = rawText;
      }
    }
  }

  // Generate Audio from Final Text (optional, can be disabled for fast mode to save time, but user might want it)
  let audioBase64 = null;
  if (finalText && finalText.length > 0) {
    audioBase64 = await generateSpeech(finalText);
  }

  return {
    text: finalText,
    image: generatedImageBase64,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata,
    toolCalls: toolCalls,
    suggestedActions: suggestedActions,
    audio: audioBase64
  };
};