import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Thermometer, Droplets, Scale, Activity, Plus, X, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import { notifyVitalsUpdated } from '../services/vitalsRAG';
import { getBackendUrl } from '../src/lib/backendUrl';
import { useAuth } from '../src/context/AuthContext';

// --- Types ---
interface VitalEntry {
    date: string;
    timestamp: number;
    bp_systolic?: number;
    bp_diastolic?: number;
    blood_sugar?: number;
    weight?: number;
    temperature?: number;
    heart_rate?: number;
    notes?: string;
    context?: string; // e.g. "Resting", "Walking", "Post-meal"
}

const STORAGE_KEY = 'healthguard_vitals';

function getStatus(key: string, value: number): { label: string; color: string; dotColor: string } {
    const ranges: Record<string, { low: number; high: number }> = {
        bp_systolic: { low: 90, high: 140 },
        blood_sugar: { low: 70, high: 140 },
        weight: { low: 30, high: 200 },
        temperature: { low: 97.0, high: 99.5 },
        heart_rate: { low: 60, high: 100 },
    };
    const r = ranges[key];
    if (!r) return { label: 'Normal', color: 'text-emerald-400', dotColor: 'bg-emerald-400' };
    if (value < r.low) return { label: 'Low', color: 'text-amber-400', dotColor: 'bg-amber-400' };
    if (value > r.high) return { label: 'Elevated', color: 'text-rose-400', dotColor: 'bg-rose-400' };
    return { label: 'Normal', color: 'text-emerald-400', dotColor: 'bg-emerald-400' };
}

// --- Mini Bar Chart ---
function MiniBarChart({ data, color }: { data: number[]; color: string }) {
    const max = Math.max(...data, 1);
    const display = data.slice(-6);
    return (
        <div className="flex items-end gap-[3px] h-7">
            {display.map((v, i) => (
                <div key={i} className="w-[5px] rounded-full transition-all" style={{ height: `${Math.max(15, (v / max) * 100)}%`, backgroundColor: color, opacity: i === display.length - 1 ? 1 : 0.4 }} />
            ))}
        </div>
    );
}

// --- Progress Bar ---
function VitalProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className="w-full h-[5px] rounded-full bg-slate-700/50 mt-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
    );
}

