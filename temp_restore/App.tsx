import React, { useReducer, useState } from 'react';
import { AgentState, AgentAction, PlatformName } from './types';
import LiveVoiceInterface from './components/LiveVoiceInterface';
import TextChatInterface from './components/TextChatInterface';
import AgentDashboard from './components/AgentDashboard';
import AgentActivityMonitor from './components/AgentActivityMonitor';
import { MessageSquare, Mic, Menu, X } from 'lucide-react';

const initialState: AgentState = {
  orders: [],
  alerts: [],
  connectedAccounts: {
    'Amazon': false,
    'Flipkart': false,
    '1mg': false,
    'Apollo': false
  },
  agentSession: {
    isActive: false,
    platform: 'Amazon',
    item: '',
    quantity: 1,
    status: 'connecting',
    logs: [],
    progress: 0
  }
};

const agentReducer = (state: AgentState, action: AgentAction): AgentState => {
  switch (action.type) {
    case 'ADD_ORDER':
      return { ...state, orders: [action.payload, ...state.orders] };
    case 'ADD_ALERT':
      return { ...state, alerts: [action.payload, ...state.alerts] };
    case 'TOGGLE_ALERT':
      return {
          ...state,
          alerts: state.alerts.map(a => a.id === action.payload ? { ...a, active: !a.active } : a)
      };
    case 'CONNECT_ACCOUNT':
      return {
        ...state,
        connectedAccounts: { ...state.connectedAccounts, [action.payload]: true }
      };
    case 'DISCONNECT_ACCOUNT':
      return {
        ...state,
        connectedAccounts: { ...state.connectedAccounts, [action.payload]: false }
      };
    case 'START_AGENT_SESSION':
      return {
        ...state,
        agentSession: {
          isActive: true,
          platform: action.payload.platform,
          item: action.payload.item,
          quantity: action.payload.quantity,
          status: 'connecting',
          logs: [`Initializing agent session for ${action.payload.platform}...`],
          progress: 5
        }
      };
    case 'UPDATE_SESSION_STATUS':
      return {
        ...state,
        agentSession: {
          ...state.agentSession,
          status: action.payload.status,
          logs: [...state.agentSession.logs, action.payload.log],
          progress: action.payload.progress
        }
      };
    case 'END_AGENT_SESSION':
      return {
        ...state,
        agentSession: { ...state.agentSession, isActive: false }
      };
    default:
      return state;
  }
};

const App: React.FC = () => {
  const [state, dispatch] = useReducer(agentReducer, initialState);
  const [activeTab, setActiveTab] = useState<'chat' | 'live'>('chat');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      
      {/* Sidebar / Navigation */}
      <div className="bg-medical-900 text-white w-16 md:w-20 flex flex-col items-center py-6 gap-8 z-20 flex-shrink-0">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-medical-100 font-bold text-xl">
          H
        </div>
        
        <nav className="flex flex-col gap-6 w-full items-center">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'chat' ? 'bg-medical-500 text-white shadow-lg' : 'text-medical-200 hover:bg-white/10'}`}
            title="Text Chat"
          >
            <MessageSquare className="w-6 h-6" />
          </button>
          
          <button 
             onClick={() => setActiveTab('live')}
             className={`p-3 rounded-xl transition-all ${activeTab === 'live' ? 'bg-medical-500 text-white shadow-lg' : 'text-medical-200 hover:bg-white/10'}`}
             title="Live Voice"
          >
            <Mic className="w-6 h-6" />
          </button>
        </nav>

        <div className="mt-auto">
          <button 
            className="md:hidden text-medical-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* Header (Mobile Only for Dashboard Toggle) */}
        <header className="md:hidden bg-white p-4 flex justify-between items-center border-b border-gray-200 z-10 flex-shrink-0">
          <span className="font-semibold text-gray-800">HealthGuard</span>
        </header>

        {/* Viewport - Added min-h-0 and flex-col to force height constraint on children */}
        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'chat' ? (
              <TextChatInterface dispatch={dispatch} />
            ) : (
              <LiveVoiceInterface onAgentAction={dispatch} />
            )}
        </div>
      </div>

      {/* Right Sidebar: Agent Dashboard (Collapsible on Mobile) */}
      <div className={`
        fixed inset-y-0 right-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 z-30
        md:relative md:transform-none md:shadow-none md:flex
        ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="absolute top-4 right-4 md:hidden">
            <button onClick={() => setMobileMenuOpen(false)}>
              <X className="w-6 h-6 text-gray-500" />
            </button>
        </div>
        <AgentDashboard state={state} dispatch={dispatch} />
      </div>

      {/* Overlay for mobile menu */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Agent Activity Monitor Overlay */}
      {state.agentSession.isActive && (
        <AgentActivityMonitor session={state.agentSession} dispatch={dispatch} />
      )}

    </div>
  );
};

export default App;