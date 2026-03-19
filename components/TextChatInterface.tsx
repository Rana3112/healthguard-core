import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image, Loader2, Sparkles, Activity, Pill, MapPin, Square, FileSearch, ShieldAlert, Zap, BrainCircuit, Eye, Bot, Lock, ArrowRight, MessageCircle, Home, Stethoscope, Clock, AlertTriangle, Thermometer, Apple, Calendar, Phone, PillIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { sendMessageToAgent, ModelMode } from '../services/geminiService';
import { ensureFollowUpQuestions, generateCardFromGraphSignal, generateFollowUpQuestions, sanitizeFollowUpQuestions } from '../services/followUpGenerator';
import { AgentAction, ChatMessage, ClarificationCard, ClarificationOption, MessageRole } from '../types';
import { runClinicalGraphTurn } from '../src/agents/clinicalGraph';
import { clearSession } from '../src/agents/patientSession';

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
      : 'Mid';

  const recoverySteps = recoveryText
    ? recoveryText.split('\n').filter(Boolean)
    : [
        'Day 1-2',
        'Day 2-3',
        'Day 3-5',
        'Day 5+',
      ];

  const conditionSummary = condition || 'Your symptoms are being analyzed carefully.';
  const conditionTitle = buildConditionTitle(conditionSummary);

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 text-white p-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_30%)]" />
        <div className="relative flex flex-col lg:flex-row gap-6 lg:items-start">
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.3em] text-teal-100/90 mb-2">Dr. Sharma ka Assessment</div>
            <h2 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3">{conditionTitle}</h2>
            <p className="text-base md:text-lg text-teal-50/95 leading-relaxed max-w-2xl">
              {conditionSummary}
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">🌿 {remedies.length || 3} Remedies</div>
              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">💊 {medicines.length || 3} Medicines</div>
              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">🚨 {redFlags.length || 3} Red Flags</div>
              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">🍲 {diet ? 9 : 9} Diet Tips</div>
            </div>
          </div>

          <div className="w-full lg:w-[290px] rounded-3xl bg-white/10 backdrop-blur-md p-5 border border-white/10">
            <div className="text-center text-white/90 text-sm mb-3">Severity Meter</div>
            <div className="relative h-40 flex items-end justify-center">
              <div className="w-40 h-20 rounded-t-[160px] border-[14px] border-b-0 border-white/85 border-r-teal-200 border-l-orange-400 border-t-orange-400 opacity-95" />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-2 h-20 bg-slate-800/50 rounded-full origin-bottom rotate-[24deg]" />
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-700 rounded-full" />
              <div className="absolute top-10 left-1/2 -translate-x-1/2 text-white/80 text-sm">{severityLabel}</div>
            </div>
            <div className="text-center text-orange-200 font-extrabold mt-1">Moderate — Dhyan Rakhein</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-[26px] border border-emerald-100 bg-emerald-50/70 p-0 overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-emerald-100 bg-emerald-50/90">
            <div className="text-emerald-700 font-extrabold text-xl">Home Remedies</div>
            <div className="text-emerald-500 text-sm">Ghar Pe Kya Karein</div>
          </div>
          <div className="p-5 space-y-3">
            {remedies.length ? remedies.slice(0, 3).map((item, i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">🍋</div>
                <div className="flex-1 text-slate-800 font-medium leading-snug">{item.replace(/^[-•\s]+/, '')}</div>
                <div className="text-slate-400 text-xl">▼</div>
              </div>
            )) : (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-4 text-slate-500">No home remedies available.</div>
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-amber-100 bg-amber-50/70 p-0 overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-amber-100 bg-amber-50/90">
            <div className="text-amber-700 font-extrabold text-xl">Ayurvedic Option</div>
            <div className="text-amber-500 text-sm">Desi Ilaaj</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-100/60 p-5 text-amber-900 leading-relaxed">
              {ayurvedic || 'You can also try a simple Ayurvedic option if suitable.'}
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4">
              <div className="font-bold text-amber-700 mb-3">Kahan milega?</div>
              <ul className="space-y-2 text-slate-700">
                <li>📍 Patanjali store</li>
                <li>📍 Baidyanath outlet</li>
                <li>📍 Local chemist (Himalaya brand)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-sky-100 bg-sky-50/70 overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-sky-100 bg-sky-50/90">
          <div className="text-sky-700 font-extrabold text-xl">Diet Guidance</div>
          <div className="text-sky-500 text-sm">Khaana Peena</div>
        </div>
        <div className="grid md:grid-cols-2">
          <div className="border-b md:border-b-0 md:border-r border-emerald-100 bg-emerald-50/50">
            <div className="px-6 py-4 font-extrabold text-emerald-700 flex items-center gap-2">✅ Khayein (Eat)</div>
            <div className="divide-y divide-emerald-100 bg-white/30">
              {(diet ? diet.split('.').map((s) => s.trim()).filter(Boolean) : ['Khichdi', 'Dal chawal', 'Dalia', 'Coconut water', 'Nimbu paani']).slice(0, 5).map((item, i) => (
                <div key={i} className="px-6 py-4 text-slate-700 flex items-center gap-3">
                  <span className="text-xl">🍲</span>
                  <span className="font-medium">{item.replace(/^Eat\s*/i, '').replace(/^[-•\s]+/, '')}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-red-50/50">
            <div className="px-6 py-4 font-extrabold text-red-700 flex items-center gap-2">❌ Avoid Karein</div>
            <div className="divide-y divide-red-100 bg-white/30">
              {['Spicy curries', 'Maida', 'Fried snacks', 'Cold drinks'].map((item, i) => (
                <div key={i} className="px-6 py-4 text-slate-700 flex items-center gap-3">
                  <span className="text-xl text-red-500">🚫</span>
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-[26px] border border-indigo-100 bg-indigo-50/70 overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-indigo-100 bg-indigo-50/90">
            <div className="text-indigo-700 font-extrabold text-xl">Medicines (Chemist)</div>
            <div className="text-indigo-500 text-sm">Dawai — Kisi bhi Medical Store Se</div>
          </div>
          <div className="p-5">
            <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
              <div className="grid grid-cols-3 bg-sky-100/80 text-indigo-900 font-bold px-4 py-4">
                <div>Brand Name</div>
                <div>Generic</div>
                <div>Dosage & Duration</div>
              </div>
              {(medicines.length ? medicines : [
                'Crocin (Paracetamol) — 1 tablet, twice a day, for 2 days',
                'Dolo 650 (Paracetamol) — 1 tablet, twice a day, for 2 days',
                'Gelusil (Antacid) — 1 tablet, after meals, for 2 days',
              ]).slice(0, 3).map((item, i) => {
                const [brandPart, rest = ''] = item.split('(');
                const generic = rest.split(')')[0] || 'Generic';
                const dosage = rest.split('—')[1] || rest || item;
                return (
                  <div key={i} className={`grid grid-cols-3 px-4 py-5 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'} border-t border-slate-100`}>
                    <div className="font-extrabold text-indigo-900">{brandPart.replace(/^[-•\s]+/, '').trim().split('—')[0].trim()}</div>
                    <div className="italic text-slate-500">{generic}</div>
                    <div className="text-slate-700 leading-relaxed">{dosage.replace(/^\s*/, '').replace(/\s*\)\s*/, '').trim()}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-xs italic text-slate-400">⚠️ Dawai lene se pehle label padh lein. Doubt ho toh chemist se poochein.</div>
          </div>
        </div>

        <div className="rounded-[26px] border border-rose-100 bg-rose-50/70 overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-rose-100 bg-rose-50/90">
            <div className="text-rose-700 font-extrabold text-xl">See Doctor If...</div>
            <div className="text-rose-500 text-sm">Kab Doctor ke Paas Jaayein</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="relative space-y-3">
              <div className="absolute left-3 top-3 bottom-3 w-[2px] bg-rose-300 rounded-full" />
              {(redFlags.length ? redFlags : [
                'High fever (above 102°F) that lasts for more than 3 days',
                'Severe headache or stiff neck',
                'Difficulty breathing or chest pain',
              ]).slice(0, 3).map((item, i) => (
                <div key={i} className="relative pl-10">
                  <div className={`absolute left-[13px] top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-[3px] ${i === 0 ? 'border-red-500 bg-white' : i === 1 ? 'border-orange-400 bg-white' : 'border-amber-400 bg-white'}`} />
                  <div className="rounded-2xl border border-rose-100 bg-white px-5 py-4 text-rose-900 shadow-sm leading-relaxed">{item.replace(/^[-•\s]+/, '')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-yellow-200 bg-yellow-50 p-5 shadow-sm flex gap-4 items-start">
        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl">👨‍⚕️</div>
        <div>
          <div className="font-extrabold text-yellow-900 mb-1">Dr. Sharma ki Salah</div>
          <div className="text-yellow-900/90 leading-relaxed">{finalAdvice || 'Remember to stay hydrated, rest well, and seek help if symptoms worsen.'}</div>
        </div>
      </div>

      <div className="rounded-[26px] border border-violet-100 bg-violet-50/70 overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-violet-100 bg-violet-50/90">
          <div className="text-violet-700 font-extrabold text-xl">Expected Recovery</div>
          <div className="text-violet-500 text-sm">Kitne Din Mein Theek Honge</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[
            { title: 'Day 1–2', desc: 'Rest + Kadha + Light Diet', icon: '🛏️', tone: 'from-violet-100 to-violet-200' },
            { title: 'Day 2–3', desc: 'Start OTC medicine if needed', icon: '💊', tone: 'from-indigo-100 to-indigo-200' },
            { title: 'Day 3–5', desc: 'Symptoms reducing, eat normally', icon: '🌱', tone: 'from-purple-100 to-purple-200' },
            { title: 'Day 5+', desc: 'Consult doctor if not better', icon: '🏥', tone: 'from-fuchsia-100 to-fuchsia-200' },
          ].map((step, i) => (
            <div key={i} className={`p-5 text-center bg-gradient-to-br ${step.tone} border-r last:border-r-0 border-violet-100`}>
              <div className="text-3xl mb-2">{step.icon}</div>
              <div className="font-extrabold text-violet-900 mb-1">{step.title}</div>
              <div className="text-violet-900/70 text-sm leading-snug">{step.desc}</div>
            </div>
          ))}
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
      alert('Could not access the microphone. Please check your permissions.');
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
      const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'https://healthguard-backend-yo9a.onrender.com';
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
    options?: { bypassClarification?: boolean; clinicalResume?: boolean }
  ) => {
    const imageToUse = imageOverride !== undefined ? imageOverride : selectedImage;
    if (!text.trim() && !imageToUse) return;

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
        modelMode !== 'agent' && // Agent mode uses direct SERP/maps
        modelMode !== 'max_deep_think' && // Max Deep Think uses NVIDIA Kimi K2.5 directly
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

          const result = await runClinicalGraphTurn({
            threadId,
            userInput: options?.clinicalResume ? undefined : text,
            resumeAnswer: options?.clinicalResume ? text : undefined,
            mode: modelMode, // Pass current mode (fast, standard, thinking, max_deep_think, vision, agent)
            image: imageBase64, // Pass base64 image for vision mode
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
      if (modelMode === 'agent') {
        const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5001';
        const OPENROUTER_API_KEY = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || (import.meta as any).env?.OPENROUTER_API_KEY;
        
        // Determine if user wants medicine prices or location/map
        const isMedicineQuery = /buy|order|price|cost|medicine|tablet|capsule|syrup|cream|pharmacy|dolo|paracetamol|azithromycin|amoxicillin|ibuprofen|aspirin|pharmeasy|1mg|apollo|netmeds|amazon|flipkart/i.test(text);
        const isLocationQuery = /nearby|near me|clinic|doctor|hospital|pharmacy|location|address|find|search.*clinic|search.*doctor|search.*pharmacy/i.test(text);

        if (isMedicineQuery) {
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
          // Show pharmacy/medical map
          const botMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: MessageRole.MODEL,
            text: `🗺️ Here are the nearby medical facilities based on your location:`,
            timestamp: Date.now(),
            showPharmacyMap: true
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

      if (modelMode === 'max_deep_think') {
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
          }
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
      const response = await sendMessageToAgent(
        history,
        text,
        imageToSend ? imageToSend.base64.split(',')[1] : undefined,
        false, // isEditRequest
        userLocation ? { lat: userLocation.lat, lng: userLocation.lon } : null,
        modelMode, // PASS THE MODE
        isClinicalCaseComplete ? lastClinicalAnalysis : undefined
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
        fileInputRef.current?.click();
        break;

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Medicines':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medicine. Identify the medicine name, its uses, dosage instructions, side effects, warnings, and any important drug interactions. Format the results clearly.';
        fileInputRef.current?.click();
        break;

      // Pharmacy — switch to Agent mode, show interactive map with pharmacy data
      case 'Pharmacy': {
        setModelMode('agent');
        const pharmacyMsg: ChatMessage = {
          id: Date.now().toString(),
          role: MessageRole.MODEL,
          text: '📍 Searching for nearby pharmacies and medical stores around your location...',
          showPharmacyMap: true,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, pharmacyMsg]);
        break;
      }

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Report':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medical report. Extract ALL lab values and test results. For each value: show the parameter name, measured value, normal range, and status (✅ Normal, ⬆️ High, ⬇️ Low). Flag any critical or abnormal values. Then provide a summary of overall health and actionable recommendations. Format results in a clear table.';
        fileInputRef.current?.click();
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
      case 'agent': return "Ask me to find medicines, compare prices, or set alerts...";
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

  const handleFlashcardOptionClick = (card: ClarificationCard, option: ClarificationOption) => {
    if (isLoading) return;

    const selectedSummary = `${card.question} → ${option.label}`;
    setClarificationFlow((prev) => ({
      ...prev,
      selectedCards: [...prev.selectedCards, selectedSummary]
    }));

    const outboundText = option.userStatement?.trim() || `For "${card.question}", my answer is: ${option.label}.`;
    setInput(outboundText);

    if (option.intent === 'agent') {
      setModelMode('agent');
    }

    if (option.intent === 'vision') {
      setModelMode('vision');
      pendingAutoPromptRef.current = `Analyze this uploaded medical document or image for the following user context: "${outboundText}". Provide a clear structured analysis.`;
      fileInputRef.current?.click();
      return;
    }

    const shouldBypassClarification = option.intent === 'final_analysis';

    setTimeout(() => {
      void handleSend(outboundText, undefined, {
        bypassClarification: shouldBypassClarification,
        clinicalResume: FEATURES.USE_CLINICAL_GRAPH && awaitingClinicalResume,
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
                            max-w-[85%] lg:max-w-[75%] rounded-2xl p-4 shadow-sm relative group
                            ${msg.role === MessageRole.USER
                ? 'bg-teal-600 text-white rounded-tr-none'
                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none pb-9'
              }
                        `}>
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="max-w-xs rounded-lg mb-3 border border-white/20" />
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

              <div className={`prose prose-sm max-w-none ${msg.role === MessageRole.USER ? 'prose-invert text-white' : 'text-slate-700'}`}>
                {msg.role === MessageRole.MODEL && isStructuredDiagnosis(msg.text) ? (
                  <StructuredDiagnosisCard text={msg.text} />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
                          <table className="w-full text-sm text-left" {...props} />
                        </div>
                      ),
                      thead: ({ node, ...props }) => <thead className="bg-slate-50 text-slate-700 uppercase text-xs" {...props} />,
                      th: ({ node, ...props }) => <th className="px-4 py-3 font-bold border-b border-slate-200" {...props} />,
                      td: ({ node, ...props }) => <td className="px-4 py-2 border-b border-slate-100 last:border-0" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-bold text-teal-700 bg-teal-50 px-1 rounded" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-4 space-y-1 my-2" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-4 space-y-1 my-2" {...props} />,
                      li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
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
                  <NearbyPharmacyMap />
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
                              const card: ClarificationCard = {
                                question: question,
                                options: [
                                  { label: 'Ask this', userStatement: question }
                                ]
                              };
                              handleFlashcardOptionClick(card, card.options[0]);
                            }}
                            disabled={isLoading}
                            className="w-full group flex items-center gap-3 p-3 bg-white dark:bg-slate-800/60 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-700/50 transition-all duration-200 shadow-sm hover:shadow-md text-left"
                          >
                            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform">
                              {getIcon(question)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-snug group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
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

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Upgrade to Pro AI</h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Unlock the full power of HealthGuard with **Agent Mode** (automated ordering) and the **Fitness Hub**.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  try {
                    const token = await user?.getIdToken();
                    const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5001';
                    const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user?.uid, email: user?.email })
                    });
                    const data = await response.json();
                    if (data.url) window.location.href = data.url;
                  } catch (e) { console.error(e); }
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
              >
                Go Pro Now — ₹499/mo
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Input Area */}
      <div className={`p-4 backdrop-blur-md border-t border-slate-100 transition-colors ${modelMode === 'agent' ? 'bg-purple-50/80' : 'bg-white/80'}`}>
        <div className="max-w-4xl mx-auto">

          {/* Mode Switcher (above input bar) */}
          <div className="flex justify-center mb-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700 gap-0.5">
              <button onClick={() => setModelMode('fast')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'fast' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Zap className={`w-3 h-3 ${modelMode === 'fast' ? 'text-amber-500' : ''}`} /> Fast
              </button>
              <button onClick={() => setModelMode('standard')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'standard' ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Sparkles className={`w-3 h-3 ${modelMode === 'standard' ? 'text-teal-500' : ''}`} /> Standard
              </button>
              <button onClick={() => setModelMode('thinking')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'thinking' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <BrainCircuit className={`w-3 h-3 ${modelMode === 'thinking' ? 'text-indigo-500' : ''}`} /> Deep Think
              </button>
              <button onClick={() => setModelMode('max_deep_think')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'max_deep_think' ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Activity className={`w-3 h-3 ${modelMode === 'max_deep_think' ? 'text-teal-400' : ''}`} /> Max Deep Think
              </button>
              <button onClick={() => setModelMode('vision')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'vision' ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200 dark:border-fuchsia-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Eye className={`w-3 h-3 ${modelMode === 'vision' ? 'text-fuchsia-500' : ''}`} /> Vision
              </button>
              <button
                onClick={() => isPro ? setModelMode('agent') : setShowUpgradeModal(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all relative ${modelMode === 'agent' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}
              >
                <Bot className={`w-3 h-3 ${modelMode === 'agent' ? 'text-rose-500' : ''}`} />
                Agent
                {!isPro && <Lock className="w-2 h-2 ml-0.5 text-slate-400" />}
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
                  'bg-slate-100 focus:ring-teal-500/20'
                  }`}
              />
              {/* Send Button inside Input */}
              <button
                onClick={handleInitialSend}
                disabled={!input.trim() && !selectedImage}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${input.trim() || selectedImage
                  ? (modelMode === 'agent' ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' :
                    'bg-teal-600 hover:bg-teal-700 text-white shadow-md')
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`p-3 rounded-xl transition-all ${isRecording ? 'text-white bg-red-500 hover:bg-red-600 animate-pulse shadow-md shadow-red-500/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'} ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isRecording ? 'Stop Recording' : 'Voice Input'}
            >
              {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />)}
            </button>
          </div>
        </div>
      </div>
    </div >
  );
};

export default TextChatInterface;
