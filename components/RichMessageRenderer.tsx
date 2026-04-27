import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HeartPulse,
  Home,
  ListChecks,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";

interface RichMessageRendererProps {
  content: string;
}

type CareFlowStep = {
  title: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
};

const HEALTH_TERMS = [
  "symptom",
  "pain",
  "fever",
  "cough",
  "cold",
  "headache",
  "vomit",
  "diarrhea",
  "bp",
  "blood pressure",
  "sugar",
  "medicine",
  "doctor",
  "home remedy",
  "diagnosis",
  "infection",
  "rash",
  "dizziness",
  "breath",
  "chest",
  "stomach",
  "throat",
  "health",
  "remedy",
];

const SHOPPING_TERMS = ["price comparison", "best price", "platform", "buy", "auto-order", "shopping"];

function plainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldShowVisuals(content: string): boolean {
  const lower = content.toLowerCase();
  if (content.length < 220) return false;
  if (SHOPPING_TERMS.some(term => lower.includes(term))) return false;
  return HEALTH_TERMS.some(term => lower.includes(term));
}

function getSection(content: string, names: string[]): string {
  const escapedNames = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:^|\\n)#{1,4}\\s*(?:${escapedNames})[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`, "i");
  return regex.exec(content)?.[1]?.trim() || "";
}

