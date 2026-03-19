import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    isPro: boolean;
    loading: boolean;
    checkingPro: boolean;
    refreshProStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isPro: false,
    loading: true,
    checkingPro: false,
    refreshProStatus: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isPro, setIsPro] = useState(true);
    const [loading, setLoading] = useState(true);
    const [checkingPro, setCheckingPro] = useState(false);

    const refreshProStatus = async () => {
        // Stripe gate temporarily bypassed for testing
        setIsPro(true);
        setCheckingPro(false);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                setIsPro(true); // Forced true for testing
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (user) {
            refreshProStatus().then(() => setLoading(false));
        } else if (!loading) {
            setLoading(false);
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, isPro, loading, checkingPro, refreshProStatus }}>
            {children}
        </AuthContext.Provider>
    );
};
