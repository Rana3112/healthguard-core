import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    getRedirectResult,
    signOut,
    updateProfile,
    sendPasswordResetEmail,
    signInWithCredential,
    GoogleAuthProvider,
    User
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from '../lib/firebase';

export const signUpUser = async (email: string, password: string, fullName: string) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Update profile with full name
        await updateProfile(userCredential.user, {
            displayName: fullName
        });

        return { user: userCredential.user, error: null };
    } catch (error: any) {
        return { user: null, error: error.message };
    }
};

export const loginUser = async (email: string, password: string) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { user: userCredential.user, error: null };
    } catch (error: any) {
        return { user: null, error: error.message };
    }
};

export const loginWithGoogle = async () => {
    try {
        if (Capacitor.isNativePlatform()) {
            const result = await FirebaseAuthentication.signInWithGoogle({
                skipNativeAuth: true,
                useCredentialManager: false,
            });
            const idToken = result.credential?.idToken ?? null;
            const accessToken = result.credential?.accessToken ?? null;

            if (!idToken && !accessToken) {
                return {
                    user: null,
                    error: 'Google sign-in did not return a credential. Check Firebase SHA fingerprints and google-services.json.',
                };
            }

            const credential = GoogleAuthProvider.credential(idToken, accessToken);
            const userCredential = await signInWithCredential(auth, credential);
            return { user: userCredential.user, error: null };
        }

        const userCredential = await signInWithPopup(auth, googleProvider);
        return { user: userCredential.user, error: null };
    } catch (error: any) {
        return { user: null, error: error.message };
    }
};

export const completeGoogleRedirectSignIn = async () => {
    try {
        const userCredential = await getRedirectResult(auth);
        return { user: userCredential?.user || null, error: null };
    } catch (error: any) {
        return { user: null, error: error.message };
    }
};

export const logoutUser = async () => {
    try {
        await signOut(auth);
        return { error: null };
    } catch (error: any) {
        return { error: error.message };
    }
};

export const resetPassword = async (email: string) => {
    try {
        await sendPasswordResetEmail(auth, email);
        return { error: null };
    } catch (error: any) {
        return { error: error.message };
    }
};
