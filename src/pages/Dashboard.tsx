import React, { useReducer, useState, useCallback } from 'react';
import { AgentState, AgentAction } from '../../types';
import LiveVoiceInterface from '../../components/LiveVoiceInterface';
import TextChatInterface from '../../components/TextChatInterface';
import FitnessPanel from '../../components/FitnessPanel';
import AgentActivityMonitor from '../../components/AgentActivityMonitor';
import Sidebar from '../../components/Sidebar';
import { useChatHistory } from '../../hooks/useChatHistory';
import { Menu, Zap, Sparkles, BrainCircuit, Eye, Settings, Bell, Bot, LogOut } from 'lucide-react';
import { ModelMode } from '../../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { logoutUser } from '../services/firebaseAuth';
import { useNavigate } from 'react-router-dom';

const initialState: AgentState = {
    orders: [],
    alerts: [],
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

const Dashboard: React.FC = () => {
    const [state, dispatch] = useReducer(agentReducer, initialState);
    const [activeTab, setActiveTab] = useState<'chat' | 'live'>('chat');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeRightSidebar, setActiveRightSidebar] = useState(false);
    const [modelMode, setModelMode] = useState<ModelMode>('standard');
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logoutUser();
        navigate('/');
    };

    const {
        sessions,
        activeSessionId,
        messages,
        setMessages,
        saveCurrentChat,
        startNewChat,
        loadChat,
        deleteChat
    } = useChatHistory();

    const handleMessagesChange = useCallback((msgs: any[]) => {
        saveCurrentChat(msgs);
    }, [saveCurrentChat]);

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans text-slate-900 dark:text-slate-100 selection:bg-teal-100 selection:text-teal-900">

            {/* Left Sidebar (Navigation) */}
            <Sidebar
                onNewChat={startNewChat}
                isOpen={sidebarOpen}
                toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onLoadChat={(id) => { loadChat(id); setSidebarOpen(false); }}
                onDeleteChat={deleteChat}
            />

            {/* Center: Main Content (Header + Chat) */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-white dark:bg-slate-900">

                {/* Header */}
                <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10 shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400">
                            <Menu className="w-6 h-6" />
                        </button>
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HealthGuard Assistant</span>
                    </div>

                    {/* Mode Selectors (Visible on larger screens) */}
                    <div className="hidden md:flex items-center gap-2">
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setModelMode('fast')}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${modelMode === 'fast' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
                            >
                                <Zap className={`w-3.5 h-3.5 ${modelMode === 'fast' ? 'text-amber-500' : ''}`} /> Fast
                            </button>
                            <button
                                onClick={() => setModelMode('standard')}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${modelMode === 'standard' ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
                            >
                                <Sparkles className={`w-3.5 h-3.5 ${modelMode === 'standard' ? 'text-teal-500' : ''}`} /> Standard
                            </button>
                            <button
                                onClick={() => setModelMode('thinking')}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${modelMode === 'thinking' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
                            >
                                <BrainCircuit className={`w-3.5 h-3.5 ${modelMode === 'thinking' ? 'text-indigo-500' : ''}`} /> Deep Think
                            </button>
                            <button
                                onClick={() => setModelMode('vision')}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${modelMode === 'vision' ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200 dark:border-fuchsia-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
                            >
                                <Eye className={`w-3.5 h-3.5 ${modelMode === 'vision' ? 'text-fuchsia-500' : ''}`} /> Vision
                            </button>
                            <button
                                onClick={() => setModelMode('agent')}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all ${modelMode === 'agent' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
                            >
                                <Bot className={`w-3.5 h-3.5 ${modelMode === 'agent' ? 'text-rose-500' : ''}`} /> Agent
                            </button>
                        </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end mr-2">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{user?.displayName || 'User'}</span>
                            <span className="text-[10px] text-slate-500">{user?.email}</span>
                        </div>
                        <button className="text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors"><Bell className="w-5 h-5" /></button>
                        <button
                            onClick={() => setActiveRightSidebar(!activeRightSidebar)}
                            className="text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleLogout}
                            title="Log Out"
                            className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 transition-colors ml-2"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Chat Viewport */}
                <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
                    {activeTab === 'chat' ? (
                        <TextChatInterface
                            dispatch={dispatch}
                            messages={messages}
                            setMessages={setMessages}
                            onMessagesChange={handleMessagesChange}
                            modelMode={modelMode}
                            setModelMode={setModelMode}
                        />
                    ) : (
                        <LiveVoiceInterface onAgentAction={dispatch} />
                    )}
                </div>
            </div>

            {/* Right Sidebar: Fitness Panel */}
            <aside className={`
                fixed inset-y-0 right-0 w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-30 transform transition-transform duration-300
                lg:relative lg:transform-none lg:block
                ${activeRightSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            `}>
                <FitnessPanel />
            </aside>

            {/* Mobile Overlay for Right Sidebar */}
            {activeRightSidebar && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
                    onClick={() => setActiveRightSidebar(false)}
                />
            )}

            {/* Agent Activity Monitor Overlay */}
            {state.agentSession.isActive && (
                <AgentActivityMonitor session={state.agentSession} orders={state.orders} dispatch={dispatch} />
            )}

        </div>
    );
};

export default Dashboard;
