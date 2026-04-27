import React, { useEffect, useMemo, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
    AlertTriangle,
    CheckCircle2,
    FileSearch,
    FileText,
    Loader2,
    Pill,
    Plus,
    Upload,
} from 'lucide-react';
import { getGeminiApiKey } from '../src/lib/apiKeys';
import {
    getActiveMember,
    getMemberReports,
    loadHealthStore,
    upsertMedicine,
    upsertReport,
} from '../src/lib/healthStore';
import type { HealthReportRecord } from '../src/lib/healthStore';

type ExtractedReport = {
    title?: string;
    report_type?: string;
    captured_at?: string;
    patient_name?: string;
    summary?: string;
    confidence?: 'low' | 'medium' | 'high';
    extracted_text?: string;
    values?: Array<{
        name: string;
        value: string;
        unit?: string;
        range?: string;
        status?: 'low' | 'normal' | 'high' | 'critical' | 'unknown';
    }>;
    medicines?: Array<{
        name: string;
        strength?: string;
        dosage?: string;
        frequency?: string;
        instructions?: string;
    }>;
};

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const value = String(reader.result || '');
            resolve(value.includes(',') ? value.split(',')[1] : value);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function extractJson(text: string): ExtractedReport {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) throw new Error('The model did not return structured JSON.');
    return JSON.parse(objectMatch[0]);
}

function statusClass(status?: string): string {
    if (status === 'critical') return 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/15 dark:text-red-400 dark:border-red-800/30';
    if (status === 'high' || status === 'low') return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/15 dark:text-amber-400 dark:border-amber-800/30';
    if (status === 'normal') return 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/15 dark:text-emerald-400 dark:border-emerald-800/30';
    return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
}

const REPORT_PROMPT = `You are HealthGuard's medical report scanner.
Extract the attached report/prescription into strict JSON only. Do not use markdown.
Return this shape:
{
  "title": "short report title",
  "report_type": "lab_report|prescription|discharge_summary|imaging|other",
  "captured_at": "ISO date if visible, otherwise empty string",
  "patient_name": "name if visible, otherwise empty string",
  "summary": "plain language summary with abnormal findings and next steps",
  "confidence": "low|medium|high",
  "extracted_text": "important raw text from the report",
  "values": [
    {"name":"HbA1c","value":"7.2","unit":"%","range":"<5.7","status":"high|low|normal|critical|unknown"}
  ],
  "medicines": [
    {"name":"medicine name","strength":"strength","dosage":"dose","frequency":"frequency","instructions":"instructions"}
  ]
}
Rules:
- Preserve units and reference ranges exactly if visible.
- Mark values abnormal only when the report indicates it or the range clearly proves it.
- If uncertain, use status "unknown" and confidence "low".
- Include a warning in summary to verify against the original report.`;

