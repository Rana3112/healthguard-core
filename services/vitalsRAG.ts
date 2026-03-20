/**
 * VitalsRAG Service
 * 
 * Implements a lightweight client-side RAG (Retrieval-Augmented Generation) system
 * for user health vitals. Reads vitals from localStorage, analyzes trends, identifies
 * abnormal values, and generates a structured context string that gets injected into
 * every AI model's system prompt.
 * 
 * This ensures all models (fast, standard, thinking, deep, max, agent, vision,
 * fitness coach) are aware of the user's health condition before responding.
 */

const STORAGE_KEY = 'healthguard_vitals';

export interface VitalEntry {
    date: string;
    timestamp: number;
    bp_systolic?: number;
    bp_diastolic?: number;
    blood_sugar?: number;
    weight?: number;
    temperature?: number;
    heart_rate?: number;
    notes?: string;
    context?: string;
}

interface VitalStatus {
    label: string;
    severity: 'normal' | 'low' | 'elevated' | 'high';
}

interface TrendResult {
    direction: 'improving' | 'worsening' | 'stable' | 'insufficient_data';
    changePercent: number;
    values: number[];
}

const VITAL_RANGES: Record<string, { low: number; high: number; veryHigh: number; unit: string; label: string }> = {
    bp_systolic: { low: 90, high: 140, veryHigh: 180, unit: 'mmHg', label: 'Blood Pressure (Systolic)' },
    bp_diastolic: { low: 60, high: 90, veryHigh: 120, unit: 'mmHg', label: 'Blood Pressure (Diastolic)' },
    blood_sugar: { low: 70, high: 140, veryHigh: 200, unit: 'mg/dL', label: 'Blood Sugar' },
    weight: { low: 30, high: 200, veryHigh: 300, unit: 'kg', label: 'Weight' },
    temperature: { low: 97.0, high: 99.5, veryHigh: 103.0, unit: '\u00b0F', label: 'Temperature' },
    heart_rate: { low: 60, high: 100, veryHigh: 150, unit: 'bpm', label: 'Heart Rate' },
};

function getVitalStatus(key: string, value: number): VitalStatus {
    const range = VITAL_RANGES[key];
    if (!range) return { label: 'Unknown', severity: 'normal' };
    if (value < range.low) return { label: 'Low', severity: 'low' };
    if (value > range.veryHigh) return { label: 'Critically High', severity: 'high' };
    if (value > range.high) return { label: 'Elevated', severity: 'elevated' };
    return { label: 'Normal', severity: 'normal' };
}

function analyzeTrend(values: number[]): TrendResult {
    if (values.length < 2) return { direction: 'insufficient_data', changePercent: 0, values };
    const first = values[0];
    const last = values[values.length - 1];
    if (first === 0) return { direction: 'stable', changePercent: 0, values };
    const changePercent = ((last - first) / first) * 100;
    if (Math.abs(changePercent) < 5) return { direction: 'stable', changePercent, values };
    return {
        direction: changePercent > 0 ? 'worsening' : 'improving',
        changePercent: Math.round(changePercent * 10) / 10,
        values,
    };
}

function readVitals(): VitalEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function getEntriesInRange(entries: VitalEntry[], rangeDays: number): VitalEntry[] {
    const cutoff = Date.now() - rangeDays * 86400000;
    return entries.filter(e => e.timestamp >= cutoff);
}

function getLatestValue(entries: VitalEntry[], key: string): number | null {
    for (const e of entries) {
        const v = (e as any)[key];
        if (v != null) return v as number;
    }
    return null;
}

function getValuesOverTime(entries: VitalEntry[], key: string): number[] {
    return entries.filter(e => (e as any)[key] != null).map(e => (e as any)[key] as number).reverse();
}

/**
 * Retrieves vitals from localStorage and builds a structured context string
 * for injection into AI model system prompts.
 */
