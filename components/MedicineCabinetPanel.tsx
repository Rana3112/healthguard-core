import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bell,
    CalendarClock,
    CheckCircle2,
    Clock,
    Edit3,
    History,
    Package,
    Pause,
    Pill,
    Play,
    Plus,
    ShieldCheck,
    Trash2,
    X,
} from 'lucide-react';
import {
    cancelLocalNotifications,
    formatNotificationTime,
    scheduleMedicineLocalNotification,
} from '../src/lib/localNotifications';
import {
    deleteMedicine,
    deleteMedicineReminder,
    getActiveMember,
    getMemberMedicines,
    listTimelineEvents,
    loadHealthStore,
    recordMedicineTaken,
    setMedicineReminderEnabled,
    updateMedicineStatus,
    upsertMedicine,
    upsertMedicineReminder,
} from '../src/lib/healthStore';
import type { MedicineCabinetItem, MedicineStatus } from '../src/lib/healthStore';

type MedicineFormState = {
    id?: string;
    name: string;
    genericName: string;
    strength: string;
    form: string;
    dosage: string;
    frequency: string;
    scheduleTimes: string;
    stockCount: string;
    refillAt: string;
    instructions: string;
    prescriber: string;
    notes: string;
};

interface MedicineCabinetPanelProps {
    onOpenInteractions?: () => void;
}

const EMPTY_FORM: MedicineFormState = {
    name: '',
    genericName: '',
    strength: '',
    form: 'Tablet',
    dosage: '',
    frequency: 'Once daily',
    scheduleTimes: '08:00',
    stockCount: '',
    refillAt: '',
    instructions: '',
    prescriber: '',
    notes: '',
};

const STATUS_STYLE: Record<MedicineStatus, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/15 dark:text-emerald-400 dark:border-emerald-800/30',
    paused: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/15 dark:text-amber-400 dark:border-amber-800/30',
    completed: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

