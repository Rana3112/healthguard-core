import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FadeInSection } from '../../components/FadeInSection';
import { HealthGuardIcon } from '../components/HealthGuardIcon';
import { useAuth } from '../context/AuthContext';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    const [scrolled, setScrolled] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    // Redirect to dashboard if already logged in
    useEffect(() => {
        if (!loading && user) {
            navigate('/app');
        }
    }, [user, loading, navigate]);

    // Handle dark mode toggle
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    return (
        <div
            className="h-screen overflow-y-auto overflow-x-hidden snap-y snap-mandatory font-sans text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] transition-colors duration-300 scroll-smooth"
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 20)}
        >
            {/* Navbar (From Page 1/2) */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-[#0f172a]/90 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800' : 'bg-transparent'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-white font-bold">H</div>
                            <span className="font-display font-bold text-xl tracking-tight">HealthGuard <span className="text-teal-500">AI</span></span>
                            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 bg-teal-500/10 text-teal-600 text-[10px] font-bold rounded-full uppercase tracking-wider">Pro AI</span>
                        </div>
                        <div className="hidden md:flex items-center space-x-8 text-sm font-medium">
                            <a href="#how-it-works" className="hover:text-teal-500 transition-colors">How it works</a>
                            <a href="#features" className="hover:text-teal-500 transition-colors">Features</a>
                            <a href="#fitness" className="hover:text-teal-500 transition-colors">Fitness Hub</a>
                            <a href="#pricing" className="hover:text-teal-500 transition-colors">Pricing</a>
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className={`material-symbols-outlined ${darkMode ? 'hidden' : 'block'}`}>dark_mode</span>
                                <span className={`material-symbols-outlined ${darkMode ? 'block' : 'hidden'} text-yellow-400`}>light_mode</span>
                            </button>
                            <button
                                onClick={() => navigate('/signup')}
                                className="bg-teal-500 hover:bg-teal-600 text-white px-5 py-2.5 rounded-full transition-all shadow-lg shadow-teal-500/20"
                            >
                                Get Started
                            </button>
                        </div>
                        <div className="md:hidden flex items-center gap-4">
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className={`material-symbols-outlined ${darkMode ? 'hidden' : 'block'}`}>dark_mode</span>
                                <span className={`material-symbols-outlined ${darkMode ? 'block' : 'hidden'} text-yellow-400`}>light_mode</span>
                            </button>
                            <span className="material-symbols-outlined text-2xl">menu</span>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section (From Page 1) */}
            <section className="relative min-h-screen snap-start flex flex-col justify-center pt-20 pb-10 overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8 animate-fade-in">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold">
                                <span className="flex h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
                                Trusted by 50,000+ Indians
                            </div>
                            <h1 className="font-display text-5xl md:text-6xl font-extrabold leading-tight">
                                Your AI-Powered <br />
                                <span className="bg-gradient-to-r from-teal-500 to-teal-700 bg-clip-text text-transparent">Health Companion</span>
                            </h1>
                            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
                                Experience personalized healthcare rooted in Indian Wellness. From ancient home remedies to modern clinical diet plans, HealthGuard AI is your 24/7 medical assistant.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <button
                                    onClick={() => navigate('/signup')}
                                    className="bg-teal-500 text-white px-8 py-4 rounded-xl font-semibold shadow-xl shadow-teal-500/30 hover:-translate-y-1 transition-all flex items-center gap-2"
                                >
                                    Start Free Consultation <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                                <button className="px-8 py-4 rounded-xl font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                                    View Demo
                                </button>
                            </div>

                            <div className="pt-8 flex flex-wrap gap-6 items-center border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <span className="material-symbols-outlined text-teal-500">verified_user</span>
                                    <span className="text-xs font-bold uppercase tracking-widest">HIPAA Compliant</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                    <span className="material-symbols-outlined text-teal-500">favorite</span>
                                    <span className="text-xs font-bold uppercase tracking-widest">Made in India</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                    <span className="material-symbols-outlined text-teal-500">encrypted</span>
                                    <span className="text-xs font-bold uppercase tracking-widest">End-to-End Encrypted</span>
                                </div>
                            </div>
                        </div>

                        {/* Hero Visual */}
                        <div className="relative animate-slide-up flex justify-center lg:justify-end pr-4 lg:pr-12">
                            {/* Decorative Background Elements */}
                            <div className="absolute -top-10 -right-10 w-64 h-64 bg-teal-500/10 blur-[100px] rounded-full"></div>
                            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full"></div>

                            {/* Floating Animated Medical SVG icon behind card */}
                            <div className="absolute -top-20 -left-20 lg:-left-12 lg:-top-16 z-0 opacity-80 pointer-events-none drop-shadow-2xl">
                                <HealthGuardIcon size={3.5} animationDuration="4s" />
                            </div>

                            <div className="relative z-10 bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform lg:rotate-2 hover:rotate-0 transition-transform duration-500 max-w-md w-full">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/90 backdrop-blur-sm z-20 relative">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-500">
                                            <span className="material-symbols-outlined">health_and_safety</span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold">HealthGuard Pro</div>
                                            <div className="text-[10px] text-teal-500 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Online
                                            </div>
                                        </div>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-400">more_vert</span>
                                </div>
                                <div className="p-6 space-y-4 h-[400px] flex flex-col justify-end">
                                    <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl rounded-tl-none max-w-[85%] text-sm">
                                        Namaste! I'm HealthGuard Pro. I can suggest <b>Indian home remedies</b>, <b>healthy diet plans</b>, or order medicines for you. How are you feeling today?
                                    </div>
                                    <div className="flex justify-end">
                                        <div className="bg-teal-500 text-white p-4 rounded-2xl rounded-tr-none max-w-[85%] text-sm">
                                            I have a slight fever and throat pain since morning.
                                        </div>
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl rounded-tl-none max-w-[85%] text-sm">
                                        <p className="mb-2">I understand. For throat pain, you might try these home remedies:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            <li>Gargle with warm salt water.</li>
                                            <li>Ginger & Honey tea 3 times a day.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                    <div className="flex-1 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-lg text-xs text-slate-400">Ask about remedies, diet, or medicines...</div>
                                    <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-white">
                                        <span className="material-symbols-outlined text-sm">send</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works (From Page 2) */}
            <section id="how-it-works" className="min-h-screen snap-start flex flex-col justify-center py-20 bg-white dark:bg-[#0f172a]/50">
                <FadeInSection>
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
                            <p className="text-slate-500">Your journey to better health in four simple steps</p>
                        </div>

                        <div className="relative">
                            <div className="hidden lg:block absolute top-[46px] left-[15%] right-[15%] border-t-[3px] border-dashed border-teal-200 dark:border-teal-800 z-0"></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
                                {/* Step 1 */}
                                <div className="relative flex flex-col items-center text-center group">
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-slate-800 shadow-xl border-4 border-slate-50 dark:border-slate-700 flex items-center justify-center mb-6 z-10 transition-transform group-hover:scale-110">
                                        <span className="material-symbols-outlined text-teal-500 text-[40px] leading-none">person_add</span>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">1. Sign Up</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                        Create your HealthGuard profile in seconds. Secure and private.
                                    </p>
                                </div>
                                {/* Step 2 */}
                                <div className="relative flex flex-col items-center text-center group">
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-slate-800 shadow-xl border-4 border-slate-50 dark:border-slate-700 flex items-center justify-center mb-6 z-10 transition-transform group-hover:scale-110">
                                        <span className="material-symbols-outlined text-teal-500 text-[40px] leading-none">chat_bubble</span>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">2. Describe</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                        Share your symptoms or fitness goals in plain English or Hinglish.
                                    </p>
                                </div>
                                {/* Step 3 */}
                                <div className="relative flex flex-col items-center text-center group">
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-slate-800 shadow-xl border-4 border-slate-50 dark:border-slate-700 flex items-center justify-center mb-6 z-10 transition-transform group-hover:scale-110">
                                        <span className="material-symbols-outlined text-teal-500 text-[40px] leading-none">lightbulb</span>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">3. Insights</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                        Receive AI-curated home remedies, diet plans, or medicine info.
                                    </p>
                                </div>
                                {/* Step 4 */}
                                <div className="relative flex flex-col items-center text-center group">
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-slate-800 shadow-xl border-4 border-slate-50 dark:border-slate-700 flex items-center justify-center mb-6 z-10 transition-transform group-hover:scale-110">
                                        <span className="material-symbols-outlined text-teal-500 text-[40px] leading-none">monitor_heart</span>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">4. Track</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                        Monitor your recovery and fitness vitals through our dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* Features Grid (Consolidated) */}
            <section id="features" className="min-h-screen snap-start flex flex-col justify-center py-24 bg-slate-50 dark:bg-[#0f172a]">
                <FadeInSection delay="100ms">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16 space-y-4">
                            <h2 className="font-display text-3xl md:text-4xl font-bold">Comprehensive Wellness Features</h2>
                            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                                Advanced AI integrated with traditional wisdom to provide you a holistic health management experience.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {[
                                { icon: 'home_health', color: 'emerald', title: 'Indian Home Remedies', desc: 'Access a curated database of verified Ayurvedic and traditional Indian remedies for common ailments.' },
                                { icon: 'restaurant', color: 'orange', title: 'Personalized Diet Plans', desc: 'AI-generated meal plans customized for the Indian palate, catering to specific health goals.' },
                                { icon: 'fitness_center', color: 'blue', title: 'Integrated Fitness Hub', desc: 'Track your workouts, target specific muscle groups, and get exercise recommendations.' },
                                { icon: 'prescriptions', color: 'teal', title: 'Medicine Ordering', desc: 'Upload your prescription and order medicines directly through Amazon and other leading pharmacies.' },
                                { icon: 'visibility', color: 'purple', title: 'AI Vision Diagnosis', desc: 'Use your camera to scan prescriptions, symptoms, or food items for instant AI-powered analysis.' },
                                { icon: 'psychology', color: 'pink', title: 'Deep Think Analysis', desc: 'Go beyond simple answers with our Deep Think mode for complex symptom analysis and health research.' }
                            ].map((feature, idx) => (
                                <div key={idx} className="group bg-white dark:bg-[#1e293b] p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-xl hover:-translate-y-1 transition-all">
                                    <div className={`w-14 h-14 bg-${feature.color}-100 dark:bg-${feature.color}-900/30 text-${feature.color}-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                                        <span className="material-symbols-outlined text-3xl">{feature.icon}</span>
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* Fitness Hub Section (Page 2) */}
            <section id="fitness" className="min-h-screen snap-start flex flex-col justify-center py-24 bg-white dark:bg-[#0f172a]/50 border-t border-slate-100 dark:border-slate-800">
                <FadeInSection delay="100ms">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex flex-col lg:flex-row gap-16 items-center">
                            <div className="lg:w-1/2 order-2 lg:order-1">
                                <h2 className="text-4xl font-extrabold mb-6 leading-tight">Your Complete <br /><span className="text-teal-500">Fitness Hub</span></h2>
                                <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                                    Go beyond consultations. Monitor your physical activity, track vital health metrics, and target specific muscle groups with precision.
                                </p>
                                <ul className="space-y-4 mb-10">
                                    {['Real-time BPM & Calorie tracking', 'Muscle-specific workout targeting', 'AI Coaching powered by ExerciseDB'].map((item, i) => (
                                        <li key={i} className="flex items-center gap-3">
                                            <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-500 flex items-center justify-center">
                                                <span className="material-icons-outlined text-sm">check</span>
                                            </span>
                                            <span className="font-medium">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => navigate('/signup')}
                                    className="bg-teal-500 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all flex items-center gap-2"
                                >
                                    Open My Fitness Hub <span className="material-icons-outlined">chevron_right</span>
                                </button>
                            </div>
                            <div className="lg:w-1/2 order-1 lg:order-2 w-full">
                                <div className="bg-white dark:bg-[#1e293b] rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden transform hover:scale-[1.02] transition-transform duration-500">
                                    <div className="p-6 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-teal-50/30 dark:bg-teal-900/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/50 rounded-xl flex items-center justify-center text-teal-600">
                                                <span className="material-icons-outlined">fitness_center</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">Fitness Hub</h4>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Powered by ExerciseDB</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-3 gap-4 mb-8">
                                            <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-2xl text-center border border-orange-100">
                                                <span className="material-icons-outlined text-orange-500 text-lg mb-1">local_fire_department</span>
                                                <div className="text-2xl font-black">850</div>
                                                <div className="text-[10px] font-bold text-orange-600/70 uppercase">Kcal</div>
                                            </div>
                                            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-2xl text-center border border-blue-100">
                                                <span className="material-icons-outlined text-blue-500 text-lg mb-1">favorite</span>
                                                <div className="text-2xl font-black">72</div>
                                                <div className="text-[10px] font-bold text-blue-600/70 uppercase">BPM</div>
                                            </div>
                                            <div className="bg-teal-50 dark:bg-teal-950/20 p-4 rounded-2xl text-center border border-teal-100">
                                                <span className="material-icons-outlined text-teal-500 text-lg mb-1">bolt</span>
                                                <div className="text-2xl font-black">1.3k+</div>
                                                <div className="text-[10px] font-bold text-teal-600/70 uppercase">Exercises</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {['💪 Abdominals', '↔️ Abductors', '🏋️ Adductors', '💪 Biceps'].map((tag, i) => (
                                                <span key={i} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-600">{tag}</span>
                                            ))}
                                            <span className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs font-medium border border-slate-200 text-teal-500 font-bold">More...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* Pricing (Page 3) */}
            <section id="pricing" className="min-h-screen snap-start flex flex-col justify-center py-20 px-6 max-w-7xl mx-auto w-full">
                <FadeInSection delay="100ms">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Choose Your Path to Health</h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Flexible plans designed for everyone.</p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {/* Free Plan */}
                        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-full hover:shadow-lg transition-shadow">
                            <div className="mb-8">
                                <h3 className="text-xl font-semibold mb-2">Free Plan</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">Essential health insights for everyone.</p>
                            </div>
                            <div className="mb-8">
                                <span className="text-4xl font-bold">₹0</span>
                                <span className="text-slate-500">/month</span>
                            </div>
                            <ul className="space-y-4 mb-10 flex-grow">
                                {['Basic Home Remedy Suggestions', 'Health Symptom Checker', 'Daily Medicine Reminders'].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm">
                                        <span className="material-icons-round text-teal-500 text-lg">check_circle</span>
                                        {item}
                                    </li>
                                ))}
                                <li className="flex items-center gap-3 text-sm opacity-50">
                                    <span className="material-icons-round text-lg">cancel</span>
                                    Personalized AI Fitness Coach
                                </li>
                            </ul>
                            <button onClick={() => navigate('/signup')} className="w-full py-3 px-6 rounded-xl border-2 border-teal-500 text-teal-500 font-semibold hover:bg-teal-500 hover:text-white transition-all">
                                Start Free
                            </button>
                        </div>
                        {/* Pro Plan */}
                        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-2xl border-2 border-teal-500 relative flex flex-col h-full transform scale-105 shadow-xl">
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-teal-500 text-white px-4 py-1 rounded-full text-sm font-bold tracking-wide">
                                POPULAR
                            </div>
                            <div className="mb-8">
                                <h3 className="text-xl font-semibold mb-2">Pro Plan</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">Advanced tools for serious wellness.</p>
                            </div>
                            <div className="mb-8">
                                <span className="text-4xl font-bold">₹499</span>
                                <span className="text-slate-500">/month</span>
                            </div>
                            <ul className="space-y-4 mb-10 flex-grow">
                                {['All Free Plan Features', 'Personalized AI Fitness Coach', 'Customized Indian Diet Plans', 'Priority AI Response Time', 'Detailed Health Analytics'].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm">
                                        <span className="material-icons-round text-teal-500 text-lg">check_circle</span>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={async () => {
                                    if (!user) {
                                        navigate('/signup');
                                    } else {
                                        try {
                                            const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5001';
                                            const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ userId: user.uid, email: user.email })
                                            });
                                            const data = await response.json();
                                            if (data.url) window.location.href = data.url;
                                        } catch (e) { console.error(e); }
                                    }
                                }}
                                className="w-full py-3 px-6 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-all font-display"
                            >
                                Get Pro Access
                            </button>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* Testimonials (Page 3) */}
            <section className="min-h-screen snap-start flex flex-col justify-center py-20 bg-slate-50 dark:bg-[#0f172a]/50 w-full">
                <FadeInSection delay="100ms">
                    <div className="max-w-7xl mx-auto px-6">
                        <h2 className="text-2xl font-bold text-center mb-12">Loved by Users Across India</h2>
                        <div className="flex overflow-x-auto gap-6 pb-8 snap-x">
                            <div className="min-w-[300px] md:min-w-[400px] bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 snap-center">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500">R</div>
                                    <div>
                                        <h4 className="font-semibold">Rahul Sharma</h4>
                                        <div className="flex text-amber-400 text-xs gap-0.5">★★★★★</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 italic">"The home remedies suggested for my cold were spot on. It's like having a digital dadi in my pocket!"</p>
                            </div>
                            <div className="min-w-[300px] md:min-w-[400px] bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 snap-center">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500">P</div>
                                    <div>
                                        <h4 className="font-semibold">Priya Verma</h4>
                                        <div className="flex text-amber-400 text-xs gap-0.5">★★★★★</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 italic">"The AI fitness coach really understands Indian diets. I finally found a plan that includes dal and rotis!"</p>
                            </div>
                            <div className="min-w-[300px] md:min-w-[400px] bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 snap-center">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500">A</div>
                                    <div>
                                        <h4 className="font-semibold">Amit Kumar</h4>
                                        <div className="flex text-amber-400 text-xs gap-0.5">★★★★☆</div>
                                    </div>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 italic">"Ordering medicines is a breeze. It integrates so well with the AI chat. Highly recommended for busy people."</p>
                            </div>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* Footer (Top Section - Page 3) */}
            <footer className="snap-start bg-slate-900 flex flex-col justify-center min-h-[50vh] text-slate-300 pt-16 pb-8 border-t border-slate-800 w-full">
                <div className="max-w-7xl mx-auto px-6 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2">
                                <div className="bg-teal-500 w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl">H</div>
                                <span className="text-xl font-bold text-white tracking-tight">HealthGuard <span className="text-teal-500">AI</span></span>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-400">
                                Your trusted Indian AI-powered health companion. Dedicated to making professional wellness advice accessible to every Indian household.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-6">Product</h4>
                            <ul className="space-y-4 text-sm">
                                <li><a href="#" className="hover:text-teal-500 transition-colors">AI Health Chat</a></li>
                                <li><a href="#" className="hover:text-teal-500 transition-colors">Diet Plans</a></li>
                                <li><a href="#" className="hover:text-teal-500 transition-colors">Medicine Delivery</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-6">Company</h4>
                            <ul className="space-y-4 text-sm">
                                <li><a href="#" className="hover:text-teal-500 transition-colors">About Us</a></li>
                                <li><a href="#" className="hover:text-teal-500 transition-colors">Privacy Policy</a></li>
                                <li><a href="#" className="hover:text-teal-500 transition-colors">Terms of Service</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-6">Stay Healthy</h4>
                            <p className="text-sm text-slate-400 mb-6">Get weekly wellness tips.</p>
                            <div className="space-y-3">
                                <input className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-teal-500 focus:ring-teal-500 transition-all" placeholder="Enter your email" type="email" />
                                <button className="w-full bg-teal-500 text-white font-semibold py-2 rounded-xl hover:bg-teal-600 transition-all text-sm">Subscribe</button>
                            </div>
                        </div>
                    </div>
                    <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
                        <p>© 2024 HealthGuard AI. All rights reserved.</p>
                        <p className="flex items-center gap-1">Made with <span className="text-red-500">❤️</span> in India</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
