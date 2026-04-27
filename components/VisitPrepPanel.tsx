import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarClock, Download, FileText, Loader2, Stethoscope, Wand2 } from 'lucide-react';
import { MessageRole } from '../types';
import { sendMessageToOpenRouter } from '../services/openRouterService';
import {
    buildVisitPrepContext,
    getActiveMember,
    getMemberMedicines,
    getMemberReports,
    getMemberVisitPreps,
    listTimelineEvents,
    loadHealthStore,
    upsertVisitPrep,
} from '../src/lib/healthStore';
import type { VisitPrepRecord } from '../src/lib/healthStore';

function makeDefaultQuestions(reason: string): string[] {
    return [
        `What is the most likely cause of ${reason || 'my current concern'}?`,
        'Do any current medicines need dose changes or monitoring?',
        'Which symptoms should make me seek urgent care?',
        'Are any tests or follow-up reports needed?',
        'What lifestyle changes should I follow until the next visit?',
    ];
}

function makeDefaultRedFlags(): string[] {
    return [
        'Chest pain, severe breathlessness, fainting, confusion, or weakness on one side.',
        'High fever that does not improve, severe dehydration, or worsening symptoms.',
        'Severe allergic reaction, swelling of lips/face, or difficulty breathing.',
    ];
}

function stripMarkdown(value: string): string {
    return value
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/>>.*$/gm, '')
        .trim();
}

