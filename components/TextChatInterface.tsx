import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image, Loader2, Sparkles, Activity, Pill, MapPin, Square, FileSearch, ShieldAlert, Zap, BrainCircuit, Eye, Bot, Lock, ArrowRight, MessageCircle, Home, Stethoscope, Clock, AlertTriangle, Thermometer, Apple, Calendar, Phone, PillIcon, Search } from 'lucide-react';
import { sendMessageToAgent, ModelMode } from '../services/geminiService';
import { ensureFollowUpQuestions, generateCardFromGraphSignal, generateFollowUpQuestions, sanitizeFollowUpQuestions } from '../services/followUpGenerator';
import { retrieveVitalsContext, retrieveVitalsContextLite } from '../services/vitalsRAG';
import RichMessageRenderer from './RichMessageRenderer';
import { AgentAction, ChatMessage, ClarificationCard, ClarificationOption, MessageRole } from '../types';
import { runClinicalGraphTurn } from '../src/agents/clinicalGraph';
import { clearSession } from '../src/agents/patientSession';
import { getBackendUrl } from '../src/lib/backendUrl';
import { requestMicrophoneWithSettingsPrompt, isMicrophoneSupported } from '../src/lib/permissions';

const DIAGNOSIS_HEADERS = [
  'Aapki Taklif',
  'Ghar Pe Kya Karein',
  'Khaana Peena',
  'Dawai',
  'Ayurvedic Option',
  'Kab Doctor ke Paas Jaayein',
  'Dr. Sharma ki Salah',
  'Expected Recovery',
];

const REQUIRED_DIAGNOSIS_HEADERS = DIAGNOSIS_HEADERS.slice(0, 7);

const isStructuredDiagnosis = (text: string): boolean =>
  REQUIRED_DIAGNOSIS_HEADERS.every((header) => text.toLowerCase().includes(header.toLowerCase()));

const extractSection = (text: string, header: string, nextHeaders: string[]): string => {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const currentHeader = escape(header);
  const nextPattern = nextHeaders.length > 0
    ? nextHeaders.map((h) => `(?:\\*\\*\\s*)?${escape(h)}[^\\n]*(?:\\*\\*)?`).join('|')
    : '$';

  const regex = new RegExp(
    `(?:\\*\\*\\s*)?${currentHeader}[^\\n]*(?:\\*\\*)?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${nextPattern}))|$)`,
    'i'
  );

  const match = text.match(regex);
  return match?.[1]?.trim() || '';
};

const buildConditionTitle = (raw: string): string => {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return 'Health Condition';

  const lower = text.toLowerCase();
  const tags: string[] = [];

  if (lower.includes('headache') || lower.includes('migraine')) tags.push('Headache');
  if (lower.includes('fever')) tags.push('Fever');
  if (lower.includes('cough')) tags.push('Cough');
  if (lower.includes('cold') || lower.includes('runny nose')) tags.push('Cold');
  if (lower.includes('throat')) tags.push('Throat Irritation');
  if (lower.includes('acidity') || lower.includes('gas')) tags.push('Acidity');
  if (lower.includes('stomach') || lower.includes('abdominal')) tags.push('Stomach Discomfort');
  if (lower.includes('nausea') || lower.includes('vomit')) tags.push('Nausea');

  if (tags.length > 0) return tags.slice(0, 2).join(' & ');

  const leadSentence = text.split(/[.!?]/)[0].trim();
  const shortLead = leadSentence.split(/\s+/).slice(0, 5).join(' ');
  return shortLead || 'Health Condition';
};

