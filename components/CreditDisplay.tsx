import React, { useState } from 'react';
import { Zap, Sparkles, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { useCredits } from '../src/context/CreditsContext';

interface CreditDisplayProps {
  onUpgrade?: () => void;
}

const CreditDisplay: React.FC<CreditDisplayProps> = ({ onUpgrade }) => {
  const { credits, isPro, planGenerationsUsed, coachChatsUsed, loading } = useCredits();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse">
        <div className="w-4 h-4 bg-slate-300 dark:bg-slate-600 rounded"></div>
        <div className="w-12 h-4 bg-slate-300 dark:bg-slate-600 rounded"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
          isPro
            ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/30'
            : credits < 20
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
        }`}
      >
        {isPro ? (
          <Sparkles className="w-4 h-4" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        <span className="font-bold text-sm">{credits}</span>
        {isPro && <span className="text-xs opacity-80">PRO</span>}
        {expanded ? (
          <ChevronUp className="w-3 h-3 opacity-60" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-60" />
        )}
      </button>

      {/* Expanded Info */}
      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-violet-500" />
              <span className="font-bold text-slate-800 dark:text-white">Credit Balance</span>
            </div>
            
            <div className="text-3xl font-extrabold text-violet-600 dark:text-violet-400 mb-4">
              {credits} <span className="text-sm font-medium text-slate-400">credits</span>
            </div>

            {/* Usage Stats */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Plan Generations</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {planGenerationsUsed}/10 free
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Coach Chats</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {coachChatsUsed}/10 free
                </span>
              </div>
            </div>

            {/* Upgrade Button */}
            {!isPro && (
              <button
                onClick={() => {
                  setExpanded(false);
                  onUpgrade?.();
                }}
                className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                Upgrade to Pro
              </button>
            )}

            {isPro && (
              <div className="text-center text-sm text-violet-500 dark:text-violet-400">
                <Sparkles className="w-4 h-4 inline mr-1" />
                Pro Member - Unlimited Access
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditDisplay;