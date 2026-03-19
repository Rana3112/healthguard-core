import React, { useState } from 'react';
import { ShieldCheck, Plus, X, Loader2, CheckCircle, AlertTriangle, XCircle, Lock, Search, Pill } from 'lucide-react';

// OpenRouter API for GPT-OSS-120B
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const getEnvVar = (key: string): string | undefined => {
    const viteEnv = (import.meta as any)?.env?.[key];
    if (viteEnv) return viteEnv;
    if (typeof process !== 'undefined') {
        return (process as any)?.env?.[key];
    }
    return undefined;
};

interface Interaction {
    drug_a: string;
    drug_b: string;
    severity: 'safe' | 'caution' | 'dangerous';
    description: string;
    recommendation: string;
}

interface InteractionResult {
    summary: string;
    interactions: Interaction[];
    general_advice: string;
}

const severityConfig = {
    safe: { icon: <CheckCircle className="w-4 h-4" />, label: 'Safe', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800/30', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
    caution: { icon: <AlertTriangle className="w-4 h-4" />, label: 'Caution', bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800/30', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
    dangerous: { icon: <XCircle className="w-4 h-4" />, label: 'Dangerous', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800/30', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
};

const DRUG_INTERACTION_PROMPT = `You are a highly knowledgeable pharmacist AI specializing in drug interactions. Analyze the given medicines for potential interactions.

IMPORTANT GUIDELINES:
1. Check each pair of medicines for interactions
2. Consider both direct interactions and indirect effects
3. Rate severity as: "safe" (no significant interaction), "caution" (monitor required), or "dangerous" (avoid combination)
4. Provide clear, actionable recommendations
5. Include Indian medicine brand names when relevant
6. Consider common Indian medications and Ayurvedic interactions if applicable

You MUST respond in this exact JSON format:
{
    "summary": "Brief overall assessment of the medicine combination",
    "interactions": [
        {
            "drug_a": "First medicine name",
            "drug_b": "Second medicine name",
            "severity": "safe|caution|dangerous",
            "description": "Detailed explanation of the interaction",
            "recommendation": "What the patient should do"
        }
    ],
    "general_advice": "Overall advice for the patient taking these medicines"
}

Analyze ALL possible pairs of medicines provided. Be thorough but concise.`;

async function checkDrugInteractionsWithAI(medicines: string[]): Promise<InteractionResult> {
    const apiKey = getEnvVar('VITE_OPENROUTER_API_KEY') || getEnvVar('OPENROUTER_API_KEY');
    
    if (!apiKey) {
        throw new Error('OpenRouter API key is missing. Please configure VITE_OPENROUTER_API_KEY.');
    }

    const userMessage = `Please analyze these medicines for interactions:\n${medicines.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'HealthGuard AI Drug Interaction Checker',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
                { role: 'system', content: DRUG_INTERACTION_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.3,
            max_tokens: 2048,
        }),
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error('[Drug Interaction] OpenRouter API error:', response.status, errorData);
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('[Drug Interaction] GPT-OSS-120B response:', content);

    // Parse the JSON response
    try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
        const result = JSON.parse(jsonStr);
        
        // Validate and return
        return {
            summary: result.summary || 'Analysis complete.',
            interactions: Array.isArray(result.interactions) ? result.interactions : [],
            general_advice: result.general_advice || 'Always consult your doctor before combining medications.'
        };
    } catch (parseError) {
        console.error('[Drug Interaction] Failed to parse response:', parseError);
        // Return a fallback response
        return {
            summary: 'I analyzed the medicines but had trouble formatting the response. Here is my analysis:',
            interactions: [{
                drug_a: medicines[0] || 'Medicine 1',
                drug_b: medicines[1] || 'Medicine 2',
                severity: 'caution',
                description: content.substring(0, 500),
                recommendation: 'Please consult your doctor or pharmacist for detailed interaction information.'
            }],
            general_advice: 'The AI response could not be properly formatted. Please consult a healthcare professional for accurate drug interaction information.'
        };
    }
}

const DrugInteractionChecker: React.FC = () => {
    const [medicines, setMedicines] = useState<string[]>(['', '']);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<InteractionResult | null>(null);
    const [error, setError] = useState('');

    const addMedicine = () => setMedicines([...medicines, '']);
    const removeMedicine = (i: number) => { if (medicines.length > 2) setMedicines(medicines.filter((_, idx) => idx !== i)); };
    const updateMedicine = (i: number, val: string) => { const u = [...medicines]; u[i] = val; setMedicines(u); };

    const checkInteractions = async () => {
        const valid = medicines.filter(m => m.trim());
        if (valid.length < 2) { setError('Enter at least 2 medicines'); return; }
        setError(''); setLoading(true); setResult(null);
        
        try {
            // Use GPT-OSS-120B via OpenRouter for drug interaction analysis
            const interactionResult = await checkDrugInteractionsWithAI(valid);
            setResult(interactionResult);
        } catch (err: any) { 
            console.error('[Drug Interaction] Error:', err);
            setError(err.message || 'Failed to check interactions. Please try again.'); 
        }
        finally { setLoading(false); }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0f1628] overflow-hidden">
            <div className="flex-1 overflow-y-auto">

                {/* Purple top accent bar */}
                <div className="h-1 bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-500" />

                {/* Header */}
                <div className="px-5 pt-5 pb-2">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-500/20">
                            <ShieldCheck className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">Drug Interaction Checker</h2>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Powered by GPT-OSS-120B. Check for dangerous interactions between your medicines.
                    </p>
                </div>

                {/* Input Card */}
                <div className="px-5 py-4">
                    <div className="bg-white dark:bg-[#1a2240] rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-sm p-5">
                        <div className="flex items-center gap-1.5 mb-5">
                            <Lock className="w-3 h-3 text-violet-400" />
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enter Medicines</span>
                        </div>

                        <div className="space-y-3">
                            {medicines.map((med, i) => (
                                <div key={i} className="flex items-center gap-3 group">
                                    <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 text-center shrink-0">{i + 1}</span>
                                    <div className="flex-1 relative">
                                        <input
                                            type="text" value={med} onChange={e => updateMedicine(i, e.target.value)}
                                            placeholder={`Medicine ${i + 1} name...`}
                                            className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 outline-none text-slate-700 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !loading) {
                                                    checkInteractions();
                                                }
                                            }}
                                        />
                                        {medicines.length > 2 && (
                                            <button onClick={() => removeMedicine(i)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Medicine */}
                        <button onClick={addMedicine} className="flex items-center justify-center gap-1.5 w-full mt-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Add Medicine
                        </button>

                        {/* Check Button */}
                        <button
                            onClick={checkInteractions}
                            disabled={loading || medicines.filter(m => m.trim()).length < 2}
                            className="w-full mt-3 py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {loading ? 'Analyzing with GPT-OSS-120B...' : 'Check Interactions'}
                        </button>

                        {error && <p className="text-xs text-red-500 mt-2 font-medium text-center">⚠️ {error}</p>}
                    </div>
                </div>

                {/* Privacy Note */}
                {!result && (
                    <div className="flex items-center justify-center gap-1.5 px-5 py-2">
                        <Lock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">Your data is encrypted and private</span>
                    </div>
                )}

                {/* Results */}
                {result && (
                    <div className="px-5 pb-6 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Summary Card */}
                        <div className="bg-white dark:bg-[#1a2240] rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-sm p-4">
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Pill className="w-3 h-3 text-violet-400" /> Analysis Summary
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{result.summary}</p>
                        </div>

                        {/* Interaction Cards */}
                        {result.interactions.map((inter, i) => {
                            const cfg = severityConfig[inter.severity] || severityConfig.safe;
                            return (
                                <div key={i} className={`rounded-3xl border ${cfg.border} ${cfg.bg} p-4`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-extrabold text-slate-800 dark:text-white">{inter.drug_a}</span>
                                            <span className="text-[10px] text-slate-400">×</span>
                                            <span className="text-xs font-extrabold text-slate-800 dark:text-white">{inter.drug_b}</span>
                                        </div>
                                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${cfg.badge}`}>
                                            {cfg.icon} {cfg.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mb-1.5">{inter.description}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">💡 {inter.recommendation}</p>
                                </div>
                            );
                        })}

                        {/* General Advice */}
                        {result.general_advice && (
                            <div className="bg-violet-50 dark:bg-violet-900/10 rounded-3xl border border-violet-200 dark:border-violet-800/30 p-4">
                                <h3 className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1.5">🩺 Doctor's Note</h3>
                                <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">{result.general_advice}</p>
                            </div>
                        )}

                        {/* Disclaimer */}
                        <div className="flex items-center justify-center gap-1.5 pt-1">
                            <Lock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                            <span className="text-[10px] text-slate-400 dark:text-slate-600 italic">AI-generated by GPT-OSS-120B. Always consult your doctor.</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrugInteractionChecker;
