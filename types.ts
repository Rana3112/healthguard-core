import type { BaseMessage } from '@langchain/core/messages';

export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export type GraphPhase =
  | 'intake'
  | 'gathering'
  | 'abstraction'
  | 'searching'
  | 'diagnosis'
  | 'complete';

export type CardInputType = 'options' | 'text' | 'final_summary' | 'red_flag';

export interface SocratesObject {
  site: string | null;
  onset: string | null;
  character: string | null;
  radiation: string | null;
  associations: string | null;
  timing: string | null;
  exacerbating: string | null;
  relieving: string | null;
  severity: string | null;
  medications: string | null;
  allergies: string | null;
  medical_history: string | null;
  age_sex: string | null;
}

export interface MedicinePriceResult {
  title: string;
  price: number | null;
  price_display: string;
  platform: string;
  source: string;
  link: string;
  image: string;
  rating: number | null;
  reviews: number | null;
  delivery: string;
}

export interface ClarificationOption {
  label: string;
  userStatement: string;
  intent?: 'vision' | 'agent' | 'final_analysis';
}

export interface ClarificationCard {
  question: string;
  inputType?: CardInputType;
  textPlaceholder?: string;
  placeholder?: string;
  options: ClarificationOption[];
  socrates_field?: keyof SocratesObject;
  reasoning?: string;
}

export interface PatientState {
  messages: BaseMessage[];
  chief_complaint: string;
  socrates: SocratesObject;
  questions_asked: string[];
  answers_given: Record<string, string>;
  phase: GraphPhase;
  thread_id: string;
  next_card: ClarificationCard | null;
  ready_for_analysis: boolean;
  clinical_abstraction: string | null;
  search_results: string | null;
  final_diagnosis: string | null;
  // Browser-compatible interrupt pattern fields
  awaiting_input?: boolean;
  pending_answer?: string | null;
  // RAG context for patient vitals
  vitals_context?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  image?: string; // base64
  audio?: string; // base64 raw pcm
  isEditing?: boolean; // If true, this was an image edit request
  groundingSources?: Array<{
    title?: string;
    uri: string;
  }>;
  suggestedActions?: string[]; // Options for the user to click
  suggestedQuestionCards?: ClarificationCard[];
  priceComparison?: {
    query: string;
    results: MedicinePriceResult[];
    cheapest: MedicinePriceResult | null;
  };
  showPharmacyMap?: boolean;
  locationQuery?: string;
  thinkingText?: string; // Kimi K2.5 reasoning/thinking content (shown in collapsible section)
  thinkingDuration?: number; // Seconds spent thinking
  timestamp?: number;
  imageGen?: {
    isOpen: boolean;
    prompt: string;
    status: 'idle' | 'loading' | 'success' | 'error';
    imageUrl?: string;
    error?: string;
  };
}


export interface HealthOrder {
  id: string;
  item: string;
  type: 'medicine' | 'food';
  status: 'pending' | 'ordered' | 'shipping' | 'delivered';
  platform?: 'Amazon' | 'Flipkart' | '1mg' | 'Apollo' | 'Generic';
  price?: string;
  paymentStatus?: 'paid' | 'pending' | 'failed';
  timestamp: Date;
}

export interface HealthAlert {
  id: string;
  message: string;
  time: string;
  active: boolean;
}

export type PlatformName = 'Amazon' | 'Flipkart' | '1mg' | 'Apollo';

export interface AgentSession {
  isActive: boolean;
  platform: PlatformName;
  item: string;
  quantity: number;
  status: 'connecting' | 'searching' | 'selecting' | 'checkout' | 'completed';
  logs: string[];
  progress: number;
}

export interface AgentState {
  orders: HealthOrder[];
  alerts: HealthAlert[];
  agentSession: AgentSession;
}

export type AgentAction =
  | { type: 'ADD_ORDER'; payload: HealthOrder }
  | { type: 'ADD_ALERT'; payload: HealthAlert }
  | { type: 'TOGGLE_ALERT'; payload: string }
  | { type: 'START_AGENT_SESSION'; payload: { platform: PlatformName, item: string, quantity: number } }
  | { type: 'UPDATE_SESSION_STATUS'; payload: { status: AgentSession['status'], log: string, progress: number } }
  | { type: 'END_AGENT_SESSION' };

// Live API types
export interface LiveConfig {
  voiceName: string;
}

// Chat History types
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// --- Fitness / AI Coach Types ---
export interface Exercise {
  id: string;
  name: string;
  target: string;
  bodyPart: string;
  equipment: string;
  gifUrl: string;
  secondaryMuscles: string[];
  instructions: string[];
}

export interface WorkoutDay {
  day_name: string;
  exercises: Exercise[];
}

export interface WorkoutPlan {
  analysis: string;
  goal: string;
  days: WorkoutDay[];
}