function createPdf(prep: VisitPrepRecord, context: string): void {
    const doc = new jsPDF();
    const margin = 14;
    const width = doc.internal.pageSize.getWidth() - margin * 2;

    doc.setFontSize(18);
    doc.setTextColor(13, 148, 136);
    doc.text('HealthGuard Visit Prep', margin, 18);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(new Date(prep.generatedAt).toLocaleString('en-IN'), margin, 25);

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(prep.title, margin, 36);

    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`Reason: ${prep.visitReason}`, margin, 43);
    if (prep.doctorOrSpecialty) doc.text(`Doctor/Specialty: ${prep.doctorOrSpecialty}`, margin, 49);

    doc.setFontSize(11);
    doc.setTextColor(30);
    const summaryLines = doc.splitTextToSize(stripMarkdown(prep.summary), width);
    doc.text(summaryLines, margin, 60);

    let cursorY = 66 + summaryLines.length * 5;
    if (prep.questions?.length) {
        autoTable(doc, {
            startY: cursorY,
            head: [['Questions to ask']],
            body: prep.questions.map(item => [item]),
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [13, 148, 136] },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 8;
    }

    if (prep.redFlags?.length) {
        autoTable(doc, {
            startY: cursorY,
            head: [['Red flags to mention urgently']],
            body: prep.redFlags.map(item => [item]),
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [225, 29, 72] },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 8;
    }

    if (cursorY > 250) {
        doc.addPage();
        cursorY = 18;
    }

    doc.setFontSize(12);
    doc.setTextColor(13, 148, 136);
    doc.text('Source Context', margin, cursorY);
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(doc.splitTextToSize(context.slice(0, 3500), width), margin, cursorY + 7);

    doc.save(prep.pdfName || 'healthguard_visit_prep.pdf');
}

const VisitPrepPanel: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [visitReason, setVisitReason] = useState('');
    const [doctor, setDoctor] = useState('');
    const [days, setDays] = useState('30');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [latestPrep, setLatestPrep] = useState<VisitPrepRecord | null>(null);
    const [latestContext, setLatestContext] = useState('');

    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1);
        window.addEventListener('healthguard:health-store-updated', refresh);
        return () => window.removeEventListener('healthguard:health-store-updated', refresh);
    }, []);

    const store = useMemo(() => loadHealthStore(), [refreshKey]);
    const activeMember = useMemo(() => getActiveMember(store), [store]);
    const medicines = useMemo(() => getMemberMedicines(activeMember.id).filter(item => item.status === 'active'), [activeMember.id, refreshKey]);
    const reports = useMemo(() => getMemberReports(activeMember.id), [activeMember.id, refreshKey]);
    const timeline = useMemo(() => listTimelineEvents({ memberId: activeMember.id }).slice(0, 10), [activeMember.id, refreshKey]);
    const preps = useMemo(() => getMemberVisitPreps(activeMember.id), [activeMember.id, refreshKey]);

    const generatePrep = async () => {
        if (!visitReason.trim()) {
            setError('Enter the reason for the visit first.');
            return;
        }

        setLoading(true);
        setError('');
        const context = buildVisitPrepContext(activeMember.id, Number(days) || 30);
        setLatestContext(context);

        const questions = makeDefaultQuestions(visitReason);
        const redFlags = makeDefaultRedFlags();
        let summary = `Visit reason: ${visitReason}\n\n${context}\n\nFocus this visit on symptom changes, current medicines, abnormal reports, and clear follow-up steps.`;

        try {
            const response = await sendMessageToOpenRouter(
                [{ id: 'visit_context', role: MessageRole.USER, text: context }],
                `Create a concise doctor visit prep note for this visit reason: ${visitReason}. Doctor/specialty: ${doctor || 'not specified'}. Include key history, medicine concerns, report/vital highlights, and practical questions. Do not diagnose. Use the provided context only.`,
                'You are a medical visit-prep assistant. Create a careful, factual summary for a doctor appointment. Never invent data. Flag uncertainty.',
                'openai/gpt-oss-120b'
            );
            summary = response.text || summary;
        } catch (err) {
            console.warn('[Visit Prep] AI unavailable, using deterministic summary:', err);
        }

        const filename = `healthguard_visit_prep_${new Date().toISOString().slice(0, 10)}.pdf`;
        const saved = upsertVisitPrep({
            memberId: activeMember.id,
            title: `${activeMember.name} visit prep`,
            visitReason,
            doctorOrSpecialty: doctor,
            generatedAt: Date.now(),
            summary,
            questions,
            redFlags,
            sourceEventIds: timeline.map(item => item.id),
            pdfName: filename,
        });
        setLatestPrep(saved);
        setLoading(false);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-500" />

                <div className="px-5 pt-5 pb-3">
                    <div className="mb-2 flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20">
                            <Stethoscope className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Visit Prep PDF</h2>
                            <p className="text-xs text-slate-400">Generate a doctor-ready summary for {activeMember.name}</p>
                        </div>
                    </div>
                </div>

                <div className="mx-5 mb-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Meds</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{medicines.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reports</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{reports.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700/50 dark:bg-[#1a2240]">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Events</p>
                        <p className="mt-1 text-xl font-black text-slate-800 dark:text-white">{timeline.length}</p>
                    </div>
                </div>

                <div className="mx-5 mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/50 dark:bg-[#1a2240]">
                    <div className="space-y-2">
                        <textarea
                            value={visitReason}
                            onChange={event => setVisitReason(event.target.value)}
                            rows={3}
                            placeholder="Reason for visit, symptoms, or concern"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                value={doctor}
                                onChange={event => setDoctor(event.target.value)}
                                placeholder="Doctor or specialty"
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                            <select value={days} onChange={event => setDays(event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                                <option value="365">Last year</option>
                            </select>
                        </div>
                    </div>

                    <button onClick={generatePrep} disabled={loading || !visitReason.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-50">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        {loading ? 'Preparing summary...' : 'Generate Visit Prep'}
                    </button>
                    {error && <p className="mt-2 text-xs font-medium text-red-500">{error}</p>}
                </div>

                {latestPrep && (
                    <div className="mx-5 mb-4 rounded-xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-800/30 dark:bg-[#1a2240]">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-extrabold text-slate-800 dark:text-white">{latestPrep.title}</p>
                                <p className="text-[10px] text-slate-400">{latestPrep.doctorOrSpecialty || 'Doctor visit'} | {new Date(latestPrep.generatedAt).toLocaleDateString('en-IN')}</p>
                            </div>
                            <button onClick={() => createPdf(latestPrep, latestContext)} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-bold text-white">
                                <Download className="h-3.5 w-3.5" /> PDF
                            </button>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">{stripMarkdown(latestPrep.summary)}</p>
                    </div>
                )}

                <div className="px-5 pb-6">
                    <div className="mb-2 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Previous Visit Prep</h3>
                    </div>
                    {preps.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-[#1a2240]">
                            <CalendarClock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No visit prep generated yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {preps.map(prep => (
                                <button key={prep.id} onClick={() => { setLatestPrep(prep); setLatestContext(buildVisitPrepContext(activeMember.id, Number(days) || 30)); }} className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm dark:border-slate-700/50 dark:bg-[#1a2240]">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{prep.title}</p>
                                    <p className="mt-0.5 text-[10px] text-slate-400">{prep.visitReason} | {new Date(prep.generatedAt).toLocaleDateString('en-IN')}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisitPrepPanel;
