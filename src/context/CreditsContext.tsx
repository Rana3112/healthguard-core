import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getUserCredits, CreditInfo, checkFeatureAccess, deductCredits, CreditCheckResult, DeductResult } from '../services/creditsService';

interface CreditsContextType {
  credits: number;
  isPro: boolean;
  planGenerationsUsed: number;
  coachChatsUsed: number;
  loading: boolean;
  refreshCredits: () => Promise<void>;
  checkAccess: (feature: string) => Promise<CreditCheckResult>;
  deductCredit: (feature: string) => Promise<DeductResult>;
  showUpgradeModal: boolean;
  upgradeFeature: string;
  setShowUpgradeModal: (show: boolean) => void;
  setUpgradeFeature: (feature: string) => void;
}

const CreditsContext = createContext<CreditsContextType>({
  credits: 100,
  isPro: false,
  planGenerationsUsed: 0,
  coachChatsUsed: 0,
  loading: true,
  refreshCredits: async () => {},
  checkAccess: async () => ({ can_access: true, credits: 100 }),
  deductCredit: async () => ({ success: true, remaining: 100, deducted: 0 }),
  showUpgradeModal: false,
  upgradeFeature: '',
  setShowUpgradeModal: () => {},
  setUpgradeFeature: () => {},
});

export const useCredits = () => useContext(CreditsContext);

interface CreditsProviderProps {
  children: ReactNode;
}

export const CreditsProvider: React.FC<CreditsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [credits, setCredits] = useState(100);
  const [isPro, setIsPro] = useState(false);
  const [planGenerationsUsed, setPlanGenerationsUsed] = useState(0);
  const [coachChatsUsed, setCoachChatsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('');

  const refreshCredits = async () => {
    if (!user?.uid) {
      setCredits(100);
      setIsPro(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const info = await getUserCredits(user.uid);
      if (info) {
        setCredits(info.credits);
        setIsPro(info.is_pro);
        setPlanGenerationsUsed(info.plan_generations_used);
        setCoachChatsUsed(info.coach_chats_used);
      }
    } catch (error) {
      console.error('Error refreshing credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAccess = async (feature: string): Promise<CreditCheckResult> => {
    if (!user?.uid) {
      return { can_access: true, credits: 100 };
    }
    return await checkFeatureAccess(user.uid, feature);
  };

  const deductCredit = async (feature: string): Promise<DeductResult> => {
    if (!user?.uid) {
      return { success: true, remaining: 100, deducted: 0 };
    }
    const result = await deductCredits(user.uid, feature);
    if (result.success) {
      setCredits(result.remaining);
      // Refresh to get updated usage counts
      await refreshCredits();
    }
    return result;
  };

  useEffect(() => {
    refreshCredits();
  }, [user?.uid]);

  return (
    <CreditsContext.Provider
      value={{
        credits,
        isPro,
        planGenerationsUsed,
        coachChatsUsed,
        loading,
        refreshCredits,
        checkAccess,
        deductCredit,
        showUpgradeModal,
        upgradeFeature,
        setShowUpgradeModal,
        setUpgradeFeature,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
};