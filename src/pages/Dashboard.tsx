import React, { useReducer, useState, useCallback, useEffect } from 'react';
import { AgentState, AgentAction } from '../../types';
import LiveVoiceInterface from '../../components/LiveVoiceInterface';
import TextChatInterface from '../../components/TextChatInterface';
import FitnessPanel from '../../components/FitnessPanel';
import HealthDashboard from '../../components/HealthDashboard';
import DrugInteractionChecker from '../../components/DrugInteractionChecker';
import AgentActivityMonitor from '../../components/AgentActivityMonitor';
import Sidebar from '../../components/Sidebar';
import SettingsPanel from '../../components/SettingsPanel';
import NotificationPanel from '../../components/NotificationPanel';
import { applyTheme, getStoredTheme } from '../../components/SettingsPanel';
import { useChatHistory } from '../../hooks/useChatHistory';
import { Menu, Zap, Sparkles, BrainCircuit, Eye, Settings, Bell, Bot, LogOut, Dumbbell, Heart, Pill } from 'lucide-react';
import { ModelMode } from '../../services/geminiService';
import { useAuth } from '../context/AuthContext';
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
    const [rightPanel, setRightPanel] = useState<'fitness' | 'health' | 'drugs'>('fitness');
    const [modelMode, setModelMode] = useState<ModelMode>('standard');
    const [showSettings, setShowSettings] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [pendingQuickTool, setPendingQuickTool] = useState<string | null>(null);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => { applyTheme(getStoredTheme()); }, []);

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


                    {/* Quick Tool Shortcuts (Header) */}
                    <div className="hidden md:flex items-center gap-2">
                        <button onClick={() => setPendingQuickTool('Symptoms')} data-quicktool="Symptoms" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-xl text-[11px] font-bold border border-red-100 dark:border-red-800/30 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            Check Symptoms
                        </button>
                        <button onClick={() => setPendingQuickTool('Medicines')} data-quicktool="Medicines" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 rounded-xl text-[11px] font-bold border border-blue-100 dark:border-blue-800/30 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            Analyze Medicine
                        </button>
                        <button onClick={() => setPendingQuickTool('Pharmacy')} data-quicktool="Pharmacy" className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-500 dark:text-orange-400 rounded-xl text-[11px] font-bold border border-orange-100 dark:border-orange-800/30 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Nearby Pharmacy
                        </button>
                        <button onClick={() => setPendingQuickTool('Report')} data-quicktool="Report" className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-900/20 text-teal-500 dark:text-teal-400 rounded-xl text-[11px] font-bold border border-teal-100 dark:border-teal-800/30 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Analyze Report
                        </button>
                        <button onClick={() => setPendingQuickTool('Drugs')} data-quicktool="Drugs" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-400 rounded-xl text-[11px] font-bold border border-purple-100 dark:border-purple-800/30 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors whitespace-nowrap">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            Drug Interactions
                        </button>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-3 relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
                            className="relative text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <Bell className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setActiveRightSidebar(!activeRightSidebar)}
                            className="lg:hidden text-slate-400 hover:text-teal-600 dark:text-slate-500 dark:hover:text-teal-400 transition-colors p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <Dumbbell className="w-5 h-5" />
                        </button>
                        <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
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
                            pendingQuickTool={pendingQuickTool}
                            onQuickToolConsumed={() => setPendingQuickTool(null)}
                            onOpenDrugInteractions={() => {
                                setRightPanel('drugs');
                                setActiveRightSidebar(true);
                            }}
                        />
                    ) : (
                        <LiveVoiceInterface onAgentAction={dispatch} />
                    )}
                </div>
            </div>

            {/* Right Sidebar: Fitness Panel / Health Dashboard */}
            <aside className={`
                fixed inset-y-0 right-0 w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-30 transform transition-transform duration-300
                lg:relative lg:transform-none lg:block
                ${activeRightSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            `}>
                {/* Panel Tabs */}
                <div className="p-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex bg-slate-100 dark:bg-slate-800/60 rounded-full p-1">
                        <button
                            onClick={() => setRightPanel('fitness')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition-all duration-200 ${rightPanel === 'fitness'
                                ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            <Dumbbell className="w-3.5 h-3.5" /> Fitness
                        </button>
                        <button
                            onClick={() => setRightPanel('health')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition-all duration-200 ${rightPanel === 'health'
                                ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            <Heart className="w-3.5 h-3.5" /> Health
                        </button>
                        <button
                            onClick={() => setRightPanel('drugs')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition-all duration-200 ${rightPanel === 'drugs'
                                ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-purple-500/20'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            <Pill className="w-3.5 h-3.5" /> Interactions
                        </button>
                    </div>
                </div>
                {/* Panel Content */}
                <div className="flex-1 overflow-hidden" style={{ height: 'calc(100% - 52px)' }}>
                    {rightPanel === 'fitness' ? <FitnessPanel /> : rightPanel === 'health' ? <HealthDashboard /> : <DrugInteractionChecker />}
                </div>
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

            {/* Settings Panel */}
            <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

        </div>
    );
};

export default Dashboard;
