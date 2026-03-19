import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChatMessage, ChatSession, MessageRole } from '../types';
import { useAuth } from '../src/context/AuthContext';

const BASE_STORAGE_KEY = 'healthguard_chat_history';
const MAX_SESSIONS = 50;
const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL ? `${(import.meta as any).env.VITE_BACKEND_URL}/api/chats` : 'https://healthguard-backend-yo9a.onrender.com/api/chats';

const WELCOME_MESSAGE: ChatMessage = {
    id: 'welcome',
    role: MessageRole.SYSTEM,
    text: "Namaste! I'm HealthGuard Pro. I can suggest **Indian home remedies**, **healthy diet plans**, or order medicines for you. How are you feeling today?"
};

function generateTitle(messages: ChatMessage[]): string {
    const firstUserMsg = messages.find(m => m.role === MessageRole.USER);
    if (!firstUserMsg) return 'New Consultation';
    const text = firstUserMsg.text.trim();
    if (text.length <= 40) return text || 'New Consultation';
    return text.substring(0, 40) + '…';
}

function normalizeMessage(raw: any): ChatMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const role = raw.role;
    if (role !== MessageRole.USER && role !== MessageRole.MODEL && role !== MessageRole.SYSTEM) return null;
    return {
        id: String(raw.id || Date.now()),
        role,
        text: typeof raw.text === 'string' ? raw.text : '',
        image: typeof raw.image === 'string' ? raw.image : undefined,
        audio: typeof raw.audio === 'string' ? raw.audio : undefined,
        timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
        suggestedActions: Array.isArray(raw.suggestedActions) ? raw.suggestedActions.filter((s: any) => typeof s === 'string') : undefined,
        suggestedQuestionCards: Array.isArray(raw.suggestedQuestionCards) ? raw.suggestedQuestionCards : undefined,
        priceComparison: raw.priceComparison,
        showPharmacyMap: typeof raw.showPharmacyMap === 'boolean' ? raw.showPharmacyMap : undefined,
        thinkingText: typeof raw.thinkingText === 'string' ? raw.thinkingText : undefined,
        thinkingDuration: typeof raw.thinkingDuration === 'number' ? raw.thinkingDuration : undefined,
        imageGen: raw.imageGen,
        groundingSources: Array.isArray(raw.groundingSources) ? raw.groundingSources : undefined,
    };
}

function normalizeSession(raw: any): ChatSession | null {
    if (!raw || typeof raw !== 'object') return null;
    const messages = Array.isArray(raw.messages)
        ? raw.messages.map(normalizeMessage).filter(Boolean) as ChatMessage[]
        : [];

    const updatedAt = Number(raw.updatedAt);
    const createdAt = Number(raw.createdAt || updatedAt || Date.now());

    return {
        id: String(raw.id || `chat_${createdAt}`),
        title: typeof raw.title === 'string' && raw.title.trim().length > 0
            ? raw.title
            : generateTitle(messages.length ? messages : [WELCOME_MESSAGE]),
        messages: messages.length ? messages : [WELCOME_MESSAGE],
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
}

function normalizeSessions(raw: any): ChatSession[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(normalizeSession)
        .filter(Boolean) as ChatSession[];
}

function loadSessions(storageKey: string): ChatSession[] {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        return normalizeSessions(JSON.parse(raw));
    } catch {
        return [];
    }
}

function saveSessions(storageKey: string, sessions: ChatSession[]): void {
    if (!storageKey) return;
    try {
        const safeSessions = normalizeSessions(sessions);
        // Only save text + metadata, strip large base64 images/audio to save space
        const lightweight = safeSessions.map(s => ({
            ...s,
            messages: (Array.isArray(s.messages) ? s.messages : []).map(m => ({
                ...m,
                image: m.image ? '[image]' : undefined,
                audio: undefined
            }))
        }));
        localStorage.setItem(storageKey, JSON.stringify(lightweight.slice(0, MAX_SESSIONS)));
    } catch (e) {
        console.warn('Failed to save chat history:', e);
    }
}