function firstUsefulLine(value: string, fallback: string): string {
  const line = value
    .split("\n")
    .map(item => item.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .find(item => item.length > 8);
  return plainText(line || fallback).slice(0, 120);
}

function getCareFlow(content: string): CareFlowStep[] {
  const mostImportant = getSection(content, ["Most Important", "Summary", "Important"]);
  const homeCare = getSection(content, ["Home", "Home Care", "Home Remedies", "Ghar Pe", "What You Can Do"]);
  const monitoring = getSection(content, ["Monitor", "Watch", "Next", "Follow", "Recovery"]);
  const warning = getSection(content, ["Warning", "Red Flags", "Doctor", "Seek", "Emergency", "When"]);

  return [
    {
      title: "Understand",
      detail: firstUsefulLine(mostImportant || content, "Identify the main symptom, timing, severity, and triggers."),
      icon: <HeartPulse className="h-4 w-4" />,
      tone: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/15 dark:text-blue-300 dark:border-blue-800/30",
    },
    {
      title: "Start Care",
      detail: firstUsefulLine(homeCare, "Use safe home care first: rest, fluids, food timing, and simple comfort steps."),
      icon: <Home className="h-4 w-4" />,
      tone: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/15 dark:text-emerald-300 dark:border-emerald-800/30",
    },
    {
      title: "Track",
      detail: firstUsefulLine(monitoring, "Monitor changes over the next 24-48 hours and log worsening symptoms."),
      icon: <Clock className="h-4 w-4" />,
      tone: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/15 dark:text-amber-300 dark:border-amber-800/30",
    },
    {
      title: "Escalate",
      detail: firstUsefulLine(warning, "Contact a doctor urgently if red-flag symptoms appear or symptoms worsen."),
      icon: <Stethoscope className="h-4 w-4" />,
      tone: "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/15 dark:text-rose-300 dark:border-rose-800/30",
    },
  ];
}

function extractBullets(content: string, keywords: string[], limit = 3): string[] {
  const lowerKeywords = keywords.map(item => item.toLowerCase());
  return content
    .split("\n")
    .map(item => item.trim())
    .filter(item => /^[-*]\s+/.test(item) || /^\d+\.\s+/.test(item))
    .map(item => plainText(item.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")))
    .filter(item => item.length > 8)
    .filter(item => lowerKeywords.length === 0 || lowerKeywords.some(keyword => item.toLowerCase().includes(keyword)))
    .slice(0, limit);
}

const VisualCareFlow: React.FC<{ content: string }> = ({ content }) => {
  if (!shouldShowVisuals(content)) return null;

  const flow = getCareFlow(content);
  const actions = extractBullets(content, ["drink", "rest", "take", "avoid", "eat", "monitor", "check", "use"], 3);
  const redFlags = extractBullets(content, ["doctor", "urgent", "emergency", "severe", "blood", "breath", "chest", "worse"], 3);

  return (
    <div className="mb-5 space-y-4">
      <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-blue-50 p-4 shadow-sm dark:border-teal-800/30 dark:from-teal-900/10 dark:via-slate-900/40 dark:to-blue-900/10">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
            <ListChecks className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-800 dark:text-white">Care Flow</p>
            <p className="text-[11px] text-slate-400">A simple path to understand and act on this answer</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {flow.map((step, index) => (
            <div key={step.title} className="relative">
              <div className={`min-h-[132px] rounded-xl border p-3 ${step.tone}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 shadow-sm dark:bg-slate-900/50">
                    {step.icon}
                  </span>
                  <span className="text-[10px] font-black opacity-70">0{index + 1}</span>
                </div>
                <p className="text-xs font-extrabold">{step.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90">{step.detail}</p>
              </div>
              {index < flow.length - 1 && (
                <div className="absolute -right-2 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm sm:flex dark:bg-slate-800">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm dark:border-emerald-800/30 dark:bg-[#1a2240]">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Do First</p>
          </div>
          <div className="space-y-2">
            {(actions.length ? actions : [
              "Start with safe home care and hydration.",
              "Track symptoms, temperature, pain level, and timing.",
              "Avoid self-medicating with strong medicines without guidance.",
            ]).map((item, index) => (
              <div key={index} className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-200">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm dark:border-rose-800/30 dark:bg-[#1a2240]">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <p className="text-xs font-extrabold uppercase tracking-wide text-rose-600 dark:text-rose-300">Seek Help If</p>
          </div>
          <div className="space-y-2">
            {(redFlags.length ? redFlags : [
              "Symptoms become severe, unusual, or rapidly worse.",
              "Breathing difficulty, chest pain, fainting, confusion, or dehydration appears.",
              "Symptoms do not improve in the expected time window.",
            ]).map((item, index) => (
              <div key={index} className="flex gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-800 dark:bg-rose-900/15 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const RichMessageRenderer: React.FC<RichMessageRendererProps> = ({ content }) => {
  return (
    <>
      <VisualCareFlow content={content} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="mt-4 mb-3 text-lg font-extrabold text-slate-900 dark:text-white" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="mt-4 mb-3 text-base font-extrabold text-slate-900 dark:text-white" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="mt-5 mb-2 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-3 leading-relaxed text-slate-700 dark:text-slate-300 last:mb-0" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong
              className="rounded-md bg-teal-50 px-1.5 py-0.5 font-bold text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
              {...props}
            />
          ),
          em: ({ node, ...props }) => (
            <em className="font-medium italic text-slate-600 dark:text-slate-400" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="my-3 space-y-2 text-slate-700 dark:text-slate-300" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-3 space-y-2 text-slate-700 dark:text-slate-300" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2 leading-relaxed dark:bg-slate-800/50">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span {...props} />
            </li>
          ),
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/30">
              <table className="min-w-full border-collapse text-left text-sm" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-100/90 text-[11px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 font-bold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border-t border-slate-200 px-4 py-3 align-top text-slate-700 dark:border-slate-700 dark:text-slate-300" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="my-4 rounded-r-xl border-l-4 border-amber-400 bg-amber-50/70 px-4 py-3 text-slate-700 dark:bg-amber-900/10 dark:text-slate-300" {...props} />
          ),
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className={`block overflow-x-auto rounded-2xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100 ${className || ""}`}
                {...props}
              >
                {children}
              </code>
            ),
          pre: ({ node, ...props }) => (
            <pre className="my-4 overflow-x-auto rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-100" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-5 border-slate-200 dark:border-slate-700" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a className="font-medium text-teal-600 underline underline-offset-2 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300" target="_blank" rel="noreferrer" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </>
  );
};

export default RichMessageRenderer;