const HealthDashboard: React.FC = () => {
    const { user } = useAuth();
    const [entries, setEntries] = useState<VitalEntry[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '1y'>('7d');
    const [formData, setFormData] = useState({
        bp_systolic: '', bp_diastolic: '', blood_sugar: '', weight: '', temperature: '', heart_rate: '', notes: '', context: 'Resting', reminderDays: '0'
    });

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) setEntries(JSON.parse(stored));
        } catch { }
    }, []);

    const saveEntries = useCallback((newEntries: VitalEntry[]) => {
        setEntries(newEntries);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newEntries));
        notifyVitalsUpdated();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const entry: VitalEntry = {
            date: new Date().toISOString(),
            timestamp: Date.now(),
            context: formData.context || 'Resting',
            ...(formData.bp_systolic && { bp_systolic: Number(formData.bp_systolic) }),
            ...(formData.bp_diastolic && { bp_diastolic: Number(formData.bp_diastolic) }),
            ...(formData.blood_sugar && { blood_sugar: Number(formData.blood_sugar) }),
            ...(formData.weight && { weight: Number(formData.weight) }),
            ...(formData.temperature && { temperature: Number(formData.temperature) }),
            ...(formData.heart_rate && { heart_rate: Number(formData.heart_rate) }),
            ...(formData.notes && { notes: formData.notes }),
        };
        saveEntries([entry, ...entries]);

        // Create reminder if interval selected
        const reminderDays = Number(formData.reminderDays || '0');
        if (reminderDays > 0) {
            const intervalLabels: Record<number, string> = {
                7: '7 days', 14: '14 days', 30: '30 days',
                90: '3 months', 180: '6 months', 365: '1 year'
            };
            const backendUrl = getBackendUrl();
            fetch(`${backendUrl}/api/reminder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user?.email || '',
                    interval_days: reminderDays,
                    interval_label: intervalLabels[reminderDays] || `${reminderDays} days`,
                })
            }).then(r => r.json()).then(data => {
                console.log('[Reminder] Created:', data);
            }).catch(err => {
                console.warn('[Reminder] Failed to create:', err);
            });
        }

        setFormData({ bp_systolic: '', bp_diastolic: '', blood_sugar: '', weight: '', temperature: '', heart_rate: '', notes: '', context: 'Resting', reminderDays: '0' });
        setShowForm(false);
    };

    const deleteEntry = (timestamp: number) => saveEntries(entries.filter(e => e.timestamp !== timestamp));

    const now = Date.now();
    const filtered = entries.filter(e => {
        if (timeRange === '7d') return now - e.timestamp < 7 * 86400000;
        if (timeRange === '30d') return now - e.timestamp < 30 * 86400000;
        return now - e.timestamp < 365 * 86400000;
    });

    const getLatest = (key: string): number | null => {
        for (const entry of entries) {
            const val = (entry as any)[key];
            if (val != null) return val;
        }
        return null;
    };

    const getTrend = (key: string): number[] => {
        return filtered.filter(e => (e as any)[key] != null).map(e => (e as any)[key]).reverse().slice(-8);
    };

    const getWeightDelta = (): string | null => {
        const weights = entries.filter(e => e.weight != null).map(e => ({ w: e.weight!, t: e.timestamp }));
        if (weights.length < 2) return null;
        const latest = weights[0].w;
        const weekAgo = weights.find(w => now - w.t > 7 * 86400000);
        if (!weekAgo) return null;
        const delta = latest - weekAgo.w;
        return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}kg vs last week`;
    };

    const todayEntries = entries.filter(e => new Date(e.date).toDateString() === new Date().toDateString());

    // Build recent entries display
    const recentItems: { icon: React.ReactNode; label: string; time: string; context: string; value: string; status: { label: string; color: string } }[] = [];
    filtered.slice(0, 10).forEach(entry => {
        const time = new Date(entry.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
        const ctx = entry.context || 'Resting';
        if (entry.bp_systolic) {
            recentItems.push({
                icon: <Heart className="w-4 h-4" />, label: 'Blood Pressure', time, context: ctx,
                value: `${entry.bp_systolic}/${entry.bp_diastolic || '--'}`, status: getStatus('bp_systolic', entry.bp_systolic)
            });
        }
        if (entry.heart_rate) {
            recentItems.push({
                icon: <Activity className="w-4 h-4" />, label: 'Heart Rate', time, context: ctx,
                value: `${entry.heart_rate} bpm`, status: getStatus('heart_rate', entry.heart_rate)
            });
        }
        if (entry.blood_sugar) {
            recentItems.push({
                icon: <Droplets className="w-4 h-4" />, label: 'Blood Sugar', time, context: ctx,
                value: `${entry.blood_sugar} mg/dL`, status: getStatus('blood_sugar', entry.blood_sugar)
            });
        }
        if (entry.weight) {
            recentItems.push({
                icon: <Scale className="w-4 h-4" />, label: 'Weight', time, context: ctx,
                value: `${entry.weight} kg`, status: getStatus('weight', entry.weight)
            });
        }
        if (entry.temperature) {
            recentItems.push({
                icon: <Thermometer className="w-4 h-4" />, label: 'Temperature', time, context: ctx,
                value: `${entry.temperature} °F`, status: getStatus('temperature', entry.temperature)
            });
        }
    });

    const bpSys = getLatest('bp_systolic');
    const bpDia = getLatest('bp_diastolic');
    const hr = getLatest('heart_rate');
    const sugar = getLatest('blood_sugar');
    const weight = getLatest('weight');
    const hrTrend = getTrend('heart_rate');
    const weightDelta = getWeightDelta();

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden relative">
            <div className="flex-1 overflow-y-auto scroll-smooth">
                {/* Header */}
                <div className="px-4 sm:px-5 pt-5 pb-3 flex items-start justify-between">
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Welcome back,</p>
                        <h2 className="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight">Health Dashboard</h2>
                    </div>
                    <div className="w-10 h-10 bg-gradient-to-br from-rose-400 to-orange-300 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20">
                        <Heart className="w-4 h-4 text-white" />
                    </div>
                </div>

                {/* Time Range Tabs */}
                <div className="px-4 sm:px-5 mb-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1 text-xs font-bold">
                        {([['7d', '7 Days'], ['30d', '30 Days'], ['1y', '1 Year']] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setTimeRange(key as any)}
                                className={`flex-1 py-2 rounded-xl text-center transition-all ${timeRange === key
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Vitals Grid (2 columns) */}
                <div className="px-4 sm:px-5 grid grid-cols-2 gap-3 mb-4">
                    {/* Blood Pressure Card */}
                    <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-5 h-5 bg-rose-100 dark:bg-rose-500/20 rounded-lg flex items-center justify-center">
                                <Heart className="w-3 h-3 text-rose-500" />
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Blood Pressure</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                            {bpSys !== null ? `${bpSys}/${bpDia || '--'}` : '—/—'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">mmHg</p>
                        <VitalProgressBar value={bpSys || 0} max={180} color="linear-gradient(90deg, #f43f5e, #fb923c)" />
                    </div>

                    {/* Heart Rate Card */}
                    <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-5 h-5 bg-teal-100 dark:bg-teal-500/20 rounded-lg flex items-center justify-center">
                                <Activity className="w-3 h-3 text-teal-500" />
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Heart Rate</span>
                        </div>
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                                    {hr !== null ? hr : '—'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">bpm</p>
                            </div>
                            {hrTrend.length >= 2 && <MiniBarChart data={hrTrend} color="#14b8a6" />}
                        </div>
                    </div>

                    {/* Blood Sugar Card */}
                    <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-5 h-5 bg-blue-100 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                                <Droplets className="w-3 h-3 text-blue-500" />
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Blood Sugar</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                            {sugar !== null ? sugar : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">mg/dL</p>
                        {sugar !== null && (
                            <span className={`inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full ${getStatus('blood_sugar', sugar).color} bg-slate-100 dark:bg-slate-800`}>
                                {getStatus('blood_sugar', sugar).label}
                            </span>
                        )}
                    </div>

                    {/* Weight Card */}
                    <div className="bg-white dark:bg-[#1a2240] rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="w-5 h-5 bg-violet-100 dark:bg-violet-500/20 rounded-lg flex items-center justify-center">
                                <Scale className="w-3 h-3 text-violet-500" />
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Weight</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                            {weight !== null ? weight : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">kg</p>
                        {weightDelta && (
                            <div className="flex items-center gap-1 mt-1.5">
                                <TrendingDown className="w-3 h-3 text-emerald-400" />
                                <span className="text-[9px] text-slate-400">{weightDelta}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Entries */}
                <div className="px-4 sm:px-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" /> Recent Entries
                        </h3>
                        <span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">
                            {todayEntries.length} TODAY
                        </span>
                    </div>

                    {recentItems.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-slate-400">No entries yet. Tap "Log Vitals" to start!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentItems.slice(0, 8).map((item, i) => (
                                <div key={i} className="flex items-center bg-white dark:bg-[#1a2240] rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-700/50 shadow-sm">
                                    <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                                        {item.icon}
                                    </div>
                                    <div className="ml-3 flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.label}</p>
                                        <p className="text-[10px] text-slate-400">{item.time} • {item.context}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-2">
                                        <p className="text-sm font-extrabold text-slate-800 dark:text-white">{item.value}</p>
                                        <p className={`text-[9px] font-bold uppercase ${item.status.color}`}>{item.status.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Log Vitals Button */}
                <div className="px-4 sm:px-5 pb-6">
                    <button onClick={() => setShowForm(true)}
                        className="w-full py-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white text-sm font-bold rounded-2xl shadow-lg shadow-teal-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> Log Vitals
                    </button>
                </div>
            </div>

            {/* Log Vitals Form Overlay */}
            {showForm && (
                <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-20 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
                    <div className="w-full max-w-md bg-white dark:bg-[#1a2240] rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-slate-800 dark:text-white">📋 Log Today's Vitals</h3>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { key: 'bp_systolic', label: 'BP Systolic', ph: '120', unit: 'mmHg' },
                                    { key: 'bp_diastolic', label: 'BP Diastolic', ph: '80', unit: 'mmHg' },
                                    { key: 'blood_sugar', label: 'Blood Sugar', ph: '100', unit: 'mg/dL' },
                                    { key: 'heart_rate', label: 'Heart Rate', ph: '72', unit: 'bpm' },
                                    { key: 'weight', label: 'Weight', ph: '70', unit: 'kg' },
                                    { key: 'temperature', label: 'Temperature', ph: '98.6', unit: '°F' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{f.label} ({f.unit})</label>
                                        <input type="number" step="any" value={(formData as any)[f.key]} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 dark:text-white" placeholder={f.ph} />
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Context</label>
                                    <select value={formData.context} onChange={e => setFormData({ ...formData, context: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 dark:text-white">
                                        {['Resting', 'Walking', 'Post-meal', 'Fasting', 'Exercise', 'Morning'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                                    <input type="text" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 dark:text-white" placeholder="Optional..." />
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Remind me to update again</label>
                                <select value={formData.reminderDays || '0'} onChange={e => setFormData({ ...formData, reminderDays: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 dark:text-white">
                                    <option value="0">No reminder</option>
                                    <option value="7">After 7 days</option>
                                    <option value="14">After 14 days</option>
                                    <option value="30">After 30 days</option>
                                    <option value="90">After 3 months</option>
                                    <option value="180">After 6 months</option>
                                    <option value="365">After 1 year</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full py-3 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-teal-500/20 active:scale-[0.98]">
                                Save Entry
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HealthDashboard;
