import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Clock, Heart, Pill, Activity, CheckCircle, Trash2, Mail } from 'lucide-react';
import { getNotificationSettings } from './SettingsPanel';
import { sendReminderEmail, sendHealthCheckEmail, isEmailJSConfigured } from '../services/emailService';

interface NotificationItem {
    id: string;
    type: 'medicine' | 'health_check' | 'info';
    title: string;
    message: string;
    time: string;
    read: boolean;
}

const NOTIF_HISTORY_KEY = 'healthguard_notif_history';

function getNotifHistory(): NotificationItem[] {
    try {
        const stored = localStorage.getItem(NOTIF_HISTORY_KEY);
        if (stored) return JSON.parse(stored);
    } catch { }
    return [];
}

function saveNotifHistory(items: NotificationItem[]) {
    localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
}

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>(getNotifHistory());
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        setTimeout(() => document.addEventListener('click', handler), 0);
        return () => document.removeEventListener('click', handler);
    }, [isOpen, onClose]);

    // Check reminders every minute
    useEffect(() => {
        const check = () => {
            const settings = getNotificationSettings();
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            settings.medicineReminders.forEach(r => {
                if (!r.enabled || r.time !== currentTime) return;
                const alreadyNotified = notifications.some(n =>
                    n.title === `Take ${r.name}` && new Date(n.time).toDateString() === now.toDateString()
                );
                if (alreadyNotified) return;

                const newNotif: NotificationItem = {
                    id: Date.now().toString(),
                    type: 'medicine',
                    title: `Take ${r.name}`,
                    message: `It's time for your ${r.name} medication.`,
                    time: now.toISOString(),
                    read: false
                };
                setNotifications(prev => {
                    const updated = [newNotif, ...prev];
                    saveNotifHistory(updated);
                    return updated;
                });

                // Browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(`💊 Time for ${r.name}`, { body: `Take your ${r.name} medication now.`, icon: '/favicon.ico' });
                }

                // Email notification via EmailJS
                if (settings.emailEnabled && r.email) {
                    sendReminderEmail({
                        toEmail: r.email,
                        medicineName: r.name,
                        reminderTime: r.time,
                    }).then(sent => {
                        if (sent) {
                            setNotifications(prev => {
                                const updated = prev.map(n => n.id === newNotif.id
                                    ? { ...n, message: n.message + ' 📧 Email sent.' }
                                    : n);
                                saveNotifHistory(updated);
                                return updated;
                            });
                        }
                    });
                }
            });

            // Health check reminder
            if (settings.healthCheckFrequency !== 'never') {
                const vitals = localStorage.getItem('healthguard_vitals');
                let needsReminder = false;
                if (!vitals) {
                    needsReminder = true;
                } else {
                    const entries = JSON.parse(vitals);
                    if (entries.length === 0) needsReminder = true;
                    else {
                        const lastEntry = new Date(entries[0].date);
                        const hoursSince = (now.getTime() - lastEntry.getTime()) / 3600000;
                        if (settings.healthCheckFrequency === 'daily' && hoursSince > 24) needsReminder = true;
                        if (settings.healthCheckFrequency === 'weekly' && hoursSince > 168) needsReminder = true;
                    }
                }
                if (needsReminder && now.getHours() === 9 && now.getMinutes() === 0) {
                    const alreadyNotified = notifications.some(n =>
                        n.type === 'health_check' && new Date(n.time).toDateString() === now.toDateString()
                    );
                    if (!alreadyNotified) {
                        const newNotif: NotificationItem = {
                            id: Date.now().toString() + '_hc',
                            type: 'health_check',
                            title: 'Log Your Vitals',
                            message: "Don't forget to record your health vitals today!",
                            time: now.toISOString(),
                            read: false
                        };
                        setNotifications(prev => {
                            const updated = [newNotif, ...prev];
                            saveNotifHistory(updated);
                            return updated;
                        });

                        // Email for health check
                        if (settings.emailEnabled && settings.medicineReminders.length > 0) {
                            const email = settings.medicineReminders[0].email;
                            if (email) {
                                sendHealthCheckEmail({
                                    toEmail: email,
                                    frequency: settings.healthCheckFrequency,
                                });
                            }
                        }
                    }
                }
            }
        };

        check();
        const interval = setInterval(check, 60000);
        return () => clearInterval(interval);
    }, []);

    // Request browser notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const markAllRead = () => {
        const updated = notifications.map(n => ({ ...n, read: true }));
        setNotifications(updated);
        saveNotifHistory(updated);
    };

    const clearAll = () => {
        setNotifications([]);
        saveNotifHistory([]);
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const getIcon = (type: string) => {
        switch (type) {
            case 'medicine': return <Pill className="w-4 h-4 text-violet-500" />;
            case 'health_check': return <Heart className="w-4 h-4 text-rose-500" />;
            default: return <Activity className="w-4 h-4 text-teal-500" />;
        }
    };

    if (!isOpen) return null;

    return (
        <div ref={panelRef} className="absolute top-14 right-12 w-80 bg-white dark:bg-[#1a2240] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-teal-500" />
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Notifications</h3>
                    {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-500 text-white rounded-full">{unreadCount}</span>
                    )}
                </div>
                <div className="flex gap-1">
                    {notifications.length > 0 && (
                        <>
                            <button onClick={markAllRead} className="text-[10px] font-bold text-teal-500 hover:text-teal-600 px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all">
                                Mark all read
                            </button>
                            <button onClick={clearAll} className="text-slate-300 hover:text-red-400 p-1 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                        <Bell className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">No notifications yet</p>
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">Set up medicine reminders in Settings</p>
                    </div>
                ) : (
                    notifications.slice(0, 15).map(notif => (
                        <div key={notif.id} className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800 transition-colors ${!notif.read ? 'bg-teal-50/50 dark:bg-teal-900/5' : ''}`}>
                            <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                {getIcon(notif.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold ${!notif.read ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{notif.title}</p>
                                <p className="text-[10px] text-slate-400 leading-relaxed">{notif.message}</p>
                                <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-0.5 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {new Date(notif.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </p>
                            </div>
                            {!notif.read && <div className="w-2 h-2 bg-teal-500 rounded-full shrink-0 mt-1.5" />}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export { getNotifHistory, saveNotifHistory };
export type { NotificationItem };
export default NotificationPanel;