function parseTimes(value: string): string[] {
    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function formatDate(value?: string): string {
    if (!value) return 'Not set';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getStockTone(stock?: number): { label: string; className: string } {
    if (stock === undefined) return { label: 'Stock not tracked', className: 'text-slate-400' };
    if (stock <= 3) return { label: `${stock} left`, className: 'text-red-500' };
    if (stock <= 7) return { label: `${stock} left`, className: 'text-amber-500' };
    return { label: `${stock} left`, className: 'text-emerald-500' };
}

const MedicineCabinetPanel: React.FC<MedicineCabinetPanelProps> = ({ onOpenInteractions }) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<MedicineFormState>(EMPTY_FORM);
    const [statusFilter, setStatusFilter] = useState<MedicineStatus | 'all'>('active');

    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1);
        window.addEventListener('healthguard:health-store-updated', refresh);
        return () => window.removeEventListener('healthguard:health-store-updated', refresh);
    }, []);

    const store = useMemo(() => loadHealthStore(), [refreshKey]);
    const activeMember = useMemo(() => getActiveMember(store), [store]);
    const medicines = useMemo(() => getMemberMedicines(activeMember.id), [activeMember.id, refreshKey]);
    const reminders = useMemo(() => store.reminders
        .filter(item => item.memberId === activeMember.id)
        .sort((a, b) => a.time.localeCompare(b.time)), [activeMember.id, store.reminders]);
    const timeline = useMemo(() => listTimelineEvents({ memberId: activeMember.id, includeVitals: false })
        .filter(event => event.type === 'medicine' || event.type === 'reminder')
        .slice(0, 5), [activeMember.id, refreshKey]);

    const visibleMedicines = medicines.filter(item => statusFilter === 'all' || item.status === statusFilter);
    const activeCount = medicines.filter(item => item.status === 'active').length;
    const lowStockCount = medicines.filter(item => item.status === 'active' && item.stockCount !== undefined && item.stockCount <= 7).length;

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setShowForm(false);
    };

    const editMedicine = (medicine: MedicineCabinetItem) => {
        setForm({
            id: medicine.id,
            name: medicine.name,
            genericName: medicine.genericName || '',
            strength: medicine.strength || '',
            form: medicine.form || 'Tablet',
            dosage: medicine.dosage || '',
            frequency: medicine.frequency || '',
            scheduleTimes: medicine.scheduleTimes.join(', ') || '08:00',
            stockCount: medicine.stockCount !== undefined ? String(medicine.stockCount) : '',
            refillAt: medicine.refillAt || '',
            instructions: medicine.instructions || '',
            prescriber: medicine.prescriber || '',
            notes: medicine.notes || '',
        });
        setShowForm(true);
    };

    const saveMedicine = (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.name.trim()) return;

        upsertMedicine({
            id: form.id,
            memberId: activeMember.id,
            name: form.name,
            genericName: form.genericName,
            strength: form.strength,
            form: form.form,
            dosage: form.dosage,
            frequency: form.frequency,
            scheduleTimes: parseTimes(form.scheduleTimes),
            stockCount: form.stockCount ? Number(form.stockCount) : undefined,
            refillAt: form.refillAt,
            instructions: form.instructions,
            prescriber: form.prescriber,
            notes: form.notes,
            status: 'active',
            source: 'manual',
        });
        resetForm();
    };

    const markTaken = (medicine: MedicineCabinetItem) => {
        recordMedicineTaken(medicine.id);
    };

    const addReminder = async (medicine: MedicineCabinetItem) => {
        const reminder = upsertMedicineReminder({
            memberId: medicine.memberId,
            medicineId: medicine.id,
            title: `Take ${medicine.name}`,
            time: medicine.scheduleTimes[0] || '08:00',
            enabled: true,
            source: 'local',
        });
        const ids = await scheduleMedicineLocalNotification(reminder);
        if (ids.length > 0) {
            upsertMedicineReminder({ ...reminder, notificationIds: ids.map(String), source: 'local' });
        }
    };

    const toggleReminder = async (reminderId: string, enabled: boolean) => {
        const reminder = setMedicineReminderEnabled(reminderId, enabled);
        if (!reminder) return;
        if (enabled) {
            const ids = await scheduleMedicineLocalNotification(reminder);
            if (ids.length > 0) upsertMedicineReminder({ ...reminder, notificationIds: ids.map(String) });
        } else {
            await cancelLocalNotifications(reminder.notificationIds);
        }
    };

    const removeReminder = async (reminderId: string) => {
        const removed = deleteMedicineReminder(reminderId);
        await cancelLocalNotifications(removed?.notificationIds);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="h-1 bg-gradient-to-r from-teal-400 via-cyan-500 to-blue-500" />

                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2.5 mb-1.5">
                                <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                                    <Pill className="w-4 h-4 text-white" />
                                </div>
                                <h2 className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">Medicine Cabinet</h2>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Track medicines, stock, refill dates, and reminder actions for {activeMember.name}.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowForm(true)}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-teal-500/20 active:scale-[0.98]"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                    </div>
                </div>

                <div className="px-5 grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-[#1a2240] p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{activeCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-[#1a2240] p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Low Stock</p>
                        <p className={`mt-1 text-xl font-black ${lowStockCount ? 'text-amber-500' : 'text-slate-800 dark:text-white'}`}>{lowStockCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-[#1a2240] p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reminders</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{reminders.length}</p>
                    </div>
                </div>

                <div className="px-5 mb-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 text-[11px] font-bold">
                        {(['active', 'all', 'paused', 'completed'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`flex-1 rounded-lg py-1.5 capitalize transition-all ${statusFilter === status
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {showForm && (
                    <form onSubmit={saveMedicine} className="mx-5 mb-4 rounded-xl border border-teal-100 dark:border-teal-800/30 bg-white dark:bg-[#1a2240] p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-extrabold text-slate-700 dark:text-white">{form.id ? 'Edit medicine' : 'Add medicine'}</h3>
                            <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-red-400">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Medicine name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <div className="grid grid-cols-2 gap-2">
                                <input value={form.strength} onChange={e => setForm(prev => ({ ...prev, strength: e.target.value }))} placeholder="Strength, e.g. 650 mg" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                                <input value={form.form} onChange={e => setForm(prev => ({ ...prev, form: e.target.value }))} placeholder="Form" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={form.dosage} onChange={e => setForm(prev => ({ ...prev, dosage: e.target.value }))} placeholder="Dose, e.g. 1 tablet" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                                <input value={form.frequency} onChange={e => setForm(prev => ({ ...prev, frequency: e.target.value }))} placeholder="Frequency" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </div>
                            <input value={form.scheduleTimes} onChange={e => setForm(prev => ({ ...prev, scheduleTimes: e.target.value }))} placeholder="Times, comma-separated: 08:00, 20:00" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" min="0" value={form.stockCount} onChange={e => setForm(prev => ({ ...prev, stockCount: e.target.value }))} placeholder="Stock count" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                                <input type="date" value={form.refillAt} onChange={e => setForm(prev => ({ ...prev, refillAt: e.target.value }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </div>
                            <textarea value={form.instructions} onChange={e => setForm(prev => ({ ...prev, instructions: e.target.value }))} placeholder="Instructions, food timing, doctor notes" rows={2} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        </div>
                        <button type="submit" disabled={!form.name.trim()} className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                            {form.id ? 'Save Changes' : 'Add Medicine'}
                        </button>
                    </form>
                )}

                <div className="px-5 space-y-3 pb-4">
                    {visibleMedicines.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2240] px-4 py-8 text-center">
                            <Pill className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No medicines here yet</p>
                            <p className="mt-1 text-xs text-slate-400">Add your regular medicines to track dosage, stock, and reminders.</p>
                        </div>
                    ) : visibleMedicines.map(medicine => {
                        const stockTone = getStockTone(medicine.stockCount);
                        return (
                            <div key={medicine.id} className="rounded-xl border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-[#1a2240] p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="break-words text-sm font-extrabold text-slate-800 dark:text-white">{medicine.name}</h3>
                                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold capitalize ${STATUS_STYLE[medicine.status]}`}>
                                                {medicine.status}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-slate-400">
                                            {[medicine.strength, medicine.dosage, medicine.frequency].filter(Boolean).join(' | ') || 'Dose details not added'}
                                        </p>
                                    </div>
                                    <button onClick={() => editMedicine(medicine)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-teal-500 dark:hover:bg-slate-800">
                                        <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-2 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                        <Clock className="h-3.5 w-3.5 text-teal-500" />
                                        <span className="truncate">{medicine.scheduleTimes.join(', ') || 'No time'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
                                        <Package className="h-3.5 w-3.5 text-blue-500" />
                                        <span className={`truncate font-bold ${stockTone.className}`}>{stockTone.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-2 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                        <CalendarClock className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="truncate">Refill {formatDate(medicine.refillAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-2 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                        <Bell className="h-3.5 w-3.5 text-violet-500" />
                                        <span className="truncate">{reminders.some(item => item.medicineId === medicine.id) ? 'Reminder on' : 'No reminder'}</span>
                                    </div>
                                </div>

                                {medicine.instructions && (
                                    <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-[11px] leading-relaxed text-teal-700 dark:bg-teal-900/15 dark:text-teal-300">
                                        {medicine.instructions}
                                    </p>
                                )}

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button onClick={() => markTaken(medicine)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/15 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Taken
                                    </button>
                                    <button onClick={() => addReminder(medicine)} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold text-violet-600 dark:bg-violet-900/15 dark:text-violet-400">
                                        <Bell className="h-3.5 w-3.5" /> Reminder
                                    </button>
                                    <button onClick={onOpenInteractions} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        <ShieldCheck className="h-3.5 w-3.5" /> Interactions
                                    </button>
                                    {medicine.status === 'active' ? (
                                        <button onClick={() => updateMedicineStatus(medicine.id, 'paused')} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/15 dark:text-amber-400">
                                            <Pause className="h-3.5 w-3.5" /> Pause
                                        </button>
                                    ) : (
                                        <button onClick={() => updateMedicineStatus(medicine.id, 'active')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/15 dark:text-emerald-400">
                                            <Play className="h-3.5 w-3.5" /> Resume
                                        </button>
                                    )}
                                    <button onClick={() => updateMedicineStatus(medicine.id, 'completed')} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                                    </button>
                                    <button onClick={() => deleteMedicine(medicine.id)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-500 dark:bg-red-900/15 dark:text-red-400">
                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {reminders.length > 0 && (
                    <div className="px-5 pb-4">
                        <div className="mb-2 flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-violet-500" />
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Offline Medicine Reminders</h3>
                        </div>
                        <div className="space-y-2">
                            {reminders.map(reminder => (
                                <div key={reminder.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                                    <button
                                        onClick={() => toggleReminder(reminder.id, !reminder.enabled)}
                                        className={`h-5 w-5 shrink-0 rounded-md border-2 ${reminder.enabled ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-slate-600'}`}
                                        title={reminder.enabled ? 'Pause reminder' : 'Resume reminder'}
                                    >
                                        {reminder.enabled && <CheckCircle2 className="h-4 w-4 text-white" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{reminder.title}</p>
                                        <p className="text-[10px] text-slate-400">{formatNotificationTime(reminder.time)} | Android local notification</p>
                                    </div>
                                    <button onClick={() => removeReminder(reminder.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {timeline.length > 0 && (
                    <div className="px-5 pb-6">
                        <div className="mb-2 flex items-center gap-1.5">
                            <History className="h-3.5 w-3.5 text-slate-400" />
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Cabinet Timeline</h3>
                        </div>
                        <div className="space-y-2">
                            {timeline.map(event => (
                                <div key={event.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs dark:border-slate-700/50 dark:bg-[#1a2240]">
                                    <div className="flex items-start gap-2">
                                        {event.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500" /> : <Pill className="mt-0.5 h-3.5 w-3.5 text-teal-500" />}
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-700 dark:text-slate-200">{event.title}</p>
                                            {event.description && <p className="mt-0.5 text-[10px] text-slate-400">{event.description}</p>}
                                        </div>
                                        <span className="ml-auto shrink-0 text-[9px] text-slate-300">
                                            {new Date(event.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MedicineCabinetPanel;
