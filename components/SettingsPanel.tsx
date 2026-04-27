import React, { useState, useEffect } from 'react';
import { X, User, Sun, Moon, Monitor, Bell, Shield, LogOut, ChevronRight, Trash2, Download, Clock, Plus, Mail } from 'lucide-react';
import { useAuth } from '../src/context/AuthContext';
import { logoutUser } from '../src/services/firebaseAuth';
import { useNavigate } from 'react-router-dom';
import { scheduleMedicineLocalNotification } from '../src/lib/localNotifications';
import { upsertMedicineReminder } from '../src/lib/healthStore';

// --- Types ---
interface MedicineReminder {
    id: string;
    name: string;
    time: string; // HH:MM
    email: string;
    enabled: boolean;
}

interface NotificationSettings {
    medicineReminders: MedicineReminder[];
    healthCheckFrequency: 'daily' | 'weekly' | 'never';
    emailEnabled: boolean;
}

interface SettingsTab {
    id: string;
    label: string;
    icon: React.ReactNode;
}

const THEME_KEY = 'healthguard_theme';
const NOTIF_KEY = 'healthguard_notifications';
const VITALS_KEY = 'healthguard_vitals';

// --- Theme Helper ---
export function applyTheme(theme: string) {
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
}

export function getStoredTheme(): string {
    return localStorage.getItem(THEME_KEY) || 'system';
}

export function getNotificationSettings(): NotificationSettings {
    try {
        const stored = localStorage.getItem(NOTIF_KEY);
        if (stored) return JSON.parse(stored);
    } catch { }
    return { medicineReminders: [], healthCheckFrequency: 'daily', emailEnabled: true };
}

export function saveNotificationSettings(settings: NotificationSettings) {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(settings));
}

