export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
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
  connectedAccounts: Record<PlatformName, boolean>;
  agentSession: AgentSession;
}

export type AgentAction = 
  | { type: 'ADD_ORDER'; payload: HealthOrder }
  | { type: 'ADD_ALERT'; payload: HealthAlert }
  | { type: 'TOGGLE_ALERT'; payload: string }
  | { type: 'CONNECT_ACCOUNT'; payload: PlatformName }
  | { type: 'DISCONNECT_ACCOUNT'; payload: PlatformName }
  | { type: 'START_AGENT_SESSION'; payload: { platform: PlatformName, item: string, quantity: number } }
  | { type: 'UPDATE_SESSION_STATUS'; payload: { status: AgentSession['status'], log: string, progress: number } }
  | { type: 'END_AGENT_SESSION' };

// Live API types
export interface LiveConfig {
  voiceName: string;
}