const ReportScannerPanel: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastReport, setLastReport] = useState<HealthReportRecord | null>(null);
    const [detectedMedicines, setDetectedMedicines] = useState<ExtractedReport['medicines']>([]);

    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1);
        window.addEventListener('healthguard:health-store-updated', refresh);
        return () => window.removeEventListener('healthguard:health-store-updated', refresh);
    }, []);

    useEffect(() => {
        if (!file || !file.type.startsWith('image/')) {
            setPreviewUrl('');
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const store = useMemo(() => loadHealthStore(), [refreshKey]);
    const activeMember = useMemo(() => getActiveMember(store), [store]);
    const reports = useMemo(() => getMemberReports(activeMember.id), [activeMember.id, refreshKey]);

    const analyzeReport = async () => {
        if (!file) return;
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            setError('Gemini API key is missing. Add VITE_GEMINI_API_KEY before scanning reports.');
            return;
        }

        setLoading(true);
        setError('');
        setLastReport(null);
        setDetectedMedicines([]);

        try {
            const ai = new GoogleGenAI({ apiKey });
            const base64 = await fileToBase64(file);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: file.type || 'image/jpeg', data: base64 } },
                        { text: REPORT_PROMPT },
                    ],
                }],
            });

            const parsed = extractJson(response.text || '');
            const capturedTime = parsed.captured_at ? new Date(parsed.captured_at).getTime() : Date.now();
            const report = upsertReport({
                memberId: activeMember.id,
                title: parsed.title || file.name || 'Medical report',
                reportType: parsed.report_type,
                capturedAt: Number.isFinite(capturedTime) ? capturedTime : Date.now(),
                sourceFileName: file.name,
                extractedText: parsed.extracted_text,
                extractedValues: parsed.values || [],
                summary: parsed.summary || 'Report scanned. Verify extracted details against the original report.',
                confidence: parsed.confidence || 'medium',
            });
            setLastReport(report);
            setDetectedMedicines(parsed.medicines || []);
        } catch (err: any) {
            console.error('[Report Scanner] Failed:', err);
            setError(err.message || 'Failed to scan the report. Try a clearer image.');
        } finally {
            setLoading(false);
        }
    };

    const addDetectedMedicines = () => {
        detectedMedicines?.forEach(med => {
            if (!med.name?.trim()) return;
            upsertMedicine({
                memberId: activeMember.id,
                name: med.name,
                strength: med.strength,
                dosage: med.dosage,
                frequency: med.frequency,
                instructions: med.instructions,
                source: 'report',
                status: 'active',
            });
        });
        setDetectedMedicines([]);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <div className="h-1 bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500" />

                <div className="px-5 pt-5 pb-3">
                    <div className="mb-2 flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
                            <FileSearch className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white">Report Scanner</h2>
                            <p className="text-xs text-slate-400">Scan reports for {activeMember.name}</p>
                        </div>
                    </div>
                </div>

                <div className="mx-5 mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/50 dark:bg-[#1a2240]">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
                        <Upload className="mb-2 h-6 w-6 text-blue-500" />
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{file ? file.name : 'Upload report image or PDF'}</p>
                        <p className="mt-1 text-xs text-slate-400">Lab reports, prescriptions, discharge summaries</p>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={event => setFile(event.target.files?.[0] || null)}
                        />
                    </label>

                    {previewUrl && <img src={previewUrl} alt="Report preview" className="mt-3 max-h-48 w-full rounded-xl object-contain bg-slate-100 dark:bg-slate-900" />}

                    <button onClick={analyzeReport} disabled={!file || loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                        {loading ? 'Scanning report...' : 'Scan and Save Report'}
                    </button>

                    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-500 dark:bg-red-900/15">{error}</p>}
                </div>

                {lastReport && (
                    <div className="mx-5 mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-800/30 dark:bg-emerald-900/10">
                        <div className="mb-2 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <p className="text-sm font-extrabold text-slate-800 dark:text-white">{lastReport.title}</p>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{lastReport.summary}</p>
                    </div>
                )}

                {detectedMedicines && detectedMedicines.length > 0 && (
                    <div className="mx-5 mb-4 rounded-xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-800/30 dark:bg-[#1a2240]">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Pill className="h-4 w-4 text-violet-500" />
                                <p className="text-xs font-extrabold text-slate-700 dark:text-white">Detected Medicines</p>
                            </div>
                            <button onClick={addDetectedMedicines} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold text-white">
                                <Plus className="h-3.5 w-3.5" /> Add all
                            </button>
                        </div>
                        <div className="space-y-2">
                            {detectedMedicines.map((med, index) => (
                                <div key={`${med.name}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                                    <p className="font-bold text-slate-700 dark:text-slate-200">{med.name}</p>
                                    <p className="text-[10px] text-slate-400">{[med.strength, med.dosage, med.frequency].filter(Boolean).join(' | ') || 'Details not visible'}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="px-5 pb-6">
                    <div className="mb-2 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Saved Reports</h3>
                    </div>
                    {reports.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-[#1a2240]">
                            <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No reports scanned yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {reports.map(report => (
                                <div key={report.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/50 dark:bg-[#1a2240]">
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-extrabold text-slate-800 dark:text-white">{report.title}</p>
                                            <p className="text-[10px] text-slate-400">{report.reportType || 'Report'} | {report.confidence || 'medium'} confidence</p>
                                        </div>
                                        {report.extractedValues?.some(value => value.status === 'critical' || value.status === 'high' || value.status === 'low') && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                    </div>
                                    {report.summary && <p className="mb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{report.summary}</p>}
                                    {report.extractedValues && report.extractedValues.length > 0 && (
                                        <div className="space-y-1.5">
                                            {report.extractedValues.slice(0, 8).map((value, index) => (
                                                <div key={`${value.name}-${index}`} className="grid grid-cols-[minmax(0,1fr),auto] gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] dark:bg-slate-800/60">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-slate-700 dark:text-slate-200">{value.name}</p>
                                                        <p className="truncate text-slate-400">{value.range || 'No range'}</p>
                                                    </div>
                                                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusClass(value.status)}`}>
                                                        {value.value}{value.unit ? ` ${value.unit}` : ''} | {value.status || 'unknown'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportScannerPanel;
