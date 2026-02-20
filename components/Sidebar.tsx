import React, { useState } from 'react';
import { MessageSquare, History, LogOut, PlusCircle, Search, Trash2, User, Activity } from 'lucide-react'; // Added Activity for icon variety
import { ChatSession } from '../types';

interface SidebarProps {
    onNewChat: () => void;
    isOpen: boolean;
    toggleSidebar: () => void;
    sessions: ChatSession[];
    activeSessionId: string | null;
    onLoadChat: (sessionId: string) => void;
    onDeleteChat: (sessionId: string) => void;
}

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function groupSessions(sessions: ChatSession[]): { label: string; items: ChatSession[] }[] {
    const now = Date.now();
    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const thisWeek: ChatSession[] = [];
    const older: ChatSession[] = [];

    const dayMs = 86400000;
    const todayStart = new Date().setHours(0, 0, 0, 0);

    for (const s of sessions) {
        if (s.updatedAt >= todayStart) today.push(s);
        else if (s.updatedAt >= todayStart - dayMs) yesterday.push(s);
        else if (s.updatedAt >= now - 7 * dayMs) thisWeek.push(s);
        else older.push(s);
    }

    const groups: { label: string; items: ChatSession[] }[] = [];
    if (today.length) groups.push({ label: 'Today', items: today });
    if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
    if (thisWeek.length) groups.push({ label: 'This Week', items: thisWeek });
    if (older.length) groups.push({ label: 'Older', items: older });
    return groups;
}

const Sidebar: React.FC<SidebarProps> = ({ onNewChat, isOpen, toggleSidebar, sessions, activeSessionId, onLoadChat, onDeleteChat }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const filtered = searchQuery.trim()
        ? sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : sessions;

    const groups = groupSessions(filtered);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
                    onClick={toggleSidebar}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={`fixed top-0 left-0 h-full w-72 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:block shadow-2xl lg:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
            >
                <div className="flex flex-col h-full">

                    {/* Header / Logo */}
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-teal-600 flex items-center justify-center rounded-xl text-white shadow-lg shadow-teal-500/20">
                                <span className="material-icons-round font-bold text-xl">H</span>
                            </div>
                            <div>
                                <h1 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">HealthGuard</h1>
                                <span className="text-[10px] font-bold tracking-wider uppercase text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded">Pro AI</span>
                            </div>
                        </div>
                    </div>

                    {/* New Consultation Button */}
                    <div className="px-4 mb-6">
                        <button
                            onClick={onNewChat}
                            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-3.5 rounded-2xl font-semibold transition-all shadow-lg shadow-teal-500/25 active:scale-[0.98]"
                        >
                            <span className="material-icons-round text-lg">add_circle</span>
                            New Consultation
                        </button>
                    </div>

                    {/* Search */}
                    <div className="px-4 mb-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-teal-600 transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search chats..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border-none rounded-xl focus:ring-2 focus:ring-teal-500/20 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-slate-700 dark:text-slate-300 transition-all"
                            />
                        </div>
                    </div>

                    {/* Chat History */}
                    <div className="flex-1 overflow-y-auto px-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-300 dark:hover:scrollbar-thumb-slate-600">
                        {groups.length === 0 && (
                            <div className="text-center py-10 px-4 opacity-50">
                                <History className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No previous chats</p>
                            </div>
                        )}

                        {groups.map(group => (
                            <div key={group.label}>
                                <h3 className="px-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{group.label}</h3>
                                <div className="space-y-1">
                                    {group.items.map(session => (
                                        <button
                                            key={session.id}
                                            onClick={() => onLoadChat(session.id)}
                                            onMouseEnter={() => setHoveredId(session.id)}
                                            onMouseLeave={() => setHoveredId(null)}
                                            className={`w-full text-left p-3 rounded-xl flex items-start gap-3 transition-colors group relative ${activeSessionId === session.id
                                                ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-100/50 dark:border-teal-800/30'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                                                }`}
                                        >
                                            <span className={`material-icons-round text-sm mt-0.5 ${activeSessionId === session.id ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400'}`}>chat_bubble_outline</span>

                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <p className={`text-sm font-medium truncate ${activeSessionId === session.id ? 'text-teal-900 dark:text-teal-100' : 'text-slate-700 dark:text-slate-300'
                                                    }`}>{session.title}</p>
                                                <p className={`text-[10px] mt-0.5 truncate ${activeSessionId === session.id ? 'text-teal-600/70 dark:text-teal-400/70' : 'text-slate-400 dark:text-slate-500'
                                                    }`}>{formatTimeAgo(session.updatedAt)}</p>
                                            </div>

                                            {hoveredId === session.id && (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteChat(session.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors absolute right-2 top-2"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer / User Profile */}
                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 mt-auto">
                        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold overflow-hidden">
                                <User className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate group-hover:text-slate-900 dark:group-hover:text-white">Generic User</p>
                                <p className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">Pro Plan</p>
                            </div>
                            <span className="material-icons-round text-slate-400">logout</span>
                        </div>
                    </div>

                </div>
            </aside>
        </>
    );
};

export default Sidebar;
