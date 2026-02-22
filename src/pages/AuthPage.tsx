import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight,
    Check, Activity, ShieldCheck, Heart, AlertCircle
} from 'lucide-react';
import { loginUser, signUpUser, loginWithGoogle, resetPassword } from '../services/firebaseAuth';

const AuthPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLogin, setIsLogin] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Auth States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState(''); // Optional for now

    // UI States
    const [error, setError] = useState<string | null>(null);
    const [resetMessage, setResetMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Toggle based on route or state
    useEffect(() => {
        if (location.pathname === '/signup') {
            setIsLogin(false);
        } else if (location.pathname === '/login') {
            setIsLogin(true);
        }
    }, [location.pathname]);

    const handleToggle = (loginState: boolean) => {
        setIsLogin(loginState);
        setIsForgotPassword(false);
        setError(null);
        setResetMessage(null);
        navigate(loginState ? '/login' : '/signup');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResetMessage(null);
        if (!email || !password || (!isLogin && !fullName)) {
            setError("Please fill in all required fields.");
            return;
        }

        setError(null);
        setLoading(true);

        try {
            if (isLogin) {
                const { error: authError, user } = await loginUser(email, password);
                if (authError) throw new Error(authError);
                if (user) navigate('/app');
            } else {
                const { error: authError, user } = await signUpUser(email, password, fullName);
                if (authError) throw new Error(authError);
                if (user) navigate('/app');
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResetMessage(null);

        if (!email) {
            setError("Please enter your email address.");
            return;
        }

        setLoading(true);

        try {
            const { error: resetError } = await resetPassword(email);
            if (resetError) throw new Error(resetError);
            setResetMessage("Password reset link sent! Check your email to reset your password.");
        } catch (err: any) {
            setError(err.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setError(null);
        setLoading(true);
        try {
            const { error: authError, user } = await loginWithGoogle();
            if (authError) throw new Error(authError);
            if (user) navigate('/app');
        } catch (err: any) {
            setError(err.message || 'Google authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex font-sans text-slate-900 dark:text-white">

            {/* --- Left Panel (Visual) - Hidden on Mobile --- */}
            <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0D9488] to-[#065F56] p-12 flex-col justify-between text-white">

                {/* Decorative Background Elements */}
                <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse-slow"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[30rem] h-[30rem] bg-teal-400/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

                {/* Branding */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shadow-lg border border-white/10">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-2xl font-extrabold tracking-tight">HealthGuard <span className="text-teal-200 italic">AI</span></span>
                </div>

                {/* Hero Content */}
                <div className="relative z-10 max-w-lg mt-12 mb-auto">
                    <h1 className="text-5xl font-extrabold leading-tight mb-6 drop-shadow-sm">
                        {isLogin ? "Your Personal" : "Your Health,"} <br />
                        {isLogin ? "AI Health Coach." : "Our Priority"}
                    </h1>
                    <p className="text-teal-50 text-lg opacity-90 leading-relaxed mb-10 font-medium">
                        Join India's most advanced AI health platform. {isLogin ? "Manage your health with modern AI and ancient Ayurvedic wisdom." : "Personalized wellness and instant care at your fingertips."}
                    </p>

                    {/* Stats Cards (Floating) */}
                    <div className="space-y-5">
                        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-lg p-4 rounded-2xl border border-white/20 shadow-xl hover:scale-105 transition-transform duration-300">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-teal-200 shadow-inner">
                                <Activity className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">15,000+</div>
                                <div className="text-xs uppercase tracking-wider font-bold opacity-70">Active Users in India</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-lg p-4 rounded-2xl border border-white/20 shadow-xl translate-x-8 hover:translate-x-10 transition-all duration-300">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-teal-200 shadow-inner">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold">98.5%</div>
                                <div className="text-xs uppercase tracking-wider font-bold opacity-70">AI Accuracy Rate</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="relative z-10 flex items-center gap-4 text-sm font-medium opacity-80">
                    <div className="flex -space-x-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0D9488] bg-slate-200 overflow-hidden">
                                <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                    <span>Trusted by 10k+ users across Bharat</span>
                </div>
            </div>

            {/* --- Right Panel (Form) --- */}
            <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white dark:bg-slate-950 overflow-y-auto">
                <div className="max-w-md w-full mx-auto">

                    {/* Mobile Header */}
                    <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <span className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">HealthGuard <span className="text-primary italic">AI</span></span>
                    </div>

                    <div className="mb-10 text-center lg:text-left">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-900/30 border border-teal-100 dark:border-teal-800 rounded-full text-primary text-[10px] font-black uppercase tracking-wider mb-4">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                            Pro AI Enabled
                        </div>
                        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-3">
                            {isForgotPassword ? "Reset Password" : isLogin ? "Welcome Back" : "Create Account"}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {isForgotPassword ? "Enter your email to receive a password reset link." : isLogin ? "Please enter your details to sign in" : "Join our community and start your journey"}
                        </p>
                    </div>

                    {/* Toggle Switch */}
                    {!isForgotPassword && (
                        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-8 relative">
                            <button
                                onClick={() => handleToggle(true)}
                                className={`flex-1 pb-4 text-sm font-bold transition-all relative ${isLogin ? 'text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                Log In
                                {isLogin && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                            </button>
                            <button
                                onClick={() => handleToggle(false)}
                                className={`flex-1 pb-4 text-sm font-bold transition-all relative ${!isLogin ? 'text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                Sign Up
                                {!isLogin && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                            </button>
                        </div>
                    )}

                    {/* Success/Error Message */}
                    {resetMessage && (
                        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3 animate-fade-in">
                            <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-green-700 dark:text-green-400 font-medium">{resetMessage}</p>
                        </div>
                    )}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-fade-in">
                            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={isForgotPassword ? handleForgotPasswordSubmit : handleSubmit} className="space-y-5">

                        {(!isLogin && !isForgotPassword) && (
                            <div className="animate-fade-in">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder="Arjun Sharma"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-5 h-5" />
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                                />
                            </div>
                        </div>

                        {(!isLogin && !isForgotPassword) && (
                            <div className="animate-fade-in">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                                <div className="flex gap-3">
                                    <div className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-3.5 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-sm">
                                        +91
                                    </div>
                                    <div className="relative group flex-1">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-5 h-5" />
                                        <input
                                            type="tel"
                                            placeholder="98765 43210"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isForgotPassword && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-5 h-5" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-12 pr-12 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {(isLogin && !isForgotPassword) && (
                            <div className="flex items-center justify-between py-1">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" id="remember" className="peer w-4 h-4 appearance-none border-2 border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 checked:bg-primary checked:border-primary checked:scale-90 transition-all cursor-pointer" />
                                        <Check className="w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                                    </div>
                                    <label htmlFor="remember" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">Remember me</label>
                                </div>
                                <button type="button" onClick={() => { setIsForgotPassword(true); setError(null); setResetMessage(null); }} className="text-sm font-bold text-primary hover:text-teal-700 transition-colors">Forgot Password?</button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary hover:bg-[#0b7a6f] text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group mt-4 relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <span className="relative z-10">{loading ? "Processing..." : isForgotPassword ? "Send Reset Link" : isLogin ? "Log In" : "Create Account"}</span>
                            {!loading && <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />}
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        </button>
                    </form>

                    {isForgotPassword && (
                        <div className="mt-6 text-center">
                            <button type="button" onClick={() => setIsForgotPassword(false)} className="text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors">Back to Log In</button>
                        </div>
                    )}

                    {/* Divider */}
                    {!isForgotPassword && (
                        <>
                            <div className="relative my-8">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase tracking-widest">
                                    <span className="px-4 bg-white dark:bg-slate-950 text-slate-400 font-bold">Or continue with</span>
                                </div>
                            </div>

                            {/* Social Login */}
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={handleGoogleAuth}
                                    disabled={loading}
                                    className="flex col-span-2 items-center justify-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all group disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Continue with Google</span>
                                </button>

                            </div>
                        </>
                    )}

                    {(!isLogin && !isForgotPassword) && (
                        <p className="text-center text-xs text-slate-400 mt-8 leading-relaxed">
                            By signing up, you agree to our <a href="#" className="text-primary font-bold hover:underline">Terms of Service</a> and <a href="#" className="text-primary font-bold hover:underline">Privacy Policy</a>.
                        </p>
                    )}

                    <div className="mt-10 text-center lg:hidden">
                        <p className="text-sm text-slate-400">© 2024 HealthGuard AI</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
