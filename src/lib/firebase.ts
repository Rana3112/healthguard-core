// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyALUh97axl5L5VpKPyujj-I_6Uv1vogN1s",
    authDomain: "healthguard-ai-94285.firebaseapp.com",
    projectId: "healthguard-ai-94285",
    storageBucket: "healthguard-ai-94285.firebasestorage.app",
    messagingSenderId: "397043457667",
    appId: "1:397043457667:web:cc29c38bf77a03acfec5b6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