// --- Component ---
interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState('profile');
    const [theme, setTheme] = useState(getStoredTheme());
    const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings());
    const [newReminder, setNewReminder] = useState({ name: '', time: '08:00', email: '' });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    useEffect(() => { applyTheme(theme); }, [theme]);
    useEffect(() => { saveNotificationSettings(notifSettings); }, [notifSettings]);
    useEffect(() => {
        if (isOpen && user?.email && !newReminder.email) {
            setNewReminder(prev => ({ ...prev, email: user.email || '' }));
        }
    }, [isOpen, user]);

    const handleLogout = async () => {
        await logoutUser();
        navigate('/');
    };

    const addReminder = async () => {
        if (!newReminder.name.trim()) return;
        const reminder: MedicineReminder = {
            id: Date.now().toString(),
            name: newReminder.name,
            time: newReminder.time,
            email: newReminder.email || user?.email || '',
            enabled: true
        };
        setNotifSettings(prev => ({ ...prev, medicineReminders: [...prev.medicineReminders, reminder] }));
        const healthReminder = upsertMedicineReminder({
            title: `Take ${reminder.name}`,
            time: reminder.time,
            enabled: true,
            email: reminder.email,
            source: reminder.email ? 'both' : 'local',
        });
        const ids = await scheduleMedicineLocalNotification(healthReminder);
        if (ids.length > 0) {
            upsertMedicineReminder({ ...healthReminder, notificationIds: ids.map(String) });
        }
        setNewReminder({ name: '', time: '08:00', email: user?.email || '' });
    };

    const deleteReminder = (id: string) => {
        setNotifSettings(prev => ({ ...prev, medicineReminders: prev.medicineReminders.filter(r => r.id !== id) }));
        setShowDeleteConfirm(null);
    };

    const toggleReminder = (id: string) => {
        setNotifSettings(prev => ({
            ...prev,
            medicineReminders: prev.medicineReminders.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
        }));
    };

    const clearChatHistory = () => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('healthguard_chat'));
        keys.forEach(k => localStorage.removeItem(k));
        setShowDeleteConfirm(null);
        alert('Chat history cleared.');
    };

    const clearVitals = () => {
        localStorage.removeItem(VITALS_KEY);
        setShowDeleteConfirm(null);
        alert('Vitals data cleared.');
    };

    const exportVitals = () => {
        try {
            const data = localStorage.getItem(VITALS_KEY);
            if (!data) { alert('No vitals data to export.'); return; }
            const entries = JSON.parse(data);
            const headers = ['Date', 'BP Systolic', 'BP Diastolic', 'Blood Sugar', 'Weight', 'Temperature', 'Heart Rate', 'Notes'];
            const rows = entries.map((e: any) => [
                new Date(e.date).toLocaleString(), e.bp_systolic || '', e.bp_diastolic || '',
                e.blood_sugar || '', e.weight || '', e.temperature || '', e.heart_rate || '', e.notes || ''
            ]);
            const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `healthguard_vitals_${new Date().toISOString().split('T')[0]}.csv`;
            a.click(); URL.revokeObjectURL(url);
        } catch { alert('Failed to export data.'); }
    };

    const tabs: SettingsTab[] = [
        { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
        { id: 'theme', label: 'Appearance', icon: <Sun className="w-4 h-4" /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
        { id: 'privacy', label: 'Privacy & Data', icon: <Shield className="w-4 h-4" /> },
        { id: 'account', label: 'Account', icon: <LogOut className="w-4 h-4" /> },
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative ml-auto w-full max-w-md bg-white dark:bg-[#0f1628] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Settings</h2>
                    <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 p-3 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveSection(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${activeSection === tab.id
                                ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* =================== PROFILE =================== */}
                    {activeSection === 'profile' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="flex items-center gap-4 bg-white dark:bg-[#1a2240] rounded-3xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                <div className="w-14 h-14 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md shadow-teal-500/20">
                                    {user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user?.displayName || 'User'}</p>
                                    <p className="text-xs text-slate-400 truncate">{user?.email || 'No email'}</p>
                                    <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                                        Joined {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-3">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Display Name</label>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium mt-0.5">{user?.displayName || '—'}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium mt-0.5">{user?.email || '—'}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Provider</label>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium mt-0.5 capitalize">
                                        {user?.providerData?.[0]?.providerId === 'google.com' ? '🔵 Google' : '📧 Email/Password'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =================== THEME =================== */}
                    {activeSection === 'theme' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Choose your preferred appearance.</p>
                            {([
                                { key: 'light', label: 'Light', desc: 'Clean and bright', icon: <Sun className="w-5 h-5" /> },
                                { key: 'dark', label: 'Dark', desc: 'Easy on the eyes', icon: <Moon className="w-5 h-5" /> },
                                { key: 'system', label: 'System', desc: 'Match your OS setting', icon: <Monitor className="w-5 h-5" /> },
                            ] as const).map(opt => (
                                <button key={opt.key} onClick={() => setTheme(opt.key)}
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${theme === opt.key
                                        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 ring-2 ring-teal-500/20'
                                        : 'bg-white dark:bg-[#1a2240] border-slate-100 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === opt.key ? 'bg-teal-100 dark:bg-teal-800/30 text-teal-600 dark:text-teal-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                        {opt.icon}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">{opt.label}</p>
                                        <p className="text-[11px] text-slate-400">{opt.desc}</p>
                                    </div>
                                    {theme === opt.key && <div className="w-2.5 h-2.5 bg-teal-500 rounded-full" />}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* =================== NOTIFICATIONS =================== */}
                    {activeSection === 'notifications' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Health Check Frequency */}
                            <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" /> Health Check Reminders
                                </h3>
                                <div className="flex gap-2">
                                    {(['daily', 'weekly', 'never'] as const).map(freq => (
                                        <button key={freq} onClick={() => setNotifSettings(prev => ({ ...prev, healthCheckFrequency: freq }))}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all border ${notifSettings.healthCheckFrequency === freq
                                                ? 'bg-teal-500 border-teal-500 text-white shadow-md shadow-teal-500/20'
                                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-teal-300'}`}>
                                            {freq}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Medicine Reminders */}
                            <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Bell className="w-3 h-3" /> Medicine Reminders
                                </h3>

                                {/* Existing reminders */}
                                {notifSettings.medicineReminders.length > 0 && (
                                    <div className="space-y-2 mb-3">
                                        {notifSettings.medicineReminders.map(r => (
                                            <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                                                <button onClick={() => toggleReminder(r.id)}
                                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${r.enabled
                                                        ? 'bg-teal-500 border-teal-500 text-white'
                                                        : 'border-slate-300 dark:border-slate-600'}`}>
                                                    {r.enabled && <span className="text-[10px]">✓</span>}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{r.name}</p>
                                                    <p className="text-[10px] text-slate-400">{r.time} • {r.email}</p>
                                                </div>
                                                <button onClick={() => deleteReminder(r.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add new reminder */}
                                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                    <input type="text" value={newReminder.name} onChange={e => setNewReminder(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Medicine name..." className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700 dark:text-white" />
                                    <div className="flex gap-2">
                                        <input type="time" value={newReminder.time} onChange={e => setNewReminder(prev => ({ ...prev, time: e.target.value }))}
                                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700 dark:text-white" />
                                        <input type="email" value={newReminder.email} onChange={e => setNewReminder(prev => ({ ...prev, email: e.target.value }))}
                                            placeholder="Email for reminders" className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-700 dark:text-white" />
                                    </div>
                                    <button onClick={addReminder} disabled={!newReminder.name.trim()}
                                        className="w-full py-2 text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                                        <Plus className="w-3 h-3" /> Add Reminder
                                    </button>
                                </div>
                            </div>

                            {/* Email toggle */}
                            <div className="flex items-center justify-between bg-white dark:bg-[#1a2240] rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50">
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Email Notifications</span>
                                </div>
                                <button onClick={() => setNotifSettings(prev => ({ ...prev, emailEnabled: !prev.emailEnabled }))}
                                    className={`w-10 h-5 rounded-full transition-all relative ${notifSettings.emailEnabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${notifSettings.emailEnabled ? 'left-5.5 translate-x-[2px]' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* =================== PRIVACY =================== */}
                    {activeSection === 'privacy' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            <p className="text-xs text-slate-500 dark:text-slate-400">All data is stored locally on your device. Nothing is sent to external servers.</p>

                            <button onClick={exportVitals}
                                className="w-full flex items-center gap-3 p-4 bg-white dark:bg-[#1a2240] rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:border-teal-300 dark:hover:border-teal-700 transition-all text-left">
                                <div className="w-9 h-9 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center">
                                    <Download className="w-4 h-4 text-teal-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Export Vitals Data</p>
                                    <p className="text-[10px] text-slate-400">Download as CSV file</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>

                            <button onClick={() => setShowDeleteConfirm('chats')}
                                className="w-full flex items-center gap-3 p-4 bg-white dark:bg-[#1a2240] rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:border-red-300 dark:hover:border-red-700 transition-all text-left">
                                <div className="w-9 h-9 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center">
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Clear Chat History</p>
                                    <p className="text-[10px] text-slate-400">Remove all saved conversations</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>

                            <button onClick={() => setShowDeleteConfirm('vitals')}
                                className="w-full flex items-center gap-3 p-4 bg-white dark:bg-[#1a2240] rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:border-red-300 dark:hover:border-red-700 transition-all text-left">
                                <div className="w-9 h-9 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center">
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Clear Vitals Data</p>
                                    <p className="text-[10px] text-slate-400">Remove all health dashboard entries</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </button>

                            {/* Confirm dialog */}
                            {showDeleteConfirm && (
                                <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-4 border border-red-200 dark:border-red-800/30">
                                    <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2">⚠️ Are you sure? This cannot be undone.</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => showDeleteConfirm === 'chats' ? clearChatHistory() : clearVitals()}
                                            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all">
                                            Yes, Delete
                                        </button>
                                        <button onClick={() => setShowDeleteConfirm(null)}
                                            className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* =================== ACCOUNT =================== */}
                    {activeSection === 'account' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm text-center">
                                <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 shadow-lg shadow-teal-500/20">
                                    {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <p className="text-sm font-bold text-slate-800 dark:text-white">{user?.displayName || 'User'}</p>
                                <p className="text-xs text-slate-400 mb-1">{user?.email}</p>
                                <p className="text-[10px] text-slate-300 dark:text-slate-600">UID: {user?.uid?.slice(0, 12)}...</p>
                            </div>

                            <button onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-red-500/20 active:scale-[0.98]">
                                <LogOut className="w-4 h-4" /> Sign Out
                            </button>

                            <p className="text-center text-[10px] text-slate-400 dark:text-slate-600">
                                HealthGuard AI v2.0 • Made with ❤️
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
