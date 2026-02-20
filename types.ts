export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
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
  priceComparison?: {
    query: string;
    results: MedicinePriceResult[];
    cheapest: MedicinePriceResult | null;
  };
  timestamp?: number;
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