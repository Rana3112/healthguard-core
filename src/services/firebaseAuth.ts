import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile,
    sendPasswordResetEmail,
    User
} from 'firebase/auth';
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
        const userCredential = await signInWithPopup(auth, googleProvider);
        return { user: userCredential.user, error: null };
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