export function useChatHistory() {
    const { user } = useAuth();

    // Create a user-specific storage key so chats don't leak between accounts
    const storageKey = useMemo(() => {
        return user ? `${BASE_STORAGE_KEY}_${user.uid}` : BASE_STORAGE_KEY;
    }, [user]);

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);

    // Load from DB if user is available, otherwise from local cache, and clear state on logout
    useEffect(() => {
        // If user logs out, clear the current active session state immediately
        // so the next person doesn't see their screen.
        setActiveSessionId(null);
        setMessages([WELCOME_MESSAGE]);

        if (!user) {
            setSessions(loadSessions(storageKey));
            return;
        }

        // When logged in, initialize securely from their specific cache...
        const cached = loadSessions(storageKey);
        setSessions(cached);

        // ...then sync remote data
        const fetchChats = async () => {
            try {
                const res = await fetch(`${API_BASE}/${user.uid}`);
                if (res.ok) {
                    const data = await res.json();
                    const normalized = normalizeSessions(data);
                    if (normalized.length > 0) {
                        setSessions(normalized);
                        localStorage.setItem(storageKey, JSON.stringify(normalized.slice(0, MAX_SESSIONS)));
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch from DB, falling back to local storage', e);
            }
        };
        fetchChats();
    }, [user, storageKey]);

    // Persist sessions to localStorage whenever they change
    useEffect(() => {
        if (sessions.length > 0) {
            saveSessions(storageKey, sessions);
        }
    }, [sessions, storageKey]);

    // Save current messages into the active session
    const saveCurrentChat = useCallback((currentMessages: ChatMessage[]) => {
        if (currentMessages.length <= 1) return; // Don't save empty chats

        const now = Date.now();
        const title = generateTitle(currentMessages);

        setSessions(prev => {
            let updatedSessions: ChatSession[];
            let currentSession: ChatSession;

            if (activeSessionId) {
                // Update existing session
                const existing = prev.find(s => s.id === activeSessionId);
                currentSession = existing ? { ...existing, messages: currentMessages, title, updatedAt: now } : { id: activeSessionId, title, messages: currentMessages, createdAt: now, updatedAt: now };
                updatedSessions = prev.map(s => s.id === activeSessionId ? currentSession : s).sort((a, b) => b.updatedAt - a.updatedAt);
            } else {
                // Create new session
                const newId = 'chat_' + now;
                setActiveSessionId(newId);
                currentSession = { id: newId, title, messages: currentMessages, createdAt: now, updatedAt: now };
                updatedSessions = [currentSession, ...prev].slice(0, MAX_SESSIONS);
            }

            // Sync to MongoDB if user is logged in
            if (user) {
                const lightweightSession = {
                    ...currentSession,
                    messages: (Array.isArray(currentSession.messages) ? currentSession.messages : []).map(m => ({
                        ...m,
                        image: m.image ? '[image]' : undefined,
                        audio: undefined
                    }))
                };
                fetch(`${API_BASE}/${user.uid}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(lightweightSession)
                }).catch(e => console.warn('Failed to sync chat to DB', e));
            }

            return updatedSessions;
        });
    }, [activeSessionId, user]);

    // Start a new chat
    const startNewChat = useCallback(() => {
        // Save current chat first if it has messages
        if (messages.length > 1) {
            saveCurrentChat(messages);
        }
        setActiveSessionId(null);
        setMessages([WELCOME_MESSAGE]);
    }, [messages, saveCurrentChat]);

    // Load a previous chat
    const loadChat = useCallback((sessionId: string) => {
        // Save current chat first
        if (messages.length > 1 && activeSessionId !== sessionId) {
            saveCurrentChat(messages);
        }

        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            setActiveSessionId(sessionId);
            setMessages(session.messages);
        }
    }, [sessions, messages, activeSessionId, saveCurrentChat]);

    // Delete a chat
    const deleteChat = useCallback((sessionId: string) => {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSessionId === sessionId) {
            setActiveSessionId(null);
            setMessages([WELCOME_MESSAGE]);
        }

        // Delete from MongoDB
        if (user) {
            fetch(`${API_BASE}/${user.uid}/${sessionId}`, {
                method: 'DELETE'
            }).catch(e => console.warn('Failed to delete chat from DB', e));
        }
    }, [activeSessionId, user]);

    return {
        sessions,
        activeSessionId,
        messages,
        setMessages,
        saveCurrentChat,
        startNewChat,
        loadChat,
        deleteChat
    };
}
