import React from 'react';
import { X, Sparkles, Zap, Lock, CreditCard, ArrowRight } from 'lucide-react';
import { useCredits } from '../src/context/CreditsContext';
import { FEATURE_COSTS, FREE_LIMITS } from '../src/services/creditsService';

const FEATURE_NAMES: Record<string, string> = {
  deep_think: 'Deep Think Mode',
  agent_mode: 'Agent Mode',
  max_deep_think: 'Max Deep Think',
  generate_plan: 'Generate Workout Plan',
  coach_chat: 'AI Coach Chat',
  locked_exercise: 'Premium Exercise',
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  deep_think: 'Access advanced AI reasoning for complex medical questions',
  agent_mode: 'Use the shopping & location agent for medicine search and maps',
  max_deep_think: 'Maximum AI reasoning capability for critical health decisions',
  generate_plan: 'Generate personalized workout plans with detailed exercises',
  coach_chat: 'Chat with your AI fitness coach for personalized advice',
  locked_exercise: 'Unlock premium exercises with GIF demonstrations',
};

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  onUpgrade?: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, feature = '', onUpgrade }) => {
  const { credits, isPro, planGenerationsUsed, coachChatsUsed, setShowUpgradeModal, setUpgradeFeature } = useCredits();

  if (!isOpen) return null;

  const featureName = FEATURE_NAMES[feature] || 'Premium Feature';
  const featureDescription = FEATURE_DESCRIPTIONS[feature] || 'Unlock premium features with credits';
  const featureCost = FEATURE_COSTS[feature] || 1;
  const freeLimit = FREE_LIMITS[feature];

  // Calculate usage for display
  let usageText = '';
  if (feature === 'generate_plan') {
    usageText = `Used ${planGenerationsUsed} of ${freeLimit} free generations`;
  } else if (feature === 'coach_chat') {
    usageText = `Used ${coachChatsUsed} of ${freeLimit} free chats`;
  }

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Show payment flow (for now just close)
      alert('Payment integration coming soon! Contact support to upgrade.');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500 p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Upgrade to Pro</h2>
              <p className="text-sm text-white/80">Unlock premium features</p>
            </div>
          </div>

          {/* Current Credits */}
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-300" />
                <span className="font-medium">Your Credits</span>
              </div>
              <span className="text-2xl font-bold">{credits}</span>
            </div>
            {isPro && (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
                <Sparkles className="w-4 h-4" />
                <span>Pro Member</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Feature Info */}
          {feature && (
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
                  <Lock className="w-5 h-5 text-violet-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 dark:text-white">{featureName}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{featureDescription}</p>
                  {usageText && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{usageText}</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Cost:</span>
                    <span className="px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-bold rounded-full">
                      {featureCost} {featureCost === 1 ? 'credit' : 'credits'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Insufficient Credits Warning */}
          {credits < featureCost && feature && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <Zap className="w-5 h-5" />
                <span className="font-medium">Insufficient Credits</span>
              </div>
              <p className="text-sm text-red-500 dark:text-red-300 mt-2">
                You need {featureCost} credits but only have {credits}. Upgrade to get more credits.
              </p>
            </div>
          )}

          {/* Credit Packages */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Credit Packages
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 border-2 border-violet-200 dark:border-violet-800 rounded-2xl bg-violet-50 dark:bg-violet-900/20 hover:border-violet-400 dark:hover:border-violet-600 transition-colors cursor-pointer">
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">100</div>
                <div className="text-xs text-violet-500 dark:text-violet-300">Credits</div>
                <div className="mt-2 text-lg font-bold text-slate-800 dark:text-white">₹99</div>
              </div>
              <div className="p-4 border-2 border-violet-200 dark:border-violet-800 rounded-2xl bg-violet-50 dark:bg-violet-900/20 hover:border-violet-400 dark:hover:border-violet-600 transition-colors cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                  BEST VALUE
                </div>
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">500</div>
                <div className="text-xs text-violet-500 dark:text-violet-300">Credits</div>
                <div className="mt-2 text-lg font-bold text-slate-800 dark:text-white">₹399</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleUpgrade}
              className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-bold rounded-2xl shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2 transition-all hover:shadow-xl hover:shadow-violet-500/40"
            >
              <CreditCard className="w-5 h-5" />
              Upgrade Now
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;