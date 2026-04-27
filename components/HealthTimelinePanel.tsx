import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Bell,
    FileText,
    History,
    MapPin,
    NotebookPen,
    Pill,
    Plus,
    Search,
    Stethoscope,
} from 'lucide-react';
import {
    addTimelineEvent,
    getActiveMember,
    listTimelineEvents,
    loadHealthStore,
} from '../src/lib/healthStore';
import type { HealthEventType, HealthTimelineEvent } from '../src/lib/healthStore';

type TimelineFilter = 'all' | HealthEventType;

const FILTERS: Array<{ key: TimelineFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'medicine', label: 'Meds' },
    { key: 'reminder', label: 'Reminders' },
    { key: 'vitals', label: 'Vitals' },
    { key: 'report', label: 'Reports' },
    { key: 'location', label: 'Places' },
    { key: 'visit_prep', label: 'Visits' },
];

function getEventIcon(type: HealthEventType, severity: string) {
    if (severity === 'warning' || severity === 'critical') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    switch (type) {
        case 'medicine':
            return <Pill className="h-4 w-4 text-teal-500" />;
        case 'reminder':
            return <Bell className="h-4 w-4 text-violet-500" />;
        case 'vitals':
            return <Activity className="h-4 w-4 text-rose-500" />;
        case 'report':
            return <FileText className="h-4 w-4 text-blue-500" />;
        case 'location':
            return <MapPin className="h-4 w-4 text-emerald-500" />;
        case 'visit_prep':
            return <Stethoscope className="h-4 w-4 text-indigo-500" />;
        default:
            return <NotebookPen className="h-4 w-4 text-slate-400" />;
    }
}

function getEventTone(event: HealthTimelineEvent): string {
    if (event.severity === 'critical') return 'border-red-200 bg-red-50 dark:border-red-800/30 dark:bg-red-900/10';
    if (event.severity === 'warning') return 'border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-900/10';
    return 'border-slate-100 bg-white dark:border-slate-700/50 dark:bg-[#1a2240]';
}

function formatEventTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

const HealthTimelinePanel: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [filter, setFilter] = useState<TimelineFilter>('all');
    const [query, setQuery] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1);
        window.addEventListener('healthguard:health-store-updated', refresh);
        return () => window.removeEventListener('healthguard:health-store-updated', refresh);
    }, []);

    const store = useMemo(() => loadHealthStore(), [refreshKey]);
    const activeMember = useMemo(() => getActiveMember(store), [store]);
    const events = useMemo(() => listTimelineEvents({ memberId: activeMember.id }), [activeMember.id, refreshKey]);

    const visibleEvents = useMemo(() => {
        const search = query.trim().toLowerCase();
        return events
            .filter(event => filter === 'all' || event.type === filter)
            .filter(event => {
                if (!search) return true;
                return `${event.title} ${event.description || ''} ${event.type}`.toLowerCase().includes(search);
            });
    }, [events, filter, query]);

    const todayCount = events.filter(event => new Date(event.timestamp).toDateString() === new Date().toDateString()).length;
    const warningCount = events.filter(event => event.severity === 'warning' || event.severity === 'critical').length;
    const medicineCount = events.filter(event => event.type === 'medicine').length;

    const saveNote = (event: React.FormEvent) => {
        event.preventDefault();
        if (!note.trim()) return;
        addTimelineEvent({
            memberId: activeMember.id,
            type: 'note',
            title: 'Health note',
            description: note.trim(),
            severity: 'info',
            source: 'timeline',
        });
        setNote('');
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="h-1 bg-gradient-to-r from-blue-400 via-teal-500 to-emerald-500" />

                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                            <History className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">Health Timeline</h2>
                            <p className="text-xs text-slate-400">Memory for {activeMember.name}</p>
                        </div>
                    </div>
                </div>

                <div className="px-5 grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Today</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{todayCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Warnings</p>
                        <p className={`mt-1 text-xl font-black ${warningCount ? 'text-amber-500' : 'text-slate-800 dark:text-white'}`}>{warningCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Med Log</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{medicineCount}</p>
                    </div>
                </div>

                <form onSubmit={saveNote} className="mx-5 mb-4 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                    <div className="flex items-center gap-2">
                        <NotebookPen className="h-4 w-4 text-teal-500" />
                        <input
                            value={note}
                            onChange={event => setNote(event.target.value)}
                            placeholder="Add a quick health note"
                            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600"
                        />
                        <button disabled={!note.trim()} className="rounded-lg bg-teal-600 p-2 text-white disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </form>

                <div className="px-5 mb-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search timeline"
                            className="w-full rounded-xl border border-slate-100 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-teal-300 dark:border-slate-700 dark:bg-[#1a2240] dark:text-white"
                        />
                    </div>
                </div>

                <div className="px-5 mb-4">
                    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-[11px] font-bold dark:bg-slate-800/60">
                        {FILTERS.map(item => (
                            <button
                                key={item.key}
                                onClick={() => setFilter(item.key)}
                                className={`min-w-[72px] rounded-lg py-1.5 transition-all ${filter === item.key
                                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-5 pb-6">
                    {visibleEvents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-[#1a2240]">
                            <History className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No timeline events yet</p>
                            <p className="mt-1 text-xs text-slate-400">Vitals, medicines, reports, and notes will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {visibleEvents.map(event => (
                                <div key={event.id} className={`rounded-xl border p-4 shadow-sm ${getEventTone(event)}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800/70">
                                            {getEventIcon(event.type, event.severity)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="break-words text-sm font-extrabold text-slate-800 dark:text-white">{event.title}</h3>
                                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold capitalize text-slate-400 dark:bg-slate-800">
                                                    {event.type.replace('_', ' ')}
                                                </span>
                                            </div>
                                            {event.description && <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{event.description}</p>}
                                            <p className="mt-2 text-[10px] font-medium text-slate-300">{formatEventTime(event.timestamp)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HealthTimelinePanel;