const StructuredDiagnosisCard: React.FC<{ text: string }> = ({ text }) => {
  const condition = extractSection(text, DIAGNOSIS_HEADERS[0], DIAGNOSIS_HEADERS.slice(1));
  const remedies = extractSection(text, DIAGNOSIS_HEADERS[1], DIAGNOSIS_HEADERS.slice(2)).split('\n').filter(Boolean);
  const diet = extractSection(text, DIAGNOSIS_HEADERS[2], DIAGNOSIS_HEADERS.slice(3));
  const medicines = extractSection(text, DIAGNOSIS_HEADERS[3], DIAGNOSIS_HEADERS.slice(4)).split('\n').filter(Boolean);
  const ayurvedic = extractSection(text, DIAGNOSIS_HEADERS[4], DIAGNOSIS_HEADERS.slice(5));
  const redFlags = extractSection(text, DIAGNOSIS_HEADERS[5], DIAGNOSIS_HEADERS.slice(6)).split('\n').filter(Boolean);
  const finalAdvice = extractSection(text, DIAGNOSIS_HEADERS[6], []);
  const recoveryText = extractSection(text, DIAGNOSIS_HEADERS[7], []);

  const severityLabel = condition.toLowerCase().includes('mild') || condition.toLowerCase().includes('light')
    ? 'Mild'
    : condition.toLowerCase().includes('moderate') || condition.toLowerCase().includes('fever')
      ? 'Moderate'
      : 'Mild';

  const severityColor = severityLabel === 'Mild'
    ? { bg: 'from-emerald-500 to-teal-500', badge: 'bg-emerald-100 text-emerald-700', bar: 'w-1/3' }
    : severityLabel === 'Moderate'
      ? { bg: 'from-amber-500 to-orange-500', badge: 'bg-amber-100 text-amber-700', bar: 'w-2/3' }
      : { bg: 'from-rose-500 to-red-500', badge: 'bg-rose-100 text-rose-700', bar: 'w-full' };

  const conditionSummary = condition || 'Your symptoms are being analyzed carefully.';
  const conditionTitle = buildConditionTitle(conditionSummary);

  const eatItems = diet ? diet.split('.').map((s) => s.trim()).filter(Boolean).slice(0, 5) : ['Khichdi', 'Dal chawal', 'Dalia', 'Coconut water', 'Nimbu paani'];
  const avoidItems = ['Spicy curries', 'Maida', 'Fried snacks', 'Cold drinks'];

  const medicineRows = (medicines.length ? medicines : [
    'Crocin (Paracetamol) — 1 tablet, twice a day, for 2 days',
    'Dolo 650 (Paracetamol) — 1 tablet, twice a day, for 2 days',
    'Gelusil (Antacid) — 1 tablet, after meals, for 2 days',
  ]).slice(0, 3);

  const redFlagItems = (redFlags.length ? redFlags : [
    'High fever (above 102°F) that lasts for more than 3 days',
    'Severe headache or stiff neck',
    'Difficulty breathing or chest pain',
  ]).slice(0, 3);

  const remedyItems = remedies.length ? remedies.slice(0, 3) : [];

  return (
    <div className="space-y-4 w-full max-w-none">
      {/* ─── HEADER CARD ─── */}
      <div className={`w-full rounded-2xl bg-gradient-to-br ${severityColor.bg} text-white p-5 shadow-lg relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-8" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">🩺</div>
            <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/80">Clinical Assessment</span>
          </div>
          <h2 className="text-2xl font-extrabold leading-tight mb-2">{conditionTitle}</h2>
          <p className="text-sm text-white/90 leading-relaxed mb-4 max-w-[90%]">{conditionSummary}</p>

          {/* Severity Bar */}
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${severityColor.badge}`}>
              {severityLabel}
            </span>
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className={`h-full bg-white/80 rounded-full ${severityColor.bar}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── QUICK STATS ROW ─── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: '🌿', label: 'Remedies', count: remedyItems.length || 3, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
          { icon: '💊', label: 'Medicines', count: medicineRows.length, color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
          { icon: '🍲', label: 'Diet Tips', count: eatItems.length, color: 'bg-sky-50 text-sky-600 border-sky-100' },
          { icon: '🚨', label: 'Red Flags', count: redFlagItems.length, color: 'bg-rose-50 text-rose-600 border-rose-100' },
        ].map((stat, i) => (
          <div key={i} className={`rounded-xl border p-2.5 text-center ${stat.color}`}>
            <div className="text-lg mb-0.5">{stat.icon}</div>
            <div className="text-base font-extrabold">{stat.count}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ─── HOME REMEDIES ─── */}
      <div className="w-full rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-emerald-100 dark:border-emerald-900/30">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-lg">🌿</div>
          <div>
            <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Home Remedies</div>
            <div className="text-[10px] text-emerald-500 dark:text-emerald-400">Ghar Pe Kya Karein</div>
          </div>
        </div>
        <div className="divide-y divide-emerald-50 dark:divide-emerald-900/20">
          {remedyItems.length ? remedyItems.map((item, i) => (
            <div key={i} className="px-5 py-3.5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5">{i + 1}</div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed flex-1">{item.replace(/^[-•\s]+/, '')}</p>
            </div>
          )) : (
            <div className="px-5 py-4 text-sm text-slate-400 italic">No home remedies specified.</div>
          )}
        </div>
      </div>

      {/* ─── DIET & AYURVEDIC (2-col) ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Diet */}
        <div className="w-full rounded-2xl border border-sky-100 dark:border-sky-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-sky-100 dark:border-sky-900/30">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-lg">🍲</div>
            <div>
              <div className="text-sm font-bold text-sky-800 dark:text-sky-300">Diet Guide</div>
              <div className="text-[10px] text-sky-500 dark:text-sky-400">Khaana Peena</div>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Khayein (Eat)
              </div>
              <div className="space-y-1.5">
                {eatItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="text-emerald-400 text-xs">✓</span>
                    <span>{item.replace(/^Eat\s*/i, '').replace(/^[-•\s]+/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Avoid Karein
              </div>
              <div className="space-y-1.5">
                {avoidItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span className="text-red-400 text-xs">✕</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ayurvedic */}
        <div className="w-full rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-amber-100 dark:border-amber-900/30">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-lg">🌿</div>
            <div>
              <div className="text-sm font-bold text-amber-800 dark:text-amber-300">Ayurvedic Option</div>
              <div className="text-[10px] text-amber-500 dark:text-amber-400">Desi Ilaaj</div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-xl border border-amber-100 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-900/10 p-4 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {ayurvedic || 'Try simple Ayurvedic remedies like tulsi kadha or haldi doodh.'}
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Kahan Milega?</div>
              <div className="space-y-1.5">
                {['Patanjali store', 'Baidyanath outlet', 'Local chemist (Himalaya)'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-amber-400 text-xs">📍</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MEDICINES TABLE ─── */}
      <div className="w-full rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-indigo-100 dark:border-indigo-900/30">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-lg">💊</div>
          <div>
            <div className="text-sm font-bold text-indigo-800 dark:text-indigo-300">Medicines</div>
            <div className="text-[10px] text-indigo-500 dark:text-indigo-400">Dawai — Kisi bhi Medical Store Se</div>
          </div>
        </div>
        <div className="p-4">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/20 overflow-hidden">
            <div
              className="overflow-x-auto"
              style={{ WebkitOverflowScrolling: 'touch' as any }}
            >
              <table className="w-full text-sm" style={{ minWidth: '400px' }}>
                <thead>
                  <tr className="bg-indigo-600 text-white">
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-3">Brand</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-3">Generic</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-3">Dosage</th>
                  </tr>
                </thead>
                <tbody>
                  {medicineRows.map((item, i) => {
                    const [brandPart, rest = ''] = item.split('(');
                    const generic = rest.split(')')[0] || '—';
                    const dosage = rest.split('—')[1] || rest || item;
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-indigo-50/50 dark:bg-indigo-900/10'}>
                        <td className="px-4 py-3 font-semibold text-indigo-900 dark:text-indigo-200 border-b border-indigo-50 dark:border-indigo-900/20">{brandPart.replace(/^[-•\s]+/, '').trim().split('—')[0].trim()}</td>
                        <td className="px-4 py-3 italic text-slate-500 dark:text-slate-400 border-b border-indigo-50 dark:border-indigo-900/20">{generic}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 border-b border-indigo-50 dark:border-indigo-900/20">{dosage.replace(/^\s*/, '').replace(/\s*\)\s*/, '').trim()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center gap-1">
            <span>⚠️</span> Dawai lene se pehle label padh lein. Doubt ho toh chemist se poochein.
          </p>
        </div>
      </div>

      {/* ─── RED FLAGS ─── */}
      <div className="w-full rounded-2xl border border-rose-100 dark:border-rose-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-rose-100 dark:border-rose-900/30">
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-lg">🚨</div>
          <div>
            <div className="text-sm font-bold text-rose-800 dark:text-rose-300">See Doctor If...</div>
            <div className="text-[10px] text-rose-500 dark:text-rose-400">Kab Doctor ke Paas Jaayein</div>
          </div>
        </div>
        <div className="divide-y divide-rose-50 dark:divide-rose-900/20">
          {redFlagItems.map((item, i) => (
            <div key={i} className="px-5 py-3.5 flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold text-white ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-400' : 'bg-amber-400'}`}>
                {i + 1}
              </div>
              <p className="text-sm text-rose-900 dark:text-rose-200 leading-relaxed flex-1">{item.replace(/^[-•\s]+/, '')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── DR. SHARMA ADVICE ─── */}
      <div className="w-full rounded-2xl border border-teal-100 dark:border-teal-900/30 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/10 dark:to-cyan-900/10 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-xl flex-shrink-0">👨‍⚕️</div>
          <div>
            <div className="text-sm font-bold text-teal-800 dark:text-teal-300 mb-1">Dr. Sharma ki Salah</div>
            <p className="text-sm text-teal-900/80 dark:text-teal-200/80 leading-relaxed">{finalAdvice || 'Stay hydrated, rest well, and seek help if symptoms worsen.'}</p>
          </div>
        </div>
      </div>

      {/* ─── RECOVERY TIMELINE ─── */}
      <div className="w-full rounded-2xl border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-[#1a2240] overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-violet-100 dark:border-violet-900/30">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-lg">📈</div>
          <div>
            <div className="text-sm font-bold text-violet-800 dark:text-violet-300">Expected Recovery</div>
            <div className="text-[10px] text-violet-500 dark:text-violet-400">Kitne Din Mein Theek Honge</div>
          </div>
        </div>
        <div className="p-5">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-violet-100 dark:bg-violet-900/30 rounded-full" />
            <div className="grid grid-cols-4 gap-2 relative">
              {[
                { day: 'Day 1–2', desc: 'Rest + Kadha', icon: '🛏️', color: 'bg-violet-500' },
                { day: 'Day 2–3', desc: 'OTC if needed', icon: '💊', color: 'bg-indigo-500' },
                { day: 'Day 3–5', desc: 'Symptoms ease', icon: '🌱', color: 'bg-purple-500' },
                { day: 'Day 5+', desc: 'See doctor', icon: '🏥', color: 'bg-fuchsia-500' },
              ].map((step, i) => (
                <div key={i} className="text-center">
                  <div className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center mx-auto mb-2 text-sm shadow-sm relative z-10`}>
                    {step.icon}
                  </div>
                  <div className="text-[11px] font-bold text-violet-800 dark:text-violet-300 mb-0.5">{step.day}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
import { FEATURES } from '../src/config/features';
import { useAuth } from '../src/context/AuthContext';
import MedicinePriceCard from './MedicinePriceCard';
import NearbyPharmacyMap from './NearbyPharmacyMap';

interface TextChatInterfaceProps {
  dispatch: React.Dispatch<AgentAction>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onMessagesChange: (messages: ChatMessage[]) => void;
  modelMode: ModelMode;
  setModelMode: (mode: ModelMode) => void;
  onQuickTool?: (type: string) => void;
  pendingQuickTool?: string | null;
  onQuickToolConsumed?: () => void;
  onOpenDrugInteractions?: () => void;
}

export function TextInputFlashcard({ card, onSend, isLoading }: { card: ClarificationCard; onSend: (text: string, intent?: 'vision'|'agent'|'final_analysis') => void; isLoading: boolean }) {
  const [val, setVal] = useState("");
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 p-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-3">{card.question}</p>
      <div className="flex gap-2 mb-3">
        <input 
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={card.textPlaceholder || "Type your answer here..."}
          className="flex-1 text-[13px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-slate-800 dark:text-slate-200 placeholder-slate-400"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && val.trim() && !isLoading) {
              onSend(val.trim());
            }
          }}
        />
        <button
          onClick={() => val.trim() && onSend(val.trim())}
          disabled={!val.trim() || isLoading}
          className="bg-teal-500 text-white rounded-lg px-3 flex items-center justify-center hover:bg-teal-600 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {card.options && card.options.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          {card.options.map((option, optionIdx) => (
            <button
              key={`${option.label}-${optionIdx}`}
              onClick={() => onSend(option.userStatement, option.intent)}
              disabled={isLoading}
              className="text-[11px] rounded-full px-2.5 py-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TextChatInterface: React.FC<TextChatInterfaceProps> = ({ dispatch, messages, setMessages, onMessagesChange, modelMode, setModelMode, onQuickTool, pendingQuickTool, onQuickToolConsumed, onOpenDrugInteractions }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ file: File, base64: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number, lon: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [agentSubMode, setAgentSubMode] = useState<'location' | 'medicine' | 'reminder' | null>(null);

  // Reset agent sub-mode when switching away from agent mode
  useEffect(() => {
    if (modelMode !== 'agent') {
      setAgentSubMode(null);
    }
  }, [modelMode]);
  const [graphPhaseLabel, setGraphPhaseLabel] = useState('');
  const [clinicalThreadId, setClinicalThreadId] = useState<string | null>(null);
  const [awaitingClinicalResume, setAwaitingClinicalResume] = useState(false);
  const [isClinicalCaseComplete, setIsClinicalCaseComplete] = useState(false);
  const [clarificationFlow, setClarificationFlow] = useState<{ isActive: boolean; rootQuery: string; selectedCards: string[] }>({
    isActive: false,
    rootQuery: '',
    selectedCards: []
  });
  const { user, isPro } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const clarificationFlowRef = useRef(clarificationFlow);
  // Stores a prompt to auto-send right after the user picks an image (for vision quick tools)
  const pendingAutoPromptRef = useRef<string | null>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    clarificationFlowRef.current = clarificationFlow;
  }, [clarificationFlow]);

  // Get Location (Optional: for locating hospitals/pharmacies)
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      }, (error) => {
        console.log("Location access denied or error:", error);
      });
    }
  }, []);

  const startRecording = async () => {
    try {
      // Request microphone permission with settings prompt if denied
      const hasPermission = await requestMicrophoneWithSettingsPrompt();
      if (!hasPermission) {
        // User either denied or was shown settings dialog - don't proceed
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access the microphone. Please check your permissions in device settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const BACKEND_URL = getBackendUrl();
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      if (data.text) {
        await handleSend(data.text);
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleInitialSend = async () => {
    if (!input.trim() && !selectedImage) return;

    const userText = input;
    setInput(''); // Clear input immediately

    await handleSend(userText, undefined, { bypassClarification: false });
  }

  // Send Message Handler
  const handleSend = async (
    text: string,
    imageOverride?: { file: File, base64: string } | null,
    options?: { bypassClarification?: boolean; clinicalResume?: boolean; forceMode?: ModelMode }
  ) => {
    const imageToUse = imageOverride !== undefined ? imageOverride : selectedImage;
    if (!text.trim() && !imageToUse) return;

    // Use forced mode if provided, otherwise use current state
    const activeMode = options?.forceMode || modelMode;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      text: text,
      image: imageToUse?.base64,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    // Reset inputs — always clear selectedImage to prevent stale images on next send
    const imageToSend = imageToUse;
    setSelectedImage(null);

    try {
      const lastClinicalAnalysis = [...messages].reverse().find((m) => m.role === MessageRole.MODEL)?.text || '';

      // Clinical graph only handles the initial intake/analysis phase.
      // After the first final analysis, follow-up questions should use normal chat with memory.
      const shouldUseClinicalGraph =
        FEATURES.USE_CLINICAL_GRAPH &&
        activeMode !== 'agent' && // Agent mode uses direct SERP/maps
        activeMode !== 'max_deep_think' && // Max Deep Think uses NVIDIA Kimi K2.5 directly
        !isClinicalCaseComplete &&
        text.trim().length > 0;

      if (shouldUseClinicalGraph) {
        try {
          const shouldStartNewClinicalThread =
            isClinicalCaseComplete &&
            !options?.clinicalResume;

          if (shouldStartNewClinicalThread && clinicalThreadId) {
            clearSession(clinicalThreadId);
          }

          const threadId = shouldStartNewClinicalThread
            ? crypto.randomUUID()
            : (clinicalThreadId || crypto.randomUUID());
          if (!clinicalThreadId) setClinicalThreadId(threadId);
          if (shouldStartNewClinicalThread) {
            setClinicalThreadId(threadId);
            setGraphPhaseLabel('Collecting your symptoms...');
            setIsClinicalCaseComplete(false);
          }

          // Pass the current mode and image to the clinical graph
          // Extract base64 from the image object and strip the data URL prefix
          const imageBase64 = imageToSend?.base64
            ? imageToSend.base64.replace(/^data:image\/\w+;base64,/, '')
            : undefined;

          const vitalsForGraph = retrieveVitalsContext();
          const result = await runClinicalGraphTurn({
            threadId,
            userInput: options?.clinicalResume ? undefined : text,
            resumeAnswer: options?.clinicalResume ? text : undefined,
            mode: activeMode, // Pass current mode (fast, standard, thinking, max_deep_think, vision, agent)
            image: imageBase64, // Pass base64 image for vision mode
            vitalsContext: vitalsForGraph || undefined, // Pass RAG vitals context
          });

          if (result.state?.phase) {
            setGraphPhaseLabel(phaseLabels[result.state.phase] || 'Analyzing...');
          }

          const graphCard = generateCardFromGraphSignal({
            next_card: result.state.next_card,
            phase: result.state.phase,
          });

          if (result.interruptCard || graphCard) {
            const cardToShow = result.interruptCard || graphCard;
            setMessages(prev => ([
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: MessageRole.MODEL,
                text: 'Before I provide the final analysis, please answer this clinical follow-up question.',
                timestamp: Date.now(),
                suggestedQuestionCards: cardToShow ? [cardToShow] : []
              }
            ]));
            setAwaitingClinicalResume(true);
            setIsClinicalCaseComplete(false);
            setGraphPhaseLabel('');
            setIsLoading(false);
            return;
          }

          if (result.finalDiagnosis) {
            const suggestedActions = await resolveSuggestedActions(
              text,
              result.finalDiagnosis,
              []
            );

            setMessages(prev => ([
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: MessageRole.MODEL,
                text: result.finalDiagnosis,
                timestamp: Date.now(),
                suggestedActions,
              }
            ]));
            setAwaitingClinicalResume(false);
            setIsClinicalCaseComplete(true);
            setGraphPhaseLabel('');
            setClarificationFlow({ isActive: false, rootQuery: '', selectedCards: [] });
            setIsLoading(false);
            return;
          }
        } catch (clinicalGraphError) {
          // Production safety: if clinical graph cannot run due env/API issue,
          // continue with normal mode handler instead of dead-ending the chat.
          console.warn('[Clinical Graph] Falling back to standard chat flow:', clinicalGraphError);
          setAwaitingClinicalResume(false);
          setGraphPhaseLabel('');
        }
      }

      const shouldAskClarificationFirst =
        !FEATURES.USE_CLINICAL_GRAPH &&
        !options?.bypassClarification &&
        !imageToSend &&
        text.trim().length > 0;

      if (shouldAskClarificationFirst) {
        const flowSnapshot = clarificationFlowRef.current;
        const rootQuery = flowSnapshot.isActive
          ? flowSnapshot.rootQuery || text
          : text;

        const clarificationCards: ClarificationCard[] = [];

        // Safety fallback: if no clarification cards are configured,
        // skip this legacy step and continue to the normal model response flow.
        if (clarificationCards.length === 0) {
          // no-op: fall through to normal sendMessageToAgent flow below
        } else {
          setMessages(prev => ([
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: "Before I provide the final analysis, please pick the most relevant question card.",
              timestamp: Date.now(),
              suggestedQuestionCards: clarificationCards
            }
          ]));

          setClarificationFlow(prev => ({
            isActive: true,
            rootQuery,
            selectedCards: [...prev.selectedCards, text]
          }));

          setIsLoading(false);
          return;
        }
      }

      // Prepare history for API
      const history = updatedMessages.map(m => ({
        id: m.id,
        role: m.role === MessageRole.USER ? MessageRole.USER : MessageRole.MODEL,
        text: m.text,
        image: m.image
      }));

      // Agent Mode: Direct SERP search for medicines and maps for locations
      if (activeMode === 'agent') {
        const BACKEND_URL = getBackendUrl();
        const OPENROUTER_API_KEY = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || (import.meta as any).env?.OPENROUTER_API_KEY;
        
        // Check agent sub-mode first (from floating buttons)
        const isLocationFromSubMode = agentSubMode === 'location';
        const isMedicineFromSubMode = agentSubMode === 'medicine';
        const isReminderFromSubMode = agentSubMode === 'reminder';
        
        // Detect query type from text
        const isLocationFromQuery = /nearby|near me|clinic|doctor|hospital|address|location|find.*near|search.*clinic|search.*doctor|search.*pharmacy|visit.*pharmacy|check.*blood|bp check|blood pressure.*check|pediatrician|dermatologist|cardiologist|ophthalmologist|dentist|gynecologist|orthopedic|physiotherapist/i.test(text);
        const isMedicineFromQuery = /buy|order|price|cost|medicine|tablet|capsule|syrup|cream|dolo|paracetamol|azithromycin|amoxicillin|ibuprofen|aspirin|pharmeasy|1mg|apollo|netmeds|amazon|flipkart/i.test(text);
        const isReminderFromQuery = /remind|reminder|remember|appointment|schedule|alert|notify/i.test(text);

        // Cross-validation: show error if sub-mode conflicts with query
        if (agentSubMode === 'location' && isMedicineFromQuery && !isLocationFromQuery) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: MessageRole.MODEL,
            text: '⚠️ You have **Locations** mode selected. To search for medicine prices, please tap the **Medicine** button first.',
            timestamp: Date.now()
          }]);
          setIsLoading(false);
          return;
        }
        if (agentSubMode === 'medicine' && isLocationFromQuery && !isMedicineFromQuery) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: MessageRole.MODEL,
            text: '⚠️ You have **Medicine** mode selected. To find nearby locations, please tap the **Locations** button first.',
            timestamp: Date.now()
          }]);
          setIsLoading(false);
          return;
        }
        if (agentSubMode === 'reminder' && (isLocationFromQuery || isMedicineFromQuery) && !isReminderFromQuery) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: MessageRole.MODEL,
            text: '⚠️ You have **Reminder** mode selected. To find locations or medicines, please tap the appropriate button first.',
            timestamp: Date.now()
          }]);
          setIsLoading(false);
          return;
        }

        const isLocationQuery = isLocationFromSubMode || isLocationFromQuery;
        const isMedicineQuery = isMedicineFromSubMode || isMedicineFromQuery;
        const isReminderQuery = isReminderFromSubMode || isReminderFromQuery;

        // Priority: reminder submode/query first, then medicine, then location
        if (isReminderQuery) {
          // Handle reminder requests
          try {
            // Parse reminder text and extract date/time
            const now = new Date();
            let reminderDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default: tomorrow
            let reminderTime = '10:00 AM';
            
            // Simple parsing for common patterns
            const textLower = text.toLowerCase();
            if (textLower.includes('tomorrow')) {
              reminderDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            } else if (textLower.includes('next week')) {
              reminderDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            } else if (textLower.includes('today')) {
              reminderDate = now;
            }
            
            // Extract time if mentioned
            const timeMatch = text.match(/(\d{1,2})(:\d{2})?\s*(am|pm|AM|PM)/);
            if (timeMatch) {
              reminderTime = timeMatch[0];
            }
            
            const formattedDate = reminderDate.toLocaleDateString('en-IN', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
            
            // Call backend API to create reminder and send confirmation email
            const userEmail = user?.email || '';
            if (userEmail) {
              try {
                const reminderResponse = await fetch(`${BACKEND_URL}/api/general-reminder`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: userEmail,
                    reminder_text: text,
                    due_date: reminderDate.toISOString(),
                    reminder_time: reminderTime
                  })
                });
                
                const reminderData = await reminderResponse.json();
                if (reminderData.success) {
                  const botMessage: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    role: MessageRole.MODEL,
                    text: `✅ Your reminder has been set for **${formattedDate}** at **${reminderTime}**.\n\nA confirmation email has been sent to ${userEmail}. You'll receive another reminder at the scheduled time.`,
                    timestamp: Date.now()
                  };
                  setMessages(prev => [...prev, botMessage]);
                } else {
                  throw new Error(reminderData.error || 'Failed to create reminder');
                }
              } catch (apiError) {
                console.error('[Agent Mode] Reminder API error:', apiError);
                // Fallback to local confirmation
                const botMessage: ChatMessage = {
                  id: (Date.now() + 1).toString(),
                  role: MessageRole.MODEL,
                  text: `✅ Your reminder has been set for **${formattedDate}** at **${reminderTime}**.\n\nNote: Email notification could not be sent due to a technical issue.`,
                  timestamp: Date.now()
                };
                setMessages(prev => [...prev, botMessage]);
              }
            } else {
              // No email available
              const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: MessageRole.MODEL,
                text: `✅ Your reminder has been set for **${formattedDate}** at **${reminderTime}**.\n\nTo receive email reminders, please ensure you're logged in with an email address.`,
                timestamp: Date.now()
              };
              setMessages(prev => [...prev, botMessage]);
            }
          } catch (reminderError) {
            console.error('[Agent Mode] Reminder error:', reminderError);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: "Sorry, I couldn't set your reminder. Please try again with a clearer date and time.",
              timestamp: Date.now()
            }]);
          }
        } else if (isMedicineQuery) {
          // Search medicine via backend SERP API
          try {
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: `🔍 Searching for "${text}" across Indian e-commerce platforms...`,
              timestamp: Date.now()
            }]);

            const searchResponse = await fetch(`${BACKEND_URL}/search-medicine`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: text })
            });

            const searchData = await searchResponse.json();

            if (searchData.success && searchData.best_picks && searchData.best_picks.length > 0) {
              const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: MessageRole.MODEL,
                text: `Here are the best prices I found for "${text}" across Indian platforms:`,
                timestamp: Date.now(),
                priceComparison: {
                  query: text,
                  results: searchData.best_picks,
                  cheapest: searchData.cheapest
                }
              };
              setMessages(prev => [...prev, botMessage]);
            } else {
              const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: MessageRole.MODEL,
                text: `I couldn't find any results for "${text}". Please try with the exact medicine name or check if it's available on Indian platforms.`,
                timestamp: Date.now()
              };
              setMessages(prev => [...prev, botMessage]);
            }
          } catch (searchError) {
            console.error('[Agent Mode] Medicine search error:', searchError);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: `Sorry, I couldn't search for "${text}" right now. The backend service may be unavailable.`,
              timestamp: Date.now()
            }]);
          }
        } else if (isLocationQuery) {
          // Generate contextual message based on the query
          const q = text.toLowerCase();
          let searchTerm = 'medical facilities';
          if (/pediatrician|child/i.test(q)) searchTerm = 'pediatricians';
          else if (/dermatologist|skin/i.test(q)) searchTerm = 'dermatologists';
          else if (/dentist|dental/i.test(q)) searchTerm = 'dentists';
          else if (/ophthalmologist|eye/i.test(q)) searchTerm = 'eye specialists';
          else if (/cardiologist|heart/i.test(q)) searchTerm = 'cardiologists';
          else if (/gynecologist|women/i.test(q)) searchTerm = 'gynecologists';
          else if (/orthopedic|bone/i.test(q)) searchTerm = 'orthopedic doctors';
          else if (/physiotherapist|physio/i.test(q)) searchTerm = 'physiotherapists';
          else if (/hospital|emergency/i.test(q)) searchTerm = 'hospitals';
          else if (/clinic|doctor/i.test(q)) searchTerm = 'clinics & doctors';
          else if (/pharmacy|chemist|medical store/i.test(q)) searchTerm = 'pharmacies & medical stores';
          else if (/lab|test|diagnostic/i.test(q)) searchTerm = 'diagnostic labs';
          else if (/blood pressure|bp/i.test(q)) searchTerm = 'pharmacies for blood pressure checks';

          const contextMsg = `Here are the **${searchTerm}** near your location:`;

          const botMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: MessageRole.MODEL,
            text: contextMsg,
            timestamp: Date.now(),
            showPharmacyMap: true,
            locationQuery: text
          };
          setMessages(prev => [...prev, botMessage]);
        } else {
          // Use GPT-OSS-120B for general agent queries with context about medicines/locations
          try {
            if (!OPENROUTER_API_KEY) {
              throw new Error('OpenRouter API key missing');
            }

            const agentSystemPrompt = `You are HealthGuard's Shopping & Location Agent. 
You help users find:
1. Medicines/health products with prices across Indian e-commerce platforms (Amazon, Flipkart, 1mg, Apollo, PharmEasy, Netmeds)
2. Nearby medical facilities (clinics, hospitals, pharmacies)

For medicines: Be specific about brands, prices, and where to buy.
For locations: Recommend checking the map for nearby facilities.

If user asks about a specific medicine, tell them to use the medicine search.
If user asks about a location, tell them to use the map feature.
Keep responses concise and actionable.`;

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                  { role: 'system', content: agentSystemPrompt },
                  ...history.filter(m => m.role !== MessageRole.SYSTEM).map(m => ({
                    role: m.role === MessageRole.USER ? 'user' : 'assistant',
                    content: m.text
                  })),
                  { role: 'user', content: text }
                ],
                temperature: 0.5,
                max_tokens: 1024
              })
            });

            const data = await response.json();
            const agentResponse = data.choices?.[0]?.message?.content || "I'm here to help you find medicines or locate nearby medical facilities.";

            const botMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: agentResponse,
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, botMessage]);
          } catch (agentError) {
            console.error('[Agent Mode] GPT-OSS error:', agentError);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: MessageRole.MODEL,
              text: "I'm here to help you find medicines or locate nearby facilities. Try asking about a specific medicine or search for clinics near you!",
              timestamp: Date.now()
            }]);
          }
        }

        setIsLoading(false);
        return;
      }

      // Image Mode: Generate AI images using Freepik API
      if (activeMode === 'image') {
        const BACKEND_URL = getBackendUrl();
        
        // Add user message
        const userMsg: ChatMessage = {
          id: Date.now().toString(),
          role: MessageRole.USER,
          text: text,
          timestamp: Date.now()
        };
        
        // Add loading message
        const loadingMsgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
          id: loadingMsgId,
          role: MessageRole.MODEL,
          text: "Generating image... Please wait.",
          timestamp: Date.now(),
          isLoading: true
        }]);

        try {
          const response = await fetch(`${BACKEND_URL}/generate-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          });
          
          const data = await response.json();
          
          if (data.success && data.image_url) {
            // Update loading message with generated image
            setMessages(prev => prev.map(msg => 
              msg.id === loadingMsgId 
                ? {
                    ...msg,
                    text: `Here's your generated image for: "${text}"`,
                    image: data.image_url.startsWith('data:') ? data.image_url : `data:image/png;base64,${data.image_url}`,
                    isLoading: false,
                    timestamp: Date.now()
                  }
                : msg
            ));
          } else {
            setMessages(prev => prev.map(msg => 
              msg.id === loadingMsgId 
                ? {
                    ...msg,
                    text: `Failed to generate image: ${data.error || 'Unknown error'}`,
                    isLoading: false,
                    timestamp: Date.now()
                  }
                : msg
            ));
          }
        } catch (error) {
          console.error('[Image Mode] Error:', error);
          setMessages(prev => prev.map(msg => 
            msg.id === loadingMsgId 
              ? {
                  ...msg,
                  text: 'Failed to generate image. Please try again.',
                  isLoading: false,
                  timestamp: Date.now()
                }
              : msg
          ));
        }

        setIsLoading(false);
        return;
      }

      if (activeMode === 'max_deep_think') {
        const { sendMessageToOpenAI } = await import('../services/openaiDeepThinkService');

        // Add a placeholder message for the bot immediately
        const botMessageId = (Date.now() + 1).toString();
        const thinkingStartTime = Date.now();
        setMessages(prev => [...prev, {
          id: botMessageId,
          role: MessageRole.MODEL,
          text: "",
          thinkingText: "",
          timestamp: Date.now()
        }]);

        let finalResponseText = '';
        const vitalsForDeep = retrieveVitalsContext();

        await sendMessageToOpenAI(
          history,
          text,
          // onAnswerChunk — goes into msg.text
          (chunk: string) => {
            finalResponseText += chunk;
            setMessages(prev => prev.map(msg =>
              msg.id === botMessageId
                ? { ...msg, text: msg.text + chunk }
                : msg
            ));
          },
          // onThinkingChunk — goes into msg.thinkingText
          (chunk: string) => {
            const elapsed = Math.round((Date.now() - thinkingStartTime) / 1000);
            setMessages(prev => prev.map(msg =>
              msg.id === botMessageId
                ? { ...msg, thinkingText: (msg.thinkingText || '') + chunk, thinkingDuration: elapsed }
                : msg
            ));
          },
          vitalsForDeep
            ? `You are an incredibly advanced medical reasoning AI. Take your time to think through problems deeply and provide comprehensive, step-by-step reasoning before drawing a conclusion.\n\n${vitalsForDeep}`
            : undefined
        );

        const followUps = await resolveSuggestedActions(text, finalResponseText, []);
        setMessages(prev => prev.map(msg =>
          msg.id === botMessageId
            ? { ...msg, suggestedActions: followUps }
            : msg
        ));

        setClarificationFlow({ isActive: false, rootQuery: '', selectedCards: [] });
        setIsLoading(false);
        return;
      }

      // Call Gemini Service with Mode
      const vitalsCtx = retrieveVitalsContextLite();
      const response = await sendMessageToAgent(
        history,
        text,
        imageToSend ? imageToSend.base64.split(',')[1] : undefined,
        false, // isEditRequest
        userLocation ? { lat: userLocation.lat, lng: userLocation.lon } : null,
        activeMode, // PASS THE MODE
        isClinicalCaseComplete ? lastClinicalAnalysis : undefined,
        vitalsCtx || undefined
      );

      // Handle Agent Actions
      if (response.text.includes("[AGENT_ORDER_START]")) {
        dispatch({
          type: 'START_AGENT_SESSION',
          payload: { platform: 'Amazon', item: 'Medical Supplies', quantity: 1 }
        });
      }

      const finalSuggestedActions = await resolveSuggestedActions(text, response.text, response.suggestedActions || []);

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.MODEL,
        text: response.text,
        timestamp: Date.now(),
        suggestedActions: finalSuggestedActions,
        priceComparison: response.priceComparison
      };

      setMessages(prev => [...prev, botMessage]);
      setClarificationFlow({ isActive: false, rootQuery: '', selectedCards: [] });

    } catch (error) {
      console.error('[TextChatInterface] Error:', error);
      const graphModeRequest = FEATURES.USE_CLINICAL_GRAPH && !imageToSend && text.trim().length > 0;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: graphModeRequest
          ? `I hit an issue while processing your clinical session. Error: ${errorMessage}. Please check the browser console (F12) for details.`
          : `I'm sorry, I'm having trouble connecting right now. Error: ${errorMessage}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = { file, base64: reader.result as string };
        setSelectedImage(imageData);
        setModelMode('vision');
        // If a quick tool was waiting for an upload, auto-send the prompt immediately
        if (pendingAutoPromptRef.current) {
          const prompt = pendingAutoPromptRef.current;
          pendingAutoPromptRef.current = null;
          // Use a tiny delay so React can flush the setSelectedImage state first
          setTimeout(() => handleSend(prompt, imageData), 50);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  const runMedicalCheck = (type: string) => {
    handleSend(`Check specifically for ${type} related issues based on my previous messages or image.`);
  };

  // Handle quick tool triggers from the header buttons
  useEffect(() => {
    if (!pendingQuickTool) return;

    switch (pendingQuickTool) {
      // Vision mode — upload symptom document/photo, auto-submit analysis
      case 'Symptoms':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this symptom document or image. Identify all symptoms mentioned, assess their severity, suggest possible conditions or causes, and recommend next steps including home remedies and when to see a doctor. Format the results clearly.';
        // On mobile/Capacitor, we should briefly wait or ensure it's a direct enough chain
        setTimeout(() => fileInputRef.current?.click(), 100);
        break;

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Medicines':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medicine. Identify the medicine name, its uses, dosage instructions, side effects, warnings, and any important drug interactions. Format the results clearly.';
        setTimeout(() => fileInputRef.current?.click(), 100);
        break;

      // Pharmacy — switch to Agent mode, show interactive map with pharmacy data
      case 'Pharmacy': {
        setModelMode('agent');
        const pharmacyMsg: ChatMessage = {
          id: Date.now().toString(),
          role: MessageRole.MODEL,
          text: '📍 Searching for nearby pharmacies and medical stores around your location...',
          showPharmacyMap: true,
          locationQuery: 'nearby pharmacy medical store',
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, pharmacyMsg]);
        break;
      }

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Report':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medical report. Extract ALL lab values and test results. For each value: show the parameter name, measured value, normal range, and status (✅ Normal, ⬆️ High, ⬇️ Low). Flag any critical or abnormal values. Then provide a summary of overall health and actionable recommendations. Format results in a clear table.';
        setTimeout(() => fileInputRef.current?.click(), 100);
        break;

      // Redirect to the dedicated Drug Interaction tool in the right sidebar
      case 'Drugs':
        onOpenDrugInteractions?.();
        break;
    }
    onQuickToolConsumed?.();
  }, [pendingQuickTool]);

  const getPlaceholder = () => {
    switch (modelMode) {
      case 'agent':
        if (agentSubMode === 'location') return "Enter location to find (e.g., pediatrician, dermatologist, hospital)...";
        if (agentSubMode === 'medicine') return "Enter medicine name to search prices (e.g., Dolo 650, Crocin)...";
        if (agentSubMode === 'reminder') return "Enter reminder (e.g., remind me to take medicine tomorrow at 10am)...";
        return "Ask me to find medicines, compare prices, or find locations...";
      case 'image': return "Describe the image you want to generate (e.g., push-up exercise illustration)...";
      case 'vision': return "Show me an image, and I will analyze it...";
      case 'max_deep_think': return "Ask a highly complex medical question for maximum reasoning...";
      case 'thinking': return "Ask a complex medical question for deep reasoning...";
      case 'fast': return "Ask for quick home remedies or tips...";
      default: return "Describe your symptoms or ask for health advice...";
    }
  };

  const phaseLabels: Record<string, string> = {
    intake: 'Understanding your concern...',
    gathering: 'Dr. AI is reviewing your answers...',
    abstraction: 'Building your clinical picture...',
    searching: 'Checking medical knowledge...',
    diagnosis: 'Formulating assessment...',
    complete: '',
  };

  const resolveSuggestedActions = async (userQuery: string, assistantText: string, existingSuggestions?: string[]) => {
    const fromModel = sanitizeFollowUpQuestions(existingSuggestions || [], 5);
    if (fromModel.length > 0) return fromModel;

    try {
      const generated = await generateFollowUpQuestions(userQuery, assistantText);
      return ensureFollowUpQuestions(generated, userQuery);
    } catch (error) {
      console.error("Failed to resolve follow up questions", error);
      return ensureFollowUpQuestions([], userQuery);
    }
  };

  // Detect if a question requires agentic mode
  const isAgenticQuestion = (text: string): boolean => {
    const lower = text.toLowerCase();
    const agenticKeywords = [
      'order', 'buy', 'purchase', 'book',
      'contact', 'call', 'phone',
      'find nearby', 'search nearby', 'locate', 'nearby',
      'deliver', 'ship',
      'reserve', 'schedule appointment',
      'get directions', 'directions to',
      'price of', 'cost of', 'where to buy'
    ];
    return agenticKeywords.some(kw => lower.includes(kw));
  };

  const handleFlashcardOptionClick = (card: ClarificationCard, option: ClarificationOption) => {
    if (isLoading) return;

    const selectedSummary = `${card.question} → ${option.label}`;
    setClarificationFlow((prev) => ({
      ...prev,
      selectedCards: [...prev.selectedCards, selectedSummary]
    }));

    const outboundText = option.userStatement?.trim() || `For "${card.question}", my answer is: ${option.label}.`;
    setInput(outboundText);

    const detectedIntent = option.intent || (isAgenticQuestion(outboundText) ? 'agent' : undefined);

    if (detectedIntent === 'agent') {
      setModelMode('agent');
    }

    if (detectedIntent === 'vision') {
      setModelMode('vision');
      pendingAutoPromptRef.current = `Analyze this uploaded medical document or image for the following user context: "${outboundText}". Provide a clear structured analysis.`;
      fileInputRef.current?.click();
      return;
    }

    const shouldBypassClarification = detectedIntent === 'final_analysis';

    setTimeout(() => {
      void handleSend(outboundText, undefined, {
        bypassClarification: shouldBypassClarification,
        clinicalResume: FEATURES.USE_CLINICAL_GRAPH && awaitingClinicalResume,
        forceMode: detectedIntent === 'agent' ? 'agent' : undefined,
      });
    }, 120);
  };

  const latestModelMessageId = [...messages].reverse().find((m) => m.role === MessageRole.MODEL)?.id;

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
        {messages.length === 1 && messages[0].role === MessageRole.SYSTEM && ( // Assuming first message is welcome
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40 select-none">
            <div className="w-20 h-20 bg-teal-100 rounded-3xl flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">How can I help today?</h2>
            <p className="text-slate-500 max-w-sm">
              {modelMode === 'agent' ? "Tell the agent what to order or research for you." :
                modelMode === 'vision' ? "Drop an image to start analyzing." :
                  modelMode === 'max_deep_think' ? "I'm in Max Deep Think mode. I will meticulously step through complex medical queries." :
                    "Ask about symptoms, analyze medical reports, or get fitness advice."}
            </p>
          </div>
        )}

        {messages.filter(m => m.role !== MessageRole.SYSTEM).map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`
                            rounded-2xl p-4 shadow-sm relative group
                            ${msg.role === MessageRole.USER
                ? 'w-auto max-w-[88%] lg:max-w-[72%] bg-teal-600 text-white rounded-tr-none'
                : 'w-full max-w-none lg:max-w-[96%] bg-white text-slate-700 border border-slate-100 rounded-tl-none pb-9'
              }
                        `}>
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="w-24 h-24 object-cover rounded-lg mb-2 border border-white/20" />
              )}

              {/* Collapsible Thinking Section (Max Deep Think / Kimi K2.5) */}
              {msg.thinkingText && msg.role === MessageRole.MODEL && (
                <details className="mb-3 group/think">
                  <summary className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors py-1.5">
                    <svg className="w-3.5 h-3.5 transition-transform group-open/think:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-teal-500" />
                      Thought for {msg.thinkingDuration || '...'} seconds
                    </span>
                  </summary>
                  <div className="mt-2 ml-1 pl-3 border-l-2 border-slate-200 text-xs text-slate-500 leading-relaxed max-h-[300px] overflow-y-auto scrollbar-thin">
                    <pre className="whitespace-pre-wrap font-sans">{msg.thinkingText}</pre>
                  </div>
                </details>
              )}

              {/* Thinking indicator while still thinking (no answer yet) */}
              {msg.thinkingText && !msg.text && msg.role === MessageRole.MODEL && (
                <div className="flex items-center gap-2 text-xs text-teal-600 animate-pulse mb-2">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Thinking...</span>
                </div>
              )}

              <div className={`prose prose-sm max-w-none break-words w-full ${msg.role === MessageRole.USER ? 'prose-invert text-white' : 'text-slate-700'}`}>
                {msg.role === MessageRole.MODEL && isStructuredDiagnosis(msg.text) ? (
                  <StructuredDiagnosisCard text={msg.text} />
                ) : msg.role === MessageRole.MODEL ? (
                  <RichMessageRenderer content={msg.text} />
                ) : (
                  <span>{msg.text}</span>
                )}
              </div>

              {/* SERP Price Card (Model Only) */}
              {msg.priceComparison && (
                <MedicinePriceCard
                  query={msg.priceComparison.query}
                  results={msg.priceComparison.results}
                  cheapest={msg.priceComparison.cheapest}
                />
              )}

              {/* Pharmacy Map Card (Model Only) */}
              {msg.showPharmacyMap && (
                <div className="mt-4">
                  <NearbyPharmacyMap searchQuery={msg.locationQuery || undefined} />
                </div>
              )}

              {/* Image Generation UI removed - using bytez API separately if needed */}

              {/* Suggested Actions (Only for last model message) */}
              {msg.role === MessageRole.MODEL && msg.suggestedQuestionCards && msg.suggestedQuestionCards.length > 0 && msg.id === latestModelMessageId && (
                <div className="mt-8 border-t border-slate-100 dark:border-slate-800/60 pt-5 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-teal-500 dark:text-teal-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      Related Questions
                    </span>
                  </div>
                  <div className="space-y-3">
                    {msg.suggestedQuestionCards.slice(0, 6).map((card, cardIdx) => {
                      if (card.inputType === 'text') {
                        return (
                          <div key={`${card.question}-${cardIdx}`}>
                            <TextInputFlashcard 
                              card={card} 
                              isLoading={isLoading} 
                              onSend={(text, intent) => {
                                handleFlashcardOptionClick(card, {
                                  label: text,
                                  userStatement: text,
                                  intent: intent as any
                                });
                              }} 
                            />
                          </div>
                        );
                      }
                      
                      return (
                        <div key={`${card.question}-${cardIdx}`} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/50 p-3">
                          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-2">{card.question}</p>
                          <div className="flex flex-wrap gap-2">
                            {card.options.map((option, optionIdx) => (
                              <button
                                key={`${option.label}-${optionIdx}`}
                                onClick={() => handleFlashcardOptionClick(card, option)}
                                disabled={isLoading}
                                className="text-xs rounded-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {msg.role === MessageRole.MODEL && msg.suggestedActions && msg.suggestedActions.length > 0 && msg.id === latestModelMessageId && (
                <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/10 dark:to-blue-900/10 rounded-2xl p-4 border border-teal-100 dark:border-teal-800/20">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                        What would you like to know next?
                      </span>
                    </div>
                    <div className="space-y-2">
                      {msg.suggestedActions.slice(0, 5).map((question, idx) => {
                        // Assign relevant icon based on question content
                        const getIcon = (q: string) => {
                          const lower = q.toLowerCase();
                          if (lower.includes('home remedy') || lower.includes('kitchen') || lower.includes(' घर') || lower.includes('दे')) return <Home className="w-4 h-4" />;
                          if (lower.includes('doctor') || lower.includes('hospital') || lower.includes('clinic') || lower.includes('डॉक्टर')) return <Stethoscope className="w-4 h-4" />;
                          if (lower.includes('symptom') || lower.includes('watch') || lower.includes('monitor') || lower.includes('लक्षण')) return <Activity className="w-4 h-4" />;
                          if (lower.includes('side effect') || lower.includes('warning') || lower.includes('खतरा')) return <AlertTriangle className="w-4 h-4" />;
                          if (lower.includes('time') || lower.includes('how long') || lower.includes('duration') || lower.includes('कितना')) return <Clock className="w-4 h-4" />;
                          if (lower.includes('food') || lower.includes('diet') || lower.includes('eat') || lower.includes('खाना')) return <Apple className="w-4 h-4" />;
                          if (lower.includes('appointment') || lower.includes('visit') || lower.includes('कब')) return <Calendar className="w-4 h-4" />;
                          if (lower.includes('medicine') || lower.includes('tablet') || lower.includes('dolo') || lower.includes('ओषधि')) return <PillIcon className="w-4 h-4" />;
                          return <MessageCircle className="w-4 h-4" />;
                        };

                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              const detectedIntent = isAgenticQuestion(question) ? 'agent' : undefined;
                              if (detectedIntent === 'agent') {
                                setModelMode('agent');
                              }
                              const card: ClarificationCard = {
                                question: question,
                                options: [
                                  { label: 'Ask this', userStatement: question, intent: detectedIntent as any }
                                ]
                              };
                              handleFlashcardOptionClick(card, card.options[0]);
                            }}
                            disabled={isLoading}
                            className={`w-full group flex items-center gap-3 p-3 bg-white dark:bg-slate-800/60 rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md text-left ${
                              isAgenticQuestion(question)
                                ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 hover:border-amber-300 dark:hover:border-amber-700'
                                : 'hover:bg-teal-50 dark:hover:bg-teal-900/20 border-slate-100 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-700/50'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform ${
                              isAgenticQuestion(question)
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                            }`}>
                              {getIcon(question)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-snug transition-colors ${
                                isAgenticQuestion(question)
                                  ? 'text-amber-800 dark:text-amber-200 group-hover:text-amber-700 dark:group-hover:text-amber-300'
                                  : 'text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300'
                              }`}>
                                {question}
                              </p>
                            </div>
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center group-hover:bg-teal-500 group-hover:text-white transition-all duration-200">
                              <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-white" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {msg.timestamp && (
                <span className={`text-[10px] absolute bottom-1 ${msg.role === MessageRole.USER ? 'left-2 text-teal-200' : 'right-2 text-slate-300'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
              <span className="text-xs text-slate-500 font-medium">
                {FEATURES.USE_CLINICAL_GRAPH && graphPhaseLabel ? graphPhaseLabel :
                  modelMode === 'max_deep_think' ? "Thinking with maximum capacity..." :
                  modelMode === 'thinking' ? "Thinking deeply..." :
                    modelMode === 'agent' ? "Searching platforms..." :
                      "Analyzing..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Input Area */}
      <div className={`p-4 backdrop-blur-md border-t border-slate-100 transition-colors ${modelMode === 'agent' ? 'bg-purple-50/80' : 'bg-white/80'}`}>
        <div className="max-w-4xl mx-auto">

          {/* Agent Sub-Mode Buttons (shown when agent mode is active) */}
          {modelMode === 'agent' && (
            <div className="flex items-center gap-2 mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <button
                onClick={() => setAgentSubMode(agentSubMode === 'location' ? null : 'location')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
                  agentSubMode === 'location'
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20'
                    : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Locations
              </button>
              <button
                onClick={() => setAgentSubMode(agentSubMode === 'medicine' ? null : 'medicine')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
                  agentSubMode === 'medicine'
                    ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20'
                    : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Medicine
              </button>
              <button
                onClick={() => setAgentSubMode(agentSubMode === 'reminder' ? null : 'reminder')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
                  agentSubMode === 'reminder'
                    ? 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-500/20'
                    : 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Reminder
              </button>
            </div>
          )}

          {/* Mode Switcher (above input bar) */}
          <div className="flex w-full justify-start mb-3 overflow-x-auto overflow-y-hidden scrollbar-hide touch-pan-x px-1 pb-1">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700 gap-1 flex-nowrap min-w-max w-max pr-2 snap-x snap-mandatory">
              <button onClick={() => setModelMode('fast')} className={`flex-none snap-start min-w-[78px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'fast' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Zap className={`w-3 h-3 flex-shrink-0 ${modelMode === 'fast' ? 'text-amber-500' : ''}`} /> Fast
              </button>
              <button onClick={() => setModelMode('standard')} className={`flex-none snap-start min-w-[90px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'standard' ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Sparkles className={`w-3 h-3 flex-shrink-0 ${modelMode === 'standard' ? 'text-teal-500' : ''}`} /> Standard
              </button>
              <button onClick={() => setModelMode('thinking')} className={`flex-none snap-start min-w-[78px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'thinking' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <BrainCircuit className={`w-3 h-3 flex-shrink-0 ${modelMode === 'thinking' ? 'text-indigo-500' : ''}`} /> Deep
              </button>
              <button onClick={() => setModelMode('max_deep_think')} className={`flex-none snap-start min-w-[78px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'max_deep_think' ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Activity className={`w-3 h-3 flex-shrink-0 ${modelMode === 'max_deep_think' ? 'text-teal-400' : ''}`} /> Max
              </button>
              <button onClick={() => setModelMode('vision')} className={`flex-none snap-start min-w-[82px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'vision' ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200 dark:border-fuchsia-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Eye className={`w-3 h-3 flex-shrink-0 ${modelMode === 'vision' ? 'text-fuchsia-500' : ''}`} /> Vision
              </button>
              <button
                onClick={() => isPro ? setModelMode('agent') : setShowUpgradeModal(true)}
                className={`flex-none snap-start min-w-[84px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap relative ${modelMode === 'agent' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
              >
                <Bot className={`w-3 h-3 flex-shrink-0 ${modelMode === 'agent' ? 'text-rose-500' : ''}`} />
                Agent
                {!isPro && <Lock className="w-2 h-2 ml-0.5 text-slate-400 flex-shrink-0" />}
              </button>
              <button onClick={() => setModelMode('image')} className={`flex-none snap-start min-w-[84px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium transition-all whitespace-nowrap ${modelMode === 'image' ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Image className={`w-3 h-3 flex-shrink-0 ${modelMode === 'image' ? 'text-cyan-500' : ''}`} />
                Image
              </button>
            </div>
          </div>

          {/* Image Preview */}
          {selectedImage && (
            <div className="mb-3 flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200 inline-flex">
              <img src={selectedImage.base64} className="w-10 h-10 object-cover rounded-lg" />
              <div className="text-xs">
                <p className="font-semibold text-slate-700 truncate max-w-[120px]">{selectedImage.file.name}</p>
                <button onClick={() => setSelectedImage(null)} className="text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
              title="Upload Image"
            >
              <Image className="w-5 h-5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageSelect}
            />

            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInitialSend()}
                placeholder={getPlaceholder()}
                className={`w-full border-none rounded-2xl pl-4 pr-12 py-3.5 focus:ring-2 text-slate-700 placeholder:text-slate-400 font-medium transition-all ${modelMode === 'agent' ? 'bg-white focus:ring-purple-500/20' :
                  modelMode === 'image' ? 'bg-cyan-50 focus:ring-cyan-500/20' :
                  'bg-slate-100 focus:ring-teal-500/20'
                  }`}
              />
              {/* Send Button inside Input */}
              <button
                onClick={handleInitialSend}
                disabled={!input.trim() && !selectedImage}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${input.trim() || selectedImage
                  ? (modelMode === 'agent' ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' :
                    modelMode === 'image' ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-md' :
                    'bg-teal-600 hover:bg-teal-700 text-white shadow-md')
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {isMicrophoneSupported() && (
              <button
                onClick={toggleRecording}
                disabled={isTranscribing}
                className={`p-3 rounded-xl transition-all ${isRecording ? 'text-white bg-red-500 hover:bg-red-600 animate-pulse shadow-md shadow-red-500/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'} ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isRecording ? 'Stop Recording' : 'Voice Input'}
              >
                {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div >
  );
};

export default TextChatInterface;
