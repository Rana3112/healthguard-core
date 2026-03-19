import { HumanMessage } from '@langchain/core/messages';
import {
  Annotation,
  END,
  START,
  StateGraph,
  messagesStateReducer,
} from '@langchain/langgraph/web';
import type { BaseMessage } from '@langchain/core/messages';
import type { CardInputType, ClarificationCard, PatientState, SocratesObject } from '../types';
import {
  CLINICAL_ABSTRACTION_PROMPT,
  INFORMATION_GATHERING_PROMPT,
  INTENT_EXTRACTION_PROMPT,
  MEDICAL_SEARCH_PROMPT,
  buildIndianDoctorDiagnosisPrompt,
  detectAgeGroup,
} from './medicalKnowledgePrompts';
import { getOrCreateCheckpointer } from './patientSession';

// =============================================================================
// TYPES
// =============================================================================

export type ClinicalModelMode = 'fast' | 'standard' | 'thinking' | 'max_deep_think' | 'vision' | 'agent';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMCallOptions {
  mode: ClinicalModelMode;
  messages: LLMMessage[];
  image?: string; // Base64 image for vision mode
}

interface StructuredDiagnosisPayload {
  condition: string;
  homeRemedies: string[];
  dietEat: string;
  dietAvoid: string;
  medicines: string[];
  ayurvedicOption: string;
  redFlags: string[];
  finalAdvice: string;
}

// =============================================================================
// ENVIRONMENT HELPERS
// =============================================================================

const getEnvVar = (key: string): string | undefined => {
  const viteEnv = (import.meta as any)?.env?.[key];
  if (viteEnv) return viteEnv;
  if (key === 'VITE_GROQ_API_KEY') {
    return (import.meta as any)?.env?.VITE_GROQ_API_KEY || (import.meta as any)?.env?.GROQ_API_KEY || (typeof process !== 'undefined' ? (process as any)?.env?.VITE_GROQ_API_KEY : undefined) || (typeof process !== 'undefined' ? (process as any)?.env?.GROQ_API_KEY : undefined);
  }
  if (key === 'VITE_OPENROUTER_API_KEY') {
    return (import.meta as any)?.env?.VITE_OPENROUTER_API_KEY || (import.meta as any)?.env?.OPENROUTER_API_KEY || (typeof process !== 'undefined' ? (process as any)?.env?.VITE_OPENROUTER_API_KEY : undefined) || (typeof process !== 'undefined' ? (process as any)?.env?.OPENROUTER_API_KEY : undefined);
  }
  if (key === 'VITE_GEMINI_API_KEY') {
    return (import.meta as any)?.env?.VITE_GEMINI_API_KEY || (import.meta as any)?.env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? (process as any)?.env?.VITE_GEMINI_API_KEY : undefined) || (typeof process !== 'undefined' ? (process as any)?.env?.GEMINI_API_KEY : undefined);
  }
  if (typeof process !== 'undefined') {
    return (process as any)?.env?.[key];
  }
  return undefined;
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BACKEND_URL = getEnvVar('VITE_BACKEND_URL') || 'http://localhost:5001';

// =============================================================================
// PROVIDER-SPECIFIC LLM CALLS
// =============================================================================

/**
 * Fast Mode: Llama 3.1-8b-instant via Groq
 */