export function retrieveVitalsContext(): string {
    const allEntries = readVitals();
    if (allEntries.length === 0) return '';

    const latest = allEntries[0];
    const last7d = getEntriesInRange(allEntries, 7);
    const last30d = getEntriesInRange(allEntries, 30);

    const lines: string[] = [];
    lines.push('## PATIENT HEALTH VITALS (Retrieved from RAG Memory)');
    lines.push(`Total records logged: ${allEntries.length}`);
    lines.push(`Latest reading: ${new Date(latest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`);
    lines.push('');

    // --- Latest Values ---
    lines.push('### Latest Vital Signs:');
    const vitalKeys = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'blood_sugar', 'temperature', 'weight'];
    let hasAbnormal = false;
    const abnormalNotes: string[] = [];

    for (const key of vitalKeys) {
        const val = getLatestValue(allEntries, key);
        if (val != null) {
            const range = VITAL_RANGES[key];
            const status = getVitalStatus(key, val);
            const statusIcon = status.severity === 'normal' ? '\u2705' :
                status.severity === 'low' ? '\ud83d\udfe1' :
                    status.severity === 'elevated' ? '\ud83d\udfe0' : '\ud83d\udd34';
            lines.push(`- ${statusIcon} ${range?.label || key}: **${val} ${range?.unit || ''}** (${status.label})`);

            if (status.severity !== 'normal') {
                hasAbnormal = true;
                abnormalNotes.push(`${range?.label || key} is ${status.label.toLowerCase()} (${val} ${range?.unit})`);
            }
        }
    }

    if (latest.context) lines.push(`- Context during reading: ${latest.context}`);
    if (latest.notes) lines.push(`- Patient notes: "${latest.notes}"`);
    lines.push('');

    // --- Trend Analysis ---
    lines.push('### Trend Analysis (7-day window):');
    for (const key of vitalKeys) {
        const vals = getValuesOverTime(last7d, key);
        if (vals.length >= 2) {
            const trend = analyzeTrend(vals);
            const range = VITAL_RANGES[key];
            const arrow = trend.direction === 'improving' ? '\u2b06\ufe0f' :
                trend.direction === 'worsening' ? '\u2b07\ufe0f' : '\u2796';
            lines.push(`- ${arrow} ${range?.label || key}: ${trend.direction} (${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}% over ${vals.length} readings)`);
        }
    }
    lines.push('');

    // --- Abnormal Flags ---
    if (hasAbnormal) {
        lines.push('### \u26a0\ufe0f Abnormal Readings Detected:');
        abnormalNotes.forEach(n => lines.push(`- ${n}`));
        lines.push('IMPORTANT: When the user asks about health concerns, always consider these abnormal readings and their implications.');
        lines.push('');
    }

    // --- 30-day Summary ---
    if (last30d.length > last7d.length) {
        lines.push('### 30-day Summary:');
        lines.push(`- Records in last 30 days: ${last30d.length}`);
        for (const key of vitalKeys) {
            const vals = getValuesOverTime(last30d, key);
            if (vals.length >= 2) {
                const range = VITAL_RANGES[key];
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
                lines.push(`- ${range?.label}: Min ${min} | Avg ${avg} | Max ${max} (${vals.length} readings)`);
            }
        }
        lines.push('');
    }

    // --- Context Notes History ---
    const notesEntries = allEntries.filter(e => e.notes).slice(0, 5);
    if (notesEntries.length > 0) {
        lines.push('### Recent Patient Notes:');
        notesEntries.forEach(e => {
            const d = new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            lines.push(`- [${d}]: "${e.notes}"`);
        });
        lines.push('');
    }

    lines.push('---');
    lines.push('Use this health data to personalize your responses. Reference specific vitals when relevant.');
    lines.push('If the user asks about symptoms, correlate with their vital trends.');
    lines.push('For diet/exercise advice, factor in their current health metrics.');
    lines.push('Always be empathetic about abnormal readings and suggest consulting a doctor for critical values.');

    return lines.join('\n');
}

/**
 * Lightweight version for token-efficient injection.
 * Returns only the most critical info when full context is too large.
 */
export function retrieveVitalsContextLite(): string {
    const allEntries = readVitals();
    if (allEntries.length === 0) return '';

    const latest = allEntries[0];
    const lines: string[] = [];
    lines.push('## PATIENT VITALS SUMMARY:');
    lines.push(`Last updated: ${new Date(latest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);

    const vitalKeys = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'blood_sugar', 'temperature', 'weight'];
    const abnormalParts: string[] = [];

    for (const key of vitalKeys) {
        const val = getLatestValue(allEntries, key);
        if (val != null) {
            const range = VITAL_RANGES[key];
            const status = getVitalStatus(key, val);
            lines.push(`- ${range?.label}: ${val} ${range?.unit} (${status.label})`);
            if (status.severity !== 'normal') {
                abnormalParts.push(`${range?.label} is ${status.label.toLowerCase()}`);
            }
        }
    }

    if (latest.notes) lines.push(`- Notes: "${latest.notes}"`);

    if (abnormalParts.length > 0) {
        lines.push(`\u26a0\ufe0f Abnormal: ${abnormalParts.join(', ')}`);
    }

    lines.push('Reference these vitals in your response when relevant.');
    return lines.join('\n');
}

/**
 * Returns a fitness-optimized vitals summary for the AI Coach.
 */
export function retrieveVitalsForFitness(): string {
    const allEntries = readVitals();
    if (allEntries.length === 0) return '';

    const latest = allEntries[0];
    const last30d = getEntriesInRange(allEntries, 30);
    const lines: string[] = [];
    lines.push('## USER HEALTH PROFILE (from logged vitals):');

    if (latest.weight) {
        const weightTrend = getValuesOverTime(last30d, 'weight');
        if (weightTrend.length >= 2) {
            const delta = weightTrend[weightTrend.length - 1] - weightTrend[0];
            lines.push(`- Weight: ${latest.weight} kg (30-day change: ${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10} kg)`);
        } else {
            lines.push(`- Weight: ${latest.weight} kg`);
        }
    }
    if (latest.heart_rate) lines.push(`- Resting Heart Rate: ${latest.heart_rate} bpm`);
    if (latest.bp_systolic && latest.bp_diastolic) lines.push(`- Blood Pressure: ${latest.bp_systolic}/${latest.bp_diastolic} mmHg`);
    if (latest.blood_sugar) lines.push(`- Blood Sugar: ${latest.blood_sugar} mg/dL`);

    // Assess fitness readiness
    const concerns: string[] = [];
    if (latest.heart_rate && latest.heart_rate > 100) concerns.push('Elevated resting heart rate - recommend low-intensity workouts');
    if (latest.bp_systolic && latest.bp_systolic > 140) concerns.push('High blood pressure - avoid heavy lifting, focus on cardio');
    if (latest.blood_sugar && latest.blood_sugar > 180) concerns.push('High blood sugar - exercise can help regulate glucose');

    if (concerns.length > 0) {
        lines.push('\n\u26a0\ufe0f Health Considerations for Exercise:');
        concerns.forEach(c => lines.push(`- ${c}`));
    }

    lines.push('\nTailor workout intensity and nutrition advice based on these metrics.');
    return lines.join('\n');
}

/**
 * Dispatches a custom event when vitals are updated,
 * so other components can react in real-time.
 */
export function notifyVitalsUpdated(): void {
    window.dispatchEvent(new CustomEvent('vitals-updated'));
}