async function callGroqFast(messages: LLMMessage[]): Promise<string> {
  const apiKey = getEnvVar('VITE_GROQ_API_KEY');
  console.log('[Clinical Graph] GROQ API Key available:', !!apiKey);
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY is required for Fast mode.');

  console.log('[Clinical Graph] Calling GROQ Fast with model: llama-3.1-8b-instant');
  console.log('[Clinical Graph] Messages count:', messages.length);

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Clinical Graph] GROQ Fast API error:', response.status, error);
    throw new Error(`Groq Fast API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('[Clinical Graph] GROQ Fast response received, content length:', data.choices?.[0]?.message?.content?.length);
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Standard Mode: Llama 3.3-70b-versatile via Groq
 */
async function callGroqStandard(messages: LLMMessage[]): Promise<string> {
  const apiKey = getEnvVar('VITE_GROQ_API_KEY');
  console.log('[Clinical Graph] GROQ Standard API Key available:', !!apiKey);
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY is required for Standard mode.');

  console.log('[Clinical Graph] Calling GROQ Standard with model: llama-3.3-70b-versatile');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Clinical Graph] GROQ Standard API error:', response.status, error);
    throw new Error(`Groq Standard API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Deep Think Mode: GPT-OSS-120B via OpenRouter
 */
async function callOpenRouterDeepThink(messages: LLMMessage[]): Promise<string> {
  const apiKey = getEnvVar('VITE_OPENROUTER_API_KEY') || getEnvVar('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for Deep Think mode.');

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'HealthGuard AI Clinical Graph',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter Deep Think API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Max Deep Think Mode: Kimi K2.5 via NVIDIA backend proxy
 */
async function callNvidiaMaxDeepThink(messages: LLMMessage[]): Promise<string> {
  const invokeUrl = `${BACKEND_URL}/api/nvidia-deepthink`;

  const response = await fetch(invokeUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      stream: false, // Non-streaming for clinical graph nodes
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NVIDIA Kimi K2.5 API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  // Handle both streaming and non-streaming response formats
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  // Fallback for streaming format
  return data.text || data.content || '';
}

/**
 * Vision Mode: Gemini 2.5 Flash via Google AI
 */
async function callGeminiVision(messages: LLMMessage[], image?: string): Promise<string> {
  const apiKey = getEnvVar('VITE_GEMINI_API_KEY');
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is required for Vision mode.');

  // For vision, we need to use Gemini's REST API directly
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessage = messages.find(m => m.role === 'user')?.content || '';

  const parts: any[] = [];
  
  // Add image if provided
  if (image) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: image.replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }
  
  // Add text
  parts.push({ text: `${systemMessage}\n\n${userMessage}` });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('[Clinical Graph] Gemini Vision API error:', response.status, error);
    throw new Error(`Gemini Vision API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('[Clinical Graph] Gemini Vision response:', data);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Agent Mode: GPT-OSS-120B via OpenRouter + SERP API for medicine search
 */
async function callOpenRouterAgent(messages: LLMMessage[]): Promise<string> {
  // Agent mode uses the same model as Deep Think but with potential SERP integration
  const apiKey = getEnvVar('VITE_OPENROUTER_API_KEY') || getEnvVar('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for Agent mode.');

  // For clinical graph, we don't do SERP search in nodes - that's handled by the diagnosis node
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'HealthGuard AI Clinical Agent',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter Agent API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// =============================================================================
// UNIFIED LLM CALL ROUTER
// =============================================================================

/**
 * Routes LLM calls to the appropriate provider based on mode
 */
async function callLLM(options: LLMCallOptions): Promise<string> {
  const { mode, messages, image } = options;

  console.log(`[Clinical Graph] Calling LLM with mode: ${mode}, image present: ${!!image}`);
  console.log('[Clinical Graph] Messages:', messages.map(m => ({ role: m.role, contentLength: m.content.length })));

  switch (mode) {
    case 'fast':
      return callGroqFast(messages);
    
    case 'standard':
      return callGroqStandard(messages);
    
    case 'thinking':
      return callOpenRouterDeepThink(messages);
    
    case 'max_deep_think':
      return callNvidiaMaxDeepThink(messages);
    
    case 'vision':
      return callGeminiVision(messages, image);
    
    case 'agent':
      return callOpenRouterAgent(messages);
    
    default:
      // Default to standard mode (Groq Llama 3.3-70b)
      console.warn(`[Clinical Graph] Unknown mode "${mode}", falling back to standard`);
      return callGroqStandard(messages);
  }
}

// =============================================================================
// STATE DEFINITION
// =============================================================================

const keepLatest = <T>(_: T, right: T) => right;

const PatientStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  chief_complaint: Annotation<string>({ reducer: keepLatest, default: () => '' }),
  socrates: Annotation<SocratesObject>({
    reducer: keepLatest,
    default: () => ({
      site: null,
      onset: null,
      character: null,
      radiation: null,
      associations: null,
      timing: null,
      exacerbating: null,
      relieving: null,
      severity: null,
      medications: null,
      allergies: null,
      medical_history: null,
      age_sex: null,
    }),
  }),
  questions_asked: Annotation<string[]>({ reducer: keepLatest, default: () => [] }),
  answers_given: Annotation<Record<string, string>>({ reducer: keepLatest, default: () => ({}) }),
  phase: Annotation<PatientState['phase']>({ reducer: keepLatest, default: () => 'intake' }),
  thread_id: Annotation<string>({ reducer: keepLatest, default: () => '' }),
  next_card: Annotation<ClarificationCard | null>({ reducer: keepLatest, default: () => null }),
  ready_for_analysis: Annotation<boolean>({ reducer: keepLatest, default: () => false }),
  clinical_abstraction: Annotation<string | null>({ reducer: keepLatest, default: () => null }),
  search_results: Annotation<string | null>({ reducer: keepLatest, default: () => null }),
  final_diagnosis: Annotation<string | null>({ reducer: keepLatest, default: () => null }),
  awaiting_input: Annotation<boolean>({ reducer: keepLatest, default: () => false }),
  pending_answer: Annotation<string | null>({ reducer: keepLatest, default: () => null }),
  // New: Store the mode for use in nodes
  model_mode: Annotation<ClinicalModelMode>({ reducer: keepLatest, default: () => 'standard' }),
  // New: Store image for vision mode
  attached_image: Annotation<string | null>({ reducer: keepLatest, default: () => null }),
});

const REQUIRED_FIELDS: (keyof SocratesObject)[] = ['onset', 'character', 'severity', 'timing'];
const OPTIONAL_FIELDS: (keyof SocratesObject)[] = ['radiation', 'exacerbating', 'relieving', 'associations'];

const formatDiagnosisSections = (payload: StructuredDiagnosisPayload): string => {
  const homeRemedies = (payload.homeRemedies || []).slice(0, 3);
  const medicines = (payload.medicines || []).slice(0, 3);
  const redFlags = (payload.redFlags || []).slice(0, 3);

  return [
    `**Aapki Taklif (Your Condition)**\n${payload.condition.trim()}`,
    `**Ghar Pe Kya Karein (Home Remedies First)**\n${homeRemedies.map((item) => `- ${item}`).join('\n')}`,
    `**Khaana Peena (Diet Guidance)**\n${payload.dietEat.trim()} ${payload.dietAvoid.trim()}`,
    `**Dawai (Medicines from Chemist)**\n${medicines.map((item) => `- ${item}`).join('\n')}`,
    `**Ayurvedic Option**\n${payload.ayurvedicOption.trim()}`,
    `**Kab Doctor ke Paas Jaayein (Red Flags — When to See a Doctor)**\n${redFlags.map((item) => `- ${item}`).join('\n')}`,
    `**Dr. Sharma ki Salah (Doctor's Final Advice)**\n${payload.finalAdvice.trim()}`,
  ].join('\n\n');
};

const extractLeadSentences = (text: string, count = 2): string => {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences.slice(0, count).join(' ');
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function createInitialPatientState(threadId: string, mode: ClinicalModelMode = 'standard'): PatientState & { model_mode: ClinicalModelMode; attached_image: string | null } {
  return {
    messages: [],
    chief_complaint: '',
    socrates: {
      site: null,
      onset: null,
      character: null,
      radiation: null,
      associations: null,
      timing: null,
      exacerbating: null,
      relieving: null,
      severity: null,
      medications: null,
      allergies: null,
      medical_history: null,
      age_sex: null,
    },
    questions_asked: [],
    answers_given: {},
    phase: 'intake',
    thread_id: threadId,
    next_card: null,
    ready_for_analysis: false,
    clinical_abstraction: null,
    search_results: null,
    final_diagnosis: null,
    awaiting_input: false,
    pending_answer: null,
    model_mode: mode,
    attached_image: null,
  };
}

const safeJson = <T>(text: string, fallback: T): T => {
  try {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim()) as T;
    }
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export function routingCheck(state: PatientState): 'need_more' | 'ready' {
  const missingRequired = REQUIRED_FIELDS.filter((field) => state.socrates[field] === null);
  const filledOptional = OPTIONAL_FIELDS.filter((field) => state.socrates[field] !== null).length;
  const questionCount = state.questions_asked.length;

  if (questionCount < 3) return 'need_more';
  if (missingRequired.length > 0) return 'need_more';
  if (filledOptional === 0 && questionCount < 8) return 'need_more';
  if (questionCount >= 8) return 'ready';
  return 'ready';
}

// =============================================================================
// GRAPH NODES
// =============================================================================

async function initializeChiefComplaint(
  state: PatientState & { model_mode: ClinicalModelMode; attached_image: string | null },
  userInput: string
): Promise<PatientState & { model_mode: ClinicalModelMode; attached_image: string | null }> {
  if (state.chief_complaint) return state;

  const response = await callLLM({
    mode: state.model_mode,
    messages: [
      { role: 'system', content: INTENT_EXTRACTION_PROMPT },
      { role: 'user', content: userInput },
    ],
    image: state.attached_image || undefined,
  });

  const parsed = safeJson<{ chief_complaint?: string; site?: string | null; age_sex?: string | null }>(
    response,
    {}
  );

  return {
    ...state,
    chief_complaint: parsed.chief_complaint || userInput,
    phase: 'gathering',
    socrates: {
      ...state.socrates,
      site: parsed.site ?? state.socrates.site,
      age_sex: parsed.age_sex ?? state.socrates.age_sex,
    },
  };
}

async function generateNextCard(
  state: PatientState & { model_mode: ClinicalModelMode; attached_image: string | null }
): Promise<ClarificationCard> {
  const missingFields = Object.entries(state.socrates)
    .filter(([, value]) => value === null)
    .map(([key]) => key)
    .join(', ');

  const response = await callLLM({
    mode: state.model_mode,
    messages: [
      { role: 'system', content: INFORMATION_GATHERING_PROMPT },
      {
        role: 'user',
        content: `Patient's chief complaint: ${state.chief_complaint}\nWhat we know so far: ${JSON.stringify(
          state.socrates
        )}\nFields still needed: ${missingFields}\nQuestions already asked: ${JSON.stringify(state.questions_asked)}`,
      },
    ],
  });

  const parsed = safeJson<{
    question_text?: string;
    input_type?: 'options' | 'text';
    placeholder?: string;
    options?: string[];
    socrates_field?: keyof SocratesObject;
    reasoning?: string;
  }>(response, {});

  return {
    question: parsed.question_text || "Can you tell me more about what you're experiencing?",
    inputType: (parsed.input_type || 'text') as CardInputType,
    textPlaceholder: parsed.placeholder || 'Any detail helps, take your time...',
    placeholder: parsed.placeholder || 'Any detail helps, take your time...',
    socrates_field: parsed.socrates_field,
    reasoning: parsed.reasoning,
    options: (parsed.options || ['Not sure']).map((option) => ({
      label: option,
      userStatement: option,
    })),
  };
}

async function intentClassifierNode(state: typeof PatientStateAnnotation.State): Promise<Partial<typeof PatientStateAnnotation.State>> {
  const latest = state.messages[state.messages.length - 1] as any;
  const userText = typeof latest?.content === 'string' ? latest.content : String(latest?.content ?? state.chief_complaint);
  const nextState = await initializeChiefComplaint(
    state as PatientState & { model_mode: ClinicalModelMode; attached_image: string | null },
    userText || state.chief_complaint || 'I feel unwell'
  );
  return {
    chief_complaint: nextState.chief_complaint,
    socrates: nextState.socrates,
    phase: 'gathering',
  };
}

async function informationGatheringNode(state: typeof PatientStateAnnotation.State): Promise<Partial<typeof PatientStateAnnotation.State>> {
  // If we have a pending answer, process it
  if (state.pending_answer !== null) {
    const userAnswer = state.pending_answer;
    const currentCard = state.next_card;
    
    const updatedSocrates = { ...state.socrates };
    if (currentCard?.socrates_field) {
      updatedSocrates[currentCard.socrates_field] = userAnswer;
    }

    const questionText = currentCard?.question || 'Unknown question';
    
    return {
      socrates: updatedSocrates,
      phase: 'gathering',
      questions_asked: [...state.questions_asked, questionText],
      answers_given: {
        ...state.answers_given,
        [questionText]: userAnswer,
      },
      pending_answer: null,
      awaiting_input: false,
    };
  }
  
  // Generate next question card and pause for input
  const card = await generateNextCard(
    state as PatientState & { model_mode: ClinicalModelMode; attached_image: string | null }
  );
  
  return {
    phase: 'gathering',
    next_card: card,
    awaiting_input: true,
  };
}

function routingCheckNode(state: typeof PatientStateAnnotation.State): 'awaiting' | 'need_more' | 'ready' {
  if (state.awaiting_input) {
    return 'awaiting';
  }
  return routingCheck(state as PatientState);
}

async function clinicalAbstractionNode(state: typeof PatientStateAnnotation.State): Promise<Partial<typeof PatientStateAnnotation.State>> {
  const abstraction = await callLLM({
    mode: state.model_mode,
    messages: [
      { role: 'system', content: CLINICAL_ABSTRACTION_PROMPT },
      { role: 'user', content: `SOCRATES: ${JSON.stringify(state.socrates)}\nAnswers: ${JSON.stringify(state.answers_given)}` },
    ],
    image: state.attached_image || undefined,
  });

  return {
    phase: 'abstraction',
    clinical_abstraction: abstraction,
  };
}

async function medicalSearchNode(state: typeof PatientStateAnnotation.State): Promise<Partial<typeof PatientStateAnnotation.State>> {
  // For Agent mode, we could integrate SERP API here for medicine recommendations
  let searchPrompt = MEDICAL_SEARCH_PROMPT;
  
  if (state.model_mode === 'agent') {
    searchPrompt += `\n\nADDITIONAL AGENT MODE INSTRUCTIONS:
- Include specific medicine names that can be searched on Indian e-commerce platforms
- Mention generic alternatives and their typical price ranges
- Focus on OTC medicines available on 1mg, Apollo, PharmEasy, Netmeds, Amazon, Flipkart`;
  }

  const search = await callLLM({
    mode: state.model_mode,
    messages: [
      { role: 'system', content: searchPrompt },
      { role: 'user', content: `Clinical abstraction:\n${state.clinical_abstraction || ''}` },
    ],
  });

  return {
    phase: 'searching',
    search_results: search,
  };
}

async function diagnosisFormulationNode(state: typeof PatientStateAnnotation.State): Promise<Partial<typeof PatientStateAnnotation.State>> {
  // Build the dynamic Indian doctor prompt with patient-specific context
  const indianDoctorPrompt = buildIndianDoctorDiagnosisPrompt({
    chiefComplaint: state.chief_complaint,
    clinicalAbstraction: state.clinical_abstraction || '',
    searchResults: state.search_results || '',
    socrates: state.socrates as unknown as Record<string, string | null>,
    patientContext: {
      ageGroup: detectAgeGroup(state.socrates.age_sex),
    },
  });

  const validateDiagnosisFormat = (text: string): boolean => {
    const requiredHeaders = [
      '**Aapki Taklif',
      '**Ghar Pe Kya Karein',
      '**Khaana Peena',
      '**Dawai',
      '**Ayurvedic Option',
      '**Kab Doctor ke Paas Jaayein',
      '**Dr. Sharma ki Salah',
    ];
    return requiredHeaders.every((header) => text.includes(header));
  };

  let diagnosis = '';
  let attempts = 0;

  while (attempts < 2) {
    const response = await callLLM({
      mode: state.model_mode,
      messages: [
        { role: 'system', content: indianDoctorPrompt },
        {
          role: 'user',
          content:
            attempts === 0
              ? 'Please provide your assessment now.'
              : 'Your previous response was missing required sections. Rewrite it following the format exactly.',
        },
      ],
      image: state.attached_image || undefined,
    });

    diagnosis = response;
    if (validateDiagnosisFormat(diagnosis)) break;
    attempts += 1;
  }

  if (!validateDiagnosisFormat(diagnosis)) {
    const seed = extractLeadSentences(diagnosis || state.search_results || state.clinical_abstraction || '');
    diagnosis = formatDiagnosisSections({
      condition: seed || 'Your symptoms need a careful medical review.',
      homeRemedies: [
        'Paani aur ORS ka sevan karein — din bhar chhote chhote sips mein',
        'Aram karein aur garam kapde pehnein — 2-3 din tak',
        'Haldi wala garam doodh ya adrak chai — din mein 1-2 baar',
      ],
      dietEat: 'Eat light foods like khichdi, dal chawal, dalia, and coconut water.',
      dietAvoid: 'Avoid spicy curries, maida, fried snacks, and cold drinks.',
      medicines: [
        'Crocin (Paracetamol) — 1 tablet, twice a day, for 2 days',
        'Dolo 650 (Paracetamol) — 1 tablet, twice a day, for 2 days',
        'Gelusil (Antacid) — 1 tablet, after meals, for 2 days',
      ],
      ayurvedicOption: 'You can also try Chyawanprash, 1 teaspoon, twice a day, with warm water.',
      redFlags: [
        'High fever above 102°F for more than 3 days',
        'Difficulty breathing or chest pain',
        'Severe weakness, confusion, or dehydration',
      ],
      finalAdvice: 'Remember to rest, stay hydrated, and seek medical help if your symptoms worsen.',
    });
  }

  return {
    phase: 'complete',
    final_diagnosis: diagnosis || 'Unable to produce diagnosis summary.',
    ready_for_analysis: true,
    next_card: {
      question: 'Clinical assessment complete',
      inputType: 'final_summary',
      options: [],
      reasoning: 'Final structured summary is ready.',
    },
  };
}

// =============================================================================
// GRAPH CONSTRUCTION
// =============================================================================

const clinicalGraphBuilder = new StateGraph(PatientStateAnnotation)
  .addNode('intent_classifier', intentClassifierNode)
  .addNode('information_gathering', informationGatheringNode)
  .addNode('routing_check', (state: typeof PatientStateAnnotation.State) => state)
  .addNode('abstraction_node', clinicalAbstractionNode)
  .addNode('search_node', medicalSearchNode)
  .addNode('diagnosis_node', diagnosisFormulationNode)
  .addEdge(START, 'intent_classifier')
  .addEdge('intent_classifier', 'information_gathering')
  .addEdge('information_gathering', 'routing_check')
  .addConditionalEdges('routing_check', routingCheckNode, {
    awaiting: END,
    need_more: 'information_gathering',
    ready: 'abstraction_node',
  })
  .addEdge('abstraction_node', 'search_node')
  .addEdge('search_node', 'diagnosis_node')
  .addEdge('diagnosis_node', END);

export const compiledClinicalGraph = clinicalGraphBuilder.compile();

// =============================================================================
// PUBLIC API
// =============================================================================

export interface ClinicalTurnResult {
  state: PatientState;
  interruptCard: ClarificationCard | null;
  finalDiagnosis: string | null;
}

// Store for persisting state between turns (in-memory for browser)
const sessionStates = new Map<string, PatientState & { model_mode: ClinicalModelMode; attached_image: string | null }>();

export async function runClinicalGraphTurn(params: {
  threadId: string;
  userInput?: string;
  resumeAnswer?: string;
  mode?: ClinicalModelMode;
  image?: string; // Base64 image for vision mode
}): Promise<ClinicalTurnResult> {
  const { threadId, userInput = '', resumeAnswer, mode = 'standard', image } = params;

  console.log(`[Clinical Graph] Running turn with mode: ${mode}, threadId: ${threadId}`);

  const checkpointer = getOrCreateCheckpointer(threadId);
  const graph = clinicalGraphBuilder.compile({ checkpointer });

  const config = {
    configurable: { thread_id: threadId },
    streamMode: 'values' as const,
  };

  // Get existing state or create new one
  let existingState = sessionStates.get(threadId);
  
  let input: typeof PatientStateAnnotation.State;
  
  if (resumeAnswer !== undefined && existingState) {
    // Resume with the user's answer, but update mode if changed
    input = {
      ...existingState,
      pending_answer: resumeAnswer,
      awaiting_input: false,
      model_mode: mode, // Allow mode changes mid-conversation
      attached_image: image || existingState.attached_image,
    } as typeof PatientStateAnnotation.State;
  } else {
    // Fresh start
    input = {
      ...createInitialPatientState(threadId, mode),
      thread_id: threadId,
      messages: [new HumanMessage(userInput)],
      model_mode: mode,
      attached_image: image || null,
    } as typeof PatientStateAnnotation.State;
  }

  let latestState = createInitialPatientState(threadId, mode);
  let interruptCard: ClarificationCard | null = null;

  const stream = await graph.stream(input as any, config as any);
  for await (const chunk of stream as any) {
    const stateChunk = chunk as Partial<PatientState>;

    latestState = {
      ...latestState,
      ...stateChunk,
      thread_id: threadId,
    } as PatientState & { model_mode: ClinicalModelMode; attached_image: string | null };
  }

  // Check if we're waiting for input
  if (latestState.awaiting_input && latestState.next_card) {
    interruptCard = latestState.next_card;
  }

  // Save state for potential resume
  sessionStates.set(threadId, latestState as PatientState & { model_mode: ClinicalModelMode; attached_image: string | null });

  return {
    state: latestState,
    interruptCard,
    finalDiagnosis: latestState.final_diagnosis,
  };
}
