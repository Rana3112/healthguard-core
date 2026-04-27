import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dumbbell, Filter, ChevronDown, ChevronUp, Loader2, AlertCircle, Search, X, Flame, Heart, PlayCircle, Apple, Scale, Ruler, Download, Sparkles, Send, FileText, ArrowLeft, Bot, Activity, Image as ImageIcon, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import RichMessageRenderer from './RichMessageRenderer';
import { sendMessageToAgent } from '../services/geminiService';
import { generateCardFromGraphSignal } from '../services/followUpGenerator';
import { retrieveVitalsForFitness } from '../services/vitalsRAG';
import { ClarificationCard, ClarificationOption } from '../types';
import { TextInputFlashcard } from './TextChatInterface';
import Model from 'react-body-highlighter';
import { getBackendUrl } from '../src/lib/backendUrl';
import {
    getBundledEquipment,
    getBundledExercisesByTarget,
    getBundledMuscles,
    searchBundledExercises,
} from '../src/lib/localExerciseDb';

const BACKEND_URL = getBackendUrl();

// Helper function to detect exercise queries
const isExerciseQuery = (message: string): boolean => {
    const exerciseKeywords = [
        'exercise', 'exercises', 'suggest', 'recommend', 'give me',
        'show me', 'what exercises', 'abs exercise', 'leg exercise',
        'chest exercise', 'back exercise', 'shoulder exercise',
        'bicep exercise', 'tricep exercise', 'abdominal exercise',
        'core exercise', 'workout', 'routine', 'movement',
        'leg workout', 'abs workout', 'chest workout', 'back workout'
    ];
    const messageLower = message.toLowerCase();
    return exerciseKeywords.some(keyword => messageLower.includes(keyword));
};

// Helper function to search exercises from backend
const searchExercisesFromDB = async (query: string, limit: number = 8) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/search-exercises`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit })
        });
        if (response.ok) {
            const data = await response.json();
            return data.exercises || [];
        }
    } catch (error) {
        console.error('Exercise search error:', error);
    }

    try {
        return await searchBundledExercises(query, limit);
    } catch (error) {
        console.error('Bundled exercise search error:', error);
        return [];
    }
};

const mapTargetToMuscle = (target: string): { muscles: string[], type: 'anterior' | 'posterior' } => {
    const t = target.toLowerCase();
    const mapping: Record<string, { muscles: string[], type: 'anterior' | 'posterior' }> = {
        'pectorals': { muscles: ['chest'], type: 'anterior' },
        'chest': { muscles: ['chest'], type: 'anterior' },
        'lats': { muscles: ['upper-back'], type: 'posterior' },
        'glutes': { muscles: ['gluteal'], type: 'posterior' },
        'abs': { muscles: ['abs'], type: 'anterior' },
        'abdominals': { muscles: ['abs'], type: 'anterior' },
        'biceps': { muscles: ['biceps'], type: 'anterior' },
        'triceps': { muscles: ['triceps'], type: 'posterior' },
        'delts': { muscles: ['front-deltoids', 'back-deltoids'], type: 'anterior' },
        'shoulders': { muscles: ['front-deltoids', 'back-deltoids'], type: 'anterior' },
        'quads': { muscles: ['quadriceps'], type: 'anterior' },
        'quadriceps': { muscles: ['quadriceps'], type: 'anterior' },
        'hamstrings': { muscles: ['hamstring'], type: 'posterior' },
        'calves': { muscles: ['calves'], type: 'posterior' },
        'upper back': { muscles: ['upper-back'], type: 'posterior' },
        'middle back': { muscles: ['lower-back'], type: 'posterior' },
        'lower back': { muscles: ['lower-back'], type: 'posterior' },
        'traps': { muscles: ['trapezius'], type: 'posterior' },
        'neck': { muscles: ['head', 'neck'], type: 'anterior' },
        'forearms': { muscles: ['forearm'], type: 'anterior' },
        'abductors': { muscles: ['abductors'], type: 'posterior' },
        'adductors': { muscles: ['adductor'], type: 'anterior' },
        'cardiovascular system': { muscles: ['chest'], type: 'anterior' },
        'spine': { muscles: ['lower-back'], type: 'posterior' },
        'serratus anterior': { muscles: ['obliques'], type: 'anterior' },
        'levator scapulae': { muscles: ['trapezius'], type: 'posterior' },
    };
    return mapping[t] || { muscles: [], type: 'anterior' };
};

// --- Fallback Data (ExerciseDB Style) ---
const FALLBACK_TARGETS = [
    'abductors', 'abs', 'adductors', 'biceps', 'calves', 'cardiovascular system', 'delts', 'forearms', 'glutes', 'hamstrings', 'lats', 'levator scapulae', 'pectorals', 'quads', 'serratus anterior', 'spine', 'traps', 'triceps', 'upper back'
];

const FALLBACK_EQUIPMENT = [
    'assisted', 'band', 'barbell', 'body weight', 'bosu ball', 'cable', 'dumbbell', 'elliptical machine', 'ez curl bar', 'hammer', 'kettlebell', 'leverage machine', 'medicine ball', 'olympic barbell', 'resistance band', 'roller', 'rope', 'skierg machine', 'sled machine', 'smith machine', 'stability ball', 'stationary bike', 'stepmill machine', 'tire', 'trap bar', 'upper body ergometer', 'weighted', 'wheel roller'
];

interface Exercise {
    id: string;
    name: string;
    target: string;
    bodyPart: string;
    equipment: string;
    gifUrl: string;
    secondaryMuscles: string[];
    instructions: string[];
    sets?: number;
    reps?: string;
    rest_seconds?: number;
    tips?: string;
}

const FALLBACK_EXERCISES: Record<string, Exercise[]> = {
    'pectorals': [
        {
            id: '0001',
            name: 'Barbell Bench Press',
            target: 'pectorals',
            bodyPart: 'chest',
            equipment: 'barbell',
            gifUrl: 'https://v2.exercisedb.io/image/HwNaqOa2-83M-i', // Placeholder
            secondaryMuscles: ['triceps', 'delts'],
            instructions: ['Lie on a flat bench.', 'Grip the barbell slightly wider than shoulder width.', 'Lower the bar to your chest.', 'Press back up.']
        },
        {
            id: '0002',
            name: 'Dumbbell Flys',
            target: 'pectorals',
            bodyPart: 'chest',
            equipment: 'dumbbell',
            gifUrl: '',
            secondaryMuscles: ['delts'],
            instructions: ['Lie on a bench with dumbbells.', 'Lower arms to sides.', 'Bring them back together.']
        }
    ],
    'biceps': [
        {
            id: '0003',
            name: 'Barbell Curl',
            target: 'biceps',
            bodyPart: 'upper arms',
            equipment: 'barbell',
            gifUrl: '',
            secondaryMuscles: ['forearms'],
            instructions: ['Stand up holding a barbell.', 'Curl the weight up.', 'Lower it back down.']
        }
    ]
};

const muscleEmoji: Record<string, string> = {
    'pectorals': '🫁', 'biceps': '💪', 'triceps': '🦾', 'delts': '🏋️',
    'upper back': '🔙', 'abs': '🎯', 'quads': '🦵', 'hamstrings': '🦿',
    'glutes': '🍑', 'calves': '🐄', 'forearms': '🤜', 'traps': '⬆️',
    'lats': '🪂', 'spine': '🦴', 'cardiovascular system': '🫀',
    'abductors': '↔️', 'adductors': '🤸',
};

// --- Nutrition Types ---
interface Nutrition {
    daily_calories?: number;
    protein_grams?: number;
    pre_workout_shake?: string;
    post_workout_shake?: string;
    homemade_protein_shake?: string;
    diet_tips?: string[];
}

// --- Types for AI Coach ---
interface WorkoutDay {
    day_name: string;
    exercises: Exercise[];
}

interface WorkoutPlan {
    analysis: string;
    goal: string;
    days: WorkoutDay[];
    nutrition?: Nutrition;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    type: 'text' | 'plan';
    planData?: WorkoutPlan;
    suggestedQuestionCards?: ClarificationCard[];
    image?: string;
}

const OptionFlashcard: React.FC<{
    card: ClarificationCard;
    isLoading: boolean;
    onSelect: (option: ClarificationOption) => void;
}> = ({ card, isLoading, onSelect }) => {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-2.5">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{card.question}</p>
            <div className="flex flex-wrap gap-2">
                {(card.options || []).map((option, optionIndex) => (
                    <button
                        key={`${option.label}-${optionIndex}`}
                        onClick={() => onSelect(option)}
                        disabled={isLoading}
                        className="text-[11px] rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50"
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const FitnessPanel: React.FC = () => {
    // --- Workout Plan State (Local) ---
    const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);

    // --- Plan & Chat History ---
    const PLAN_HISTORY_KEY = 'fitness_plan_history';
    const [planHistory, setPlanHistory] = useState<{ id: string; date: number; goal: string; days: number; plan: WorkoutPlan; chat: ChatMessage[] }[]>([]);

    // Load history from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(PLAN_HISTORY_KEY);
            if (raw) setPlanHistory(JSON.parse(raw));
        } catch { }
    }, []);

    // Save plan + chat to history
    const saveToHistory = (plan: WorkoutPlan, chat: ChatMessage[]) => {
        const entry = {
            id: Date.now().toString(),
            date: Date.now(),
            goal: plan.goal || 'Workout Plan',
            days: plan.days?.length || 0,
            plan,
            chat: chat.filter(m => m.type === 'text'),
        };
        const updated = [entry, ...planHistory].slice(0, 10);
        setPlanHistory(updated);
        localStorage.setItem(PLAN_HISTORY_KEY, JSON.stringify(updated));
    };

    // Load a saved plan back into coach view
    const loadFromHistory = (entry: { plan: WorkoutPlan; chat: ChatMessage[] }) => {
        setWorkoutPlan(entry.plan);
        setChatMessages(entry.chat);
        setCoachStep('success');
        setView('coach');
    };

    // Delete a history entry
    const deleteFromHistory = (id: string) => {
        const updated = planHistory.filter(h => h.id !== id);
        setPlanHistory(updated);
        localStorage.setItem(PLAN_HISTORY_KEY, JSON.stringify(updated));
    };

    // --- Browse Mode State ---
    const [targets, setTargets] = useState<string[]>(FALLBACK_TARGETS);
    const [equipmentList, setEquipmentList] = useState<string[]>(FALLBACK_EQUIPMENT);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
    const [selectedEquipment, setSelectedEquipment] = useState<string>('');
    const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [usingFallback, setUsingFallback] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // --- AI Coach State ---
    const [view, setView] = useState<'browse' | 'coach'>('browse');
    const [coachStep, setCoachStep] = useState<'form' | 'success'>('form');
    const [userStats, setUserStats] = useState({ age: '', weight: '', height: '', diet: 5, workoutIntensity: 'intermediate' });
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedImage, setSelectedImage] = useState<{ file: File; base64: string } | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const workoutPlanCacheRef = useRef<Map<string, WorkoutPlan>>(new Map());
    const [savedToast, setSavedToast] = useState(false);

    // Sync local plan view with global plan
    useEffect(() => {
        if (workoutPlan) {
            setView('coach');
            setCoachStep('success');
        }
    }, [workoutPlan]);

    // Fetch targets (muscles) on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/muscles`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setTargets(data);
                        setUsingFallback(false);
                        return;
                    }
                }
            } catch {
                // Fall through to bundled data.
            }

            try {
                const bundledTargets = await getBundledMuscles();
                if (bundledTargets.length > 0) {
                    setTargets(bundledTargets);
                }
            } catch (error) {
                console.error('Bundled muscles fallback error:', error);
            }

            setUsingFallback(true);
        })();
    }, []);

    // Fetch equipment on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/categories`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setEquipmentList(data);
                        return;
                    }
                }
            } catch {
                // Fall through to bundled data.
            }

            try {
                const bundledEquipment = await getBundledEquipment();
                if (bundledEquipment.length > 0) {
                    setEquipmentList(bundledEquipment);
                }
            } catch (error) {
                console.error('Bundled equipment fallback error:', error);
            }
        })();
    }, []);

    const useFallbackExercises = useCallback(async (target: string, equip: string) => {
        try {
            const bundledExercises = await getBundledExercisesByTarget(target, equip);
            if (bundledExercises.length > 0) {
                setUsingFallback(true);
                setExercises(bundledExercises);
                setLoading(false);
                return;
            }
        } catch (error) {
            console.error('Bundled exercises fallback error:', error);
        }

        setUsingFallback(true);
        let fallback = FALLBACK_EXERCISES[target] || [];
        if (equip) {
            fallback = fallback.filter(e => e.equipment === equip);
        }
        setExercises(fallback);
        setLoading(false);
    }, []);

    const fetchExercises = useCallback(async (target: string, equip: string) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.set('muscle', target); // Backend maps this to /exercises/target/{target}

            const res = await fetch(`${BACKEND_URL}/exercises?${params}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const filtered = equip
                        ? data.filter((e: any) => e.equipment === equip)
                        : data;

                    setExercises(filtered.map((e: any) => ({
                        id: e.id,
                        name: e.name,
                        target: e.target,
                        bodyPart: e.bodyPart,
                        equipment: e.equipment,
                        gifUrl: e.gifUrl,
                        secondaryMuscles: e.secondaryMuscles || [],
                        instructions: e.instructions || [],
                    })));
                    setUsingFallback(false);
                    setLoading(false);
                    return;
                }
            }

            await useFallbackExercises(target, equip);
        } catch {
            await useFallbackExercises(target, equip);
        }
    }, [useFallbackExercises]);

    const handleTargetClick = (target: string) => {
        if (selectedTarget === target) {
            setSelectedTarget(null);
            setExercises([]);
            return;
        }
        setSelectedTarget(target);
        setExpandedExercise(null);
        fetchExercises(target, selectedEquipment);
    };

    const handleEquipmentChange = (equip: string) => {
        setSelectedEquipment(equip);
        if (selectedTarget) {
            fetchExercises(selectedTarget, equip);
        }
    };

    // --- AI Coach Logic ---
    const generatePlan = async () => {
        if (!userStats.weight || !userStats.height) return;

        setIsTyping(true);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // allow long-running generation

            const res = await fetch(`${BACKEND_URL}/generate_workout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    age: userStats.age,
                    weight: userStats.weight,
                    height: userStats.height,
                    diet_score: userStats.diet,
                    workout_intensity: userStats.workoutIntensity
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to generate plan");
            }

            const data = await res.json();
            // Generate a new plan each time - no caching
            setWorkoutPlan(data);
            setCoachStep('success');
        } catch (err: any) {
            console.error("Plan Gen Error:", err);
            alert(`Failed to generate plan: ${err.name === 'AbortError' ? 'Request timed out. Please try again.' : (err.message || 'Unknown error')}`);
        } finally {
            setIsTyping(false);
        }
    };

    const sendCoachMessage = async (messageText: string, imageBase64?: string) => {
        if (!messageText.trim() && !imageBase64) return;

        const newUserMsg: ChatMessage = { 
            role: 'user', 
            content: messageText || 'Analyze this image', 
            type: 'text',
            image: imageBase64
        };
        setChatMessages(prev => [...prev, newUserMsg]);
        setIsTyping(true);

        // Check if user is asking for exercise suggestions
        if (isExerciseQuery(messageText)) {
            try {
                const exercises = await searchExercisesFromDB(messageText, 8);
                
                if (exercises && exercises.length > 0) {
                    // Format exercises for display
                    const formattedExercises = exercises.map((ex: any) => ({
                        id: ex.id || `ex-${Date.now()}-${Math.random()}`,
                        name: ex.name,
                        target: ex.target,
                        equipment: ex.equipment,
                        sets: 3,
                        reps: "10-12",
                        rest_seconds: 60,
                        instructions: ex.instructions || [],
                        gifUrl: ex.gifUrl || "",
                        secondaryMuscles: ex.secondaryMuscles || [],
                    }));

                    const aiMsg: ChatMessage = {
                        role: 'assistant',
                        content: `Here are some exercises I found for you from our database of over 2,000 exercises. I've selected the most relevant ones based on your query:`,
                        type: 'plan',
                        planData: {
                            analysis: `Exercise suggestions for: "${messageText}"`,
                            goal: "Exercise Search Results",
                            days: [{
                                day_name: "Suggested Exercises",
                                exercises: formattedExercises
                            }],
                            nutrition: {
                                daily_calories: 0,
                                protein_grams: 0,
                                pre_workout_shake: "",
                                post_workout_shake: "",
                                homemade_protein_shake: "",
                                diet_tips: []
                            }
                        }
                    };

                    setChatMessages(prev => [...prev, aiMsg]);
                    setIsTyping(false);
                    return;
                }
            } catch (error) {
                console.error('Exercise search failed:', error);
                // Fall through to regular chat
            }
        }

        try {
            const historyForService: any[] = chatMessages.map(m => ({
                id: Date.now().toString(),
                role: m.role === 'user' ? 'user' : 'model',
                text: m.content
            }));

            const rawBase64 = imageBase64 ? imageBase64.split(',')[1] : undefined;
            const mode = rawBase64 ? 'vision' : 'standard';
            const vitalsForCoach = retrieveVitalsForFitness();

            const result: any = await sendMessageToAgent(
                historyForService,
                (messageText || 'Analyze this image in detail. If it is a gym instrument, explain how to use it. If it is a workout technique, analyze the form. If it is food, provide nutritional information and whether it fits a fitness diet.') + "\n\n(CRITICAL INSTRUCTION: If recommending a diet or food, you MUST prioritize affordable, common Indian middle-class cuisine. Suggest everyday ingredients (like moong dal, paneer, sattu, eggs, soy chunks, local seasonal veggies) that are cheap and easily available to the average Indian family. Avoid expensive western diets like salmon, avocado, or quinoa unless specifically asked.\n\nAlso, you MUST use rich Markdown formatting. Use ### for headings, **bold** for emphasis, `- ` for bullet point lists, and Markdown tables with `|` for any tabular data.\n\nIMPORTANT: If the user is asking for exercise suggestions, tell them to use specific muscle group names like 'abs', 'chest', 'legs', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves' so I can search our database of over 2,000 exercises.)",
                rawBase64,
                false,
                undefined,
                mode,
                undefined,
                vitalsForCoach || undefined
            );

            const graphCard = result.graphOutput
                ? generateCardFromGraphSignal(result.graphOutput)
                : null;

            const aiMsg: ChatMessage = {
                role: 'assistant',
                content: result.text || "I'm having trouble responding.",
                type: 'text',
                suggestedQuestionCards: Array.isArray(result.suggestedQuestionCards)
                    ? result.suggestedQuestionCards
                    : graphCard
                        ? [graphCard]
                    : undefined
            };

            setChatMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            console.error(err);
            setChatMessages(prev => [
                ...prev,
                { role: 'assistant', content: "Sorry, I encountered an error. Please try again.", type: 'text' }
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImage({ file, base64: reader.result as string });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleRemoveImage = () => {
        setSelectedImage(null);
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() && !selectedImage) return;
        const outgoing = inputMessage;
        const imageToSend = selectedImage;
        setInputMessage('');
        setSelectedImage(null);
        await sendCoachMessage(outgoing, imageToSend?.base64);
    };

    const handleCoachFlashcardOptionClick = async (card: ClarificationCard, option: ClarificationOption) => {
        const outboundText = option.userStatement?.trim() || `For "${card.question}", my answer is: ${option.label}.`;
        await sendCoachMessage(outboundText);
    };

    // Scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, isTyping]);

    const latestAssistantMessageIndex = [...chatMessages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === 'assistant')?.index;

    const downloadPDF = (plan: WorkoutPlan) => {
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.setTextColor(13, 148, 136); // Teal-600
        doc.text("HealthGuard AI - Personal Workout Plan", 14, 22);

        doc.setFontSize(12);
        doc.setTextColor(60, 60, 60);
        doc.text(`Goal: ${plan.goal}`, 14, 32);
        doc.text(`Diet Score: ${userStats.diet}/10`, 14, 38);

        // Analysis
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const splitAnalysis = doc.splitTextToSize(`Analysis: ${plan.analysis}`, 180);
        doc.text(splitAnalysis, 14, 48);

        // Table
        let yPos = 60;

        plan.days.forEach((day, index) => {
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(day.day_name, 14, yPos);
            yPos += 5;

            const tableData = day.exercises.map(ex => [
                ex.name,
                ex.target,
                ex.equipment,
                ex.instructions ? ex.instructions.slice(0, 2).join(' ') : 'See app for details'
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Exercise', 'Target', 'Equipment', 'Instructions']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [13, 148, 136] }, // Teal-600
                margin: { top: 10 },
            });

            // @ts-ignore
            yPos = doc.lastAutoTable.finalY + 15;

            // Page break check if needed (autoTable handles generic, but manual headings might need check)
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });

        doc.save("workout_plan.pdf");
    };

    const filteredExercises = searchQuery
        ? exercises.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : exercises;

    return (
        <aside className="w-full h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden min-h-0">
            {/* Header */}
            <div className="p-4 sm:p-6 pb-0">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-600/10 rounded-xl flex items-center justify-center text-teal-600">
                            <Dumbbell className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold text-sm leading-tight text-slate-800 dark:text-slate-100">Fitness Hub</h2>
                            <p className="text-[10px] text-slate-400">Powered by ExerciseDB</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (view === 'browse') {
                                setView('coach');
                                setCoachStep('form');
                            } else {
                                setView('browse');
                            }
                        }}
                        className="px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 hover:bg-teal-100"
                    >
                        {view === 'browse' ? <>ASK AI coach <Sparkles className="w-3 h-3" /></> : <>BROWSE <ArrowLeft className="w-3 h-3" /></>}
                    </button>
                </div>

                {/* Stats Cards (Only in Browse Mode) */}
                {view === 'browse' && (
                    <div className="grid grid-cols-3 gap-2 mb-8">
                        <div className="bg-orange-50 dark:bg-orange-900/10 p-3 rounded-2xl border border-orange-100 dark:border-orange-900/20 text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-white/40 dark:bg-transparent backdrop-blur-[1px]"></div>
                            <Flame className="w-8 h-8 absolute -right-1 -bottom-1 text-orange-200 dark:text-orange-900/20 group-hover:scale-110 transition-transform" />
                            <div className="relative z-10">
                                <p className="text-xl font-black text-slate-900 dark:text-slate-100">850</p>
                                <p className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">Kcal</p>
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/20 text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-white/40 dark:bg-transparent backdrop-blur-[1px]"></div>
                            <Heart className="w-8 h-8 absolute -right-1 -bottom-1 text-blue-200 dark:text-blue-900/20 group-hover:scale-110 transition-transform" />
                            <div className="relative z-10">
                                <p className="text-xl font-black text-slate-900 dark:text-slate-100">72</p>
                                <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">BPM</p>
                            </div>
                        </div>
                        <div className="bg-teal-50 dark:bg-teal-900/10 p-3 rounded-2xl border border-teal-100 dark:border-teal-900/20 text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-white/40 dark:bg-transparent backdrop-blur-[1px]"></div>
                            <Dumbbell className="w-8 h-8 absolute -right-1 -bottom-1 text-teal-200 dark:text-teal-900/20 group-hover:scale-110 transition-transform" />
                            <div className="relative z-10">
                                <p className="text-xl font-black text-slate-900 dark:text-slate-100">1.3k+</p>
                                <p className="text-[9px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest">Exercises</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className={`
                flex-1 overflow-y-auto pb-8 min-h-0
                ${view === 'browse' ? 'px-4 sm:px-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-300 dark:hover:scrollbar-thumb-slate-600' : 'px-2 sm:px-4 scrollbar-hide'}
            `}>
                {view === 'browse' && (
                    <>
                        {/* Target Muscles */}
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg shadow-sm">
                                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                                </div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Target Muscles</h3>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {targets.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => handleTargetClick(t)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 cursor-pointer shadow-sm capitalize border ${selectedTarget === t
                                            ? 'bg-gradient-to-r from-orange-400 to-orange-500 border-transparent text-white shadow-orange-500/30 ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-slate-900'
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-300 hover:text-orange-500 hover:shadow-md hover:-translate-y-0.5'
                                            }`}
                                    >
                                        {t.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Plan & Chat History */}
                        {planHistory.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg shadow-sm">
                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Saved Plans & Chats</h3>
                                    <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full ml-auto">
                                        {planHistory.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {planHistory.map((entry) => {
                                        const date = new Date(entry.date);
                                        const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                                        const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
                                        return (
                                            <div key={entry.id} className="bg-white dark:bg-[#1a2240] rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
                                                <div className="grid grid-cols-[auto,1fr,auto] items-start gap-3 px-4 py-3 sm:items-center">
                                                    <div className="w-9 h-9 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center shrink-0">
                                                        <Dumbbell className="w-4 h-4 text-amber-500" />
                                                    </div>
                                                    <div className="min-w-0 cursor-pointer" onClick={() => loadFromHistory(entry)}>
                                                        <p className="truncate text-xs font-bold leading-snug text-slate-700 hover:text-teal-600 dark:text-slate-200">{entry.goal}</p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            <span className="whitespace-nowrap text-[10px] text-slate-400">{dateStr} • {timeStr}</span>
                                                            <span className="shrink-0 whitespace-nowrap rounded bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-600 dark:bg-teal-900/20 dark:text-teal-400">{entry.days} days</span>
                                                            {entry.chat.length > 0 && (
                                                                <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">{entry.chat.length} msgs</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 self-center shrink-0">
                                                        <button
                                                            onClick={() => loadFromHistory(entry)}
                                                            className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 transition-colors"
                                                            title="Load plan"
                                                        >
                                                            <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteFromHistory(entry.id)}
                                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Selected Muscle Heatmap */}
                        {selectedTarget && (() => {
                            const mapped = mapTargetToMuscle(selectedTarget);
                            if (mapped.muscles.length > 0) {
                                return (
                                    <div className="mb-8 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/80 dark:to-slate-900/50 rounded-[2rem] p-6 sm:p-8 border border-slate-200/60 dark:border-slate-700/50 flex flex-row items-center justify-between shadow-sm animate-in fade-in zoom-in-95 duration-500 overflow-hidden relative group">
                                        <div className="absolute inset-0 bg-orange-500/5 dark:bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                        <div className="relative z-10 flex-1">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-full mb-3 backdrop-blur-md shadow-sm">
                                                <Activity className="w-3.5 h-3.5 text-orange-500" />
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Target Heatmap</span>
                                            </div>
                                            <h4 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 capitalize tracking-tight mb-2">{selectedTarget.replace(/_/g, ' ')}</h4>
                                            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 max-w-[200px] leading-relaxed">
                                                These muscles are primarily activated by the specialized exercises below.
                                            </p>
                                        </div>
                                        <div className="w-32 sm:w-40 relative z-10 flex items-center justify-center -my-6 -mr-2 sm:-my-10 drop-shadow-xl dark:drop-shadow-none mix-blend-multiply dark:mix-blend-lighten pointer-events-none">
                                            <Model
                                                data={[{ name: selectedTarget, muscles: mapped.muscles as any }]}
                                                type={mapped.type}
                                                style={{ width: '100%', padding: '0' }}
                                                highlightedColors={['#f97316', '#ea580c']}
                                            />
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Exercises List */}
                        {selectedTarget && (
                            <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Exercises ({filteredExercises.length})</h4>
                                </div>
                                {loading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
                                ) : (
                                                <div className="space-y-3">
                                        {filteredExercises.map(ex => (
                                            <div key={ex.id}
                                                className={`bg-white dark:bg-slate-800/80 p-3 rounded-xl border transition-all duration-300 cursor-pointer shadow-sm group relative
                                                 ${expandedExercise === ex.id
                                                        ? 'border-teal-300 dark:border-teal-700 shadow-md ring-1 ring-teal-500/20 z-40 hover:z-50'
                                                        : 'border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-lg hover:-translate-y-1 z-10'}`}
                                                onClick={() => setExpandedExercise(expandedExercise === ex.id ? null : ex.id)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shadow-inner group-hover:shadow-md transition-all flex items-center justify-center">
                                                        <Dumbbell className="w-5 h-5 text-slate-300" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{ex.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                                {ex.equipment}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="self-center">
                                                        {expandedExercise === ex.id ? (
                                                            <ChevronUp className="w-4 h-4 text-teal-500" />
                                                        ) : (
                                                            <PlayCircle className="w-5 h-5 text-slate-300 group-hover:text-teal-500 group-hover:scale-110 transition-all duration-300" />
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                <div className={`grid transition-all duration-300 ease-in-out ${expandedExercise === ex.id ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
                                                    <div className="overflow-hidden [&:has(:hover)]:overflow-visible">

                                                        {/* Large Exercise Visual Banner */}
                                                        {ex.gifUrl && (
                                                            <div className="w-full rounded-xl mb-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-inner relative flex items-center justify-center z-10 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:z-50 hover:scale-[1.05] hover:-translate-y-2 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] hover:ring-[6px] ring-white/90 dark:ring-slate-800/90 cursor-zoom-in overflow-hidden">
                                                                <img
                                                                    src={ex.gifUrl}
                                                                    className="w-full h-auto object-contain mix-blend-multiply dark:mix-blend-normal"
                                                                    loading="lazy"
                                                                    alt={ex.name}
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col md:flex-row gap-4 border-t border-slate-100 dark:border-slate-700 pt-4 pb-2">
                                                            <div className="flex-1 text-xs text-slate-600 dark:text-slate-300">
                                                                <h5 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-teal-500" /> Instructions</h5>
                                                                <ol className="space-y-2 pl-2">
                                                                    {ex.instructions.map((inst, i) => (
                                                                        <li key={i} className="flex gap-2">
                                                                            <span className="font-bold text-teal-500 shrink-0">{i + 1}.</span>
                                                                            <span className="leading-relaxed">{inst}</span>
                                                                        </li>
                                                                    ))}
                                                                </ol>
                                                            </div>
                                                            {(() => {
                                                                const mapped = mapTargetToMuscle(ex.target);
                                                                if (mapped.muscles.length > 0) {
                                                                    return (
                                                                        <div className="w-full sm:w-32 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 shrink-0 border border-slate-100 dark:border-slate-800 shadow-inner">
                                                                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Muscle Focus</h5>
                                                                            <p className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 capitalize mb-2">{ex.target}</p>
                                                                            <div className="w-24 overflow-hidden dark:opacity-80 mix-blend-multiply dark:mix-blend-lighten pointer-events-none">
                                                                                <Model
                                                                                    data={[{ name: ex.name, muscles: mapped.muscles as any }]}
                                                                                    type={mapped.type}
                                                                                    style={{ width: '100%', padding: '0.25rem' }}
                                                                                    highlightedColors={['#14b8a6', '#0d9488']}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* AI COACH VIEW */}
                {view === 'coach' && (
                            <div className="flex-1 flex flex-col h-full min-h-0">
                        {coachStep === 'form' ? (
                            <div className="space-y-3 overflow-y-auto min-h-0 pb-24 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                <div className="text-center pt-1">
                                    <div className="inline-flex items-center justify-center w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-full mb-2">
                                        <Bot className="w-5 h-5 text-teal-600" />
                                    </div>
                                    <h3 className="font-bold text-base mb-0.5 text-slate-800 dark:text-slate-100">Your AI Fitness Coach</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                                        Tell me about yourself and I'll create a custom workout plan.
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 space-y-3 shadow-sm">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Bot className="w-3 h-3" /> Age (years)
                                        </label>
                                        <input
                                            type="number"
                                            value={userStats.age}
                                            onChange={e => setUserStats({ ...userStats, age: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-teal-200 focus:border-teal-400 outline-none transition-all dark:text-white"
                                            placeholder="e.g. 25"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Scale className="w-3 h-3" /> Body Weight (kg)
                                        </label>
                                        <input
                                            type="number"
                                            value={userStats.weight}
                                            onChange={e => setUserStats({ ...userStats, weight: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-teal-200 focus:border-teal-400 outline-none transition-all dark:text-white"
                                            placeholder="e.g. 70"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Ruler className="w-3 h-3" /> Height (cm)
                                        </label>
                                        <input
                                            type="number"
                                            value={userStats.height}
                                            onChange={e => setUserStats({ ...userStats, height: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-teal-200 focus:border-teal-400 outline-none transition-all dark:text-white"
                                            placeholder="e.g. 175"
                                        />
                                    </div>
                                    <div className="space-y-3 pt-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Apple className="w-3 h-3" /> Diet Score
                                            </label>
                                            <span className="text-xs font-bold text-teal-600">{userStats.diet}/10</span>
                                        </div>
                                        <input
                                            type="range" min="1" max="10"
                                            value={userStats.diet}
                                            onChange={e => setUserStats({ ...userStats, diet: parseInt(e.target.value) })}
                                            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                        />
                                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                            <span>Unhealthy</span>
                                            <span>Balanced</span>
                                            <span>Clean</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Flame className="w-3 h-3" /> Workout Intensity
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['naive', 'intermediate', 'aggressive'].map((intensity) => (
                                                <button
                                                    key={intensity}
                                                    onClick={() => setUserStats({ ...userStats, workoutIntensity: intensity })}
                                                    className={`py-2 px-1 rounded-xl text-[10px] sm:text-xs font-bold transition-all capitalize border ${userStats.workoutIntensity === intensity
                                                        ? 'bg-teal-500 border-teal-500 text-white shadow-md shadow-teal-500/20'
                                                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-600'
                                                        }`}
                                                >
                                                    {intensity === 'naive' ? 'Beginner' : intensity}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={generatePlan}
                                    disabled={!userStats.age || !userStats.weight || !userStats.height || isTyping}
                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-200 dark:shadow-none transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    Generate My Plan
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 pb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-teal-600">Your Plan</h3>
                                        <p className="text-xs text-slate-400">Based on your stats</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (workoutPlan) {
                                                saveToHistory(workoutPlan, chatMessages);
                                                setSavedToast(true);
                                                setTimeout(() => setSavedToast(false), 2000);
                                            }
                                        }}
                                        className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Save Chat
                                    </button>
                                </div>

                                {/* Save Toast */}
                                {savedToast && (
                                    <div className="mb-3 flex items-center justify-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-semibold py-2 px-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                                        <Sparkles className="w-3.5 h-3.5" /> Plan & chat saved!
                                    </div>
                                )}

                                {/* Chat Messages Area */}
                                <div className="flex-1 overflow-y-auto space-y-6 pr-0 mb-4 min-h-0 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                    {/* The Initial Plan Display */}
                                    <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                        <div className="px-3 py-4 bg-teal-50/50 dark:bg-teal-900/10 border-b border-slate-100 dark:border-slate-700 italic text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                                            "{workoutPlan?.analysis}"
                                        </div>
                                        <div className="px-3 py-5 space-y-6">
                                            {workoutPlan?.days.map((day, dIdx) => (
                                                <div key={dIdx}>
                                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-gradient-to-tr from-teal-400 to-teal-600 rounded-full shadow-sm shadow-teal-500/50"></span>
                                                        {day.day_name}
                                                    </h4>
                                                            <div className="space-y-3">
                                                                {day.exercises.map((ex, eIdx) => {
                                                                    const uniqueId = `plan-${dIdx}-${eIdx}`;
                                                                    return (
                                                                        <div key={eIdx}
                                                                            className={`bg-white dark:bg-slate-800/80 p-4 rounded-2xl border transition-all duration-300 cursor-pointer shadow-sm group relative
                                                                             ${expandedExercise === uniqueId
                                                                                    ? 'border-teal-300 dark:border-teal-700 shadow-md ring-1 ring-teal-500/20 z-40 hover:z-50'
                                                                                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-lg hover:-translate-y-1 z-10'}`}
                                                                            onClick={() => setExpandedExercise(expandedExercise === uniqueId ? null : uniqueId)}>
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-inner group-hover:shadow-md transition-all flex items-center justify-center">
                                                                                    <Dumbbell className="w-5 h-5 text-slate-300" />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{ex.name}</p>
                                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                                                            {ex.equipment || 'Bodyweight'}
                                                                                        </span>
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                                                            {ex.target}
                                                                                        </span>
                                                                                        {ex.sets && ex.reps && (
                                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                                                                                                {ex.sets} × {ex.reps}
                                                                                            </span>
                                                                                        )}
                                                                                        {ex.rest_seconds && (
                                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-500 dark:text-orange-400">
                                                                                                ⏱ {ex.rest_seconds}s rest
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="self-center">
                                                                                    {expandedExercise === uniqueId ? (
                                                                                        <ChevronUp className="w-5 h-5 text-teal-500" />
                                                                                    ) : (
                                                                                        <PlayCircle className="w-5 h-5 text-slate-300 group-hover:text-teal-500 group-hover:scale-110 transition-all duration-300" />
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                        {/* Expanded Details */}
                                                                        <div className={`grid transition-all duration-300 ease-in-out ${expandedExercise === uniqueId ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
                                                                            <div className="overflow-hidden [&:has(:hover)]:overflow-visible">

                                                                                {/* Large Exercise Visual Banner */}
                                                                                {ex.gifUrl && (
                                                                                    <div className="w-full rounded-2xl mb-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-inner relative flex items-center justify-center z-10 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:z-50 hover:scale-[1.05] hover:-translate-y-2 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] hover:ring-[6px] ring-white/90 dark:ring-slate-800/90 cursor-zoom-in overflow-hidden">
                                                                                        <img
                                                                                            src={ex.gifUrl}
                                                                                            className="w-full h-auto object-contain mix-blend-multiply dark:mix-blend-normal"
                                                                                            loading="lazy"
                                                                                            alt={ex.name}
                                                                                        />
                                                                                    </div>
                                                                                )}

                                                                            {/* Pro Tip */}
                                                                            {ex.tips && (
                                                                                <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/30">
                                                                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">💡 <strong>Pro Tip:</strong> {ex.tips}</p>
                                                                                </div>
                                                                            )}

                                                                            <div className="flex flex-col md:flex-row gap-4 border-t border-slate-100 dark:border-slate-700 pt-4 pb-2">
                                                                                <div className="flex-1 text-xs text-slate-600 dark:text-slate-300">
                                                                                    <h5 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-teal-500" /> Instructions</h5>
                                                                                    {ex.instructions && ex.instructions.length > 0 ? (
                                                                                        <ol className="space-y-2 pl-2">
                                                                                            {ex.instructions.map((inst, i) => (
                                                                                                <li key={i} className="flex gap-2">
                                                                                                    <span className="font-bold text-teal-500 shrink-0">{i + 1}.</span>
                                                                                                    <span className="leading-relaxed">{inst}</span>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ol>
                                                                                    ) : (
                                                                                        <p className="italic text-slate-400">Detailed instructions will be shown in the app.</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Nutrition Section */}
                                        {workoutPlan?.nutrition && (
                                            <div className="px-3 py-5 border-t border-slate-100 dark:border-slate-700">
                                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-gradient-to-tr from-green-400 to-green-600 rounded-full shadow-sm shadow-green-500/50"></span>
                                                    🥤 Nutrition & Shakes
                                                </h4>
                                                <div className="space-y-3">
                                                    {workoutPlan.nutrition.daily_calories && (
                                                        <div className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-900/10 rounded-xl">
                                                            <span className="text-2xl">🔥</span>
                                                            <div>
                                                                <p className="text-xs font-bold text-teal-700 dark:text-teal-400">Daily Target: {workoutPlan.nutrition.daily_calories} kcal | {workoutPlan.nutrition.protein_grams}g protein</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {workoutPlan.nutrition.pre_workout_shake && (
                                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                                            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-1">⚡ Pre-Workout Shake</p>
                                                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{workoutPlan.nutrition.pre_workout_shake}</p>
                                                        </div>
                                                    )}
                                                    {workoutPlan.nutrition.post_workout_shake && (
                                                        <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-800/30">
                                                            <p className="text-[11px] font-bold text-green-600 dark:text-green-400 mb-1">💪 Post-Workout Shake</p>
                                                            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">{workoutPlan.nutrition.post_workout_shake}</p>
                                                        </div>
                                                    )}
                                                    {workoutPlan.nutrition.homemade_protein_shake && (
                                                        <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30">
                                                            <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 mb-1">🏠 Homemade Protein Shake</p>
                                                            <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">{workoutPlan.nutrition.homemade_protein_shake}</p>
                                                        </div>
                                                    )}
                                                    {workoutPlan.nutrition.diet_tips && workoutPlan.nutrition.diet_tips.length > 0 && (
                                                        <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/30">
                                                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-2">📝 Diet Tips</p>
                                                            <ul className="space-y-1">
                                                                {workoutPlan.nutrition.diet_tips.map((tip, i) => (
                                                                    <li key={i} className="text-xs text-amber-700 dark:text-amber-300 flex gap-2">
                                                                        <span className="text-amber-500">•</span> {tip}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Follow-up Chat History */}
                                    {chatMessages.length > 0 && (
                                        <div className="space-y-4 pt-4 border-t-2 border-dashed border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Ask Coach</h4>
                                                <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                                            </div>

                                            {chatMessages.map((msg, i) => (
                                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                                    <div className={`${msg.planData ? 'max-w-[96%] w-full' : 'max-w-[88%]'} p-4 text-[13px] shadow-sm leading-relaxed ${msg.role === 'user'
                                                        ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-2xl rounded-tr-sm'
                                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-sm'
                                                        }`}>
                                                        {msg.image && (
                                                            <div className="mb-2">
                                                                <img
                                                                    src={msg.image}
                                                                    alt="Uploaded"
                                                                    className="w-24 h-24 rounded-lg object-cover"
                                                                />
                                                            </div>
                                                        )}
                                                        {msg.role === 'assistant' ? (
                                                            <RichMessageRenderer content={msg.content} />
                                                        ) : (
                                                            <span className="text-[13px] leading-relaxed break-words">{msg.content}</span>
                                                        )}

                                                        {msg.role === 'assistant' && msg.planData?.days?.some(day => day.exercises?.length > 0) && (
                                                            <div className="mt-4 space-y-3">
                                                                {msg.planData.days.map((day, dIdx) => (
                                                                    <div key={`chat-day-${i}-${dIdx}`} className="space-y-2.5">
                                                                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
                                                                            <Dumbbell className="w-3.5 h-3.5" />
                                                                            {day.day_name}
                                                                        </div>
                                                                        {day.exercises.map((ex, eIdx) => {
                                                                            const uniqueId = `chat-${i}-${dIdx}-${eIdx}`;
                                                                            const isExpanded = expandedExercise === uniqueId;

                                                                            return (
                                                                                <div
                                                                                    key={uniqueId}
                                                                                    className={`rounded-2xl border bg-slate-50 dark:bg-slate-900/40 transition-all overflow-hidden ${isExpanded ? 'border-teal-300 dark:border-teal-700 shadow-md' : 'border-slate-200 dark:border-slate-700'}`}
                                                                                >
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setExpandedExercise(isExpanded ? null : uniqueId)}
                                                                                        className="w-full p-3 text-left flex items-center gap-3"
                                                                                    >
                                                                                        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
                                                                                            {ex.gifUrl ? (
                                                                                                <img src={ex.gifUrl} alt={ex.name} className="w-full h-full object-cover" loading="lazy" />
                                                                                            ) : (
                                                                                                <Dumbbell className="w-5 h-5 text-slate-300" />
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-snug">{ex.name}</p>
                                                                                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                                                                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                                                                                    {ex.equipment || 'Bodyweight'}
                                                                                                </span>
                                                                                                <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/30 text-[9px] font-bold uppercase text-teal-600 dark:text-teal-400">
                                                                                                    {ex.target || 'Exercise'}
                                                                                                </span>
                                                                                                {ex.sets && ex.reps && (
                                                                                                    <span className="px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 text-[9px] font-bold text-orange-500 dark:text-orange-400">
                                                                                                        {ex.sets} x {ex.reps}
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        {isExpanded ? (
                                                                                            <ChevronUp className="w-4 h-4 text-teal-500 shrink-0" />
                                                                                        ) : (
                                                                                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                                                                        )}
                                                                                    </button>

                                                                                    {isExpanded && (
                                                                                        <div className="px-3 pb-3 space-y-3">
                                                                                            {ex.gifUrl && (
                                                                                                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                                                                                    <img src={ex.gifUrl} alt={`${ex.name} demonstration`} className="w-full h-auto object-contain" loading="lazy" />
                                                                                                </div>
                                                                                            )}
                                                                                            <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3">
                                                                                                <h5 className="font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5 text-[11px]">
                                                                                                    <FileText className="w-3.5 h-3.5 text-teal-500" />
                                                                                                    Instructions
                                                                                                </h5>
                                                                                                {ex.instructions && ex.instructions.length > 0 ? (
                                                                                                    <ol className="space-y-1.5">
                                                                                                        {ex.instructions.map((inst, instIdx) => (
                                                                                                            <li key={instIdx} className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                                                                                                <span className="font-bold text-teal-500 shrink-0">{instIdx + 1}.</span>
                                                                                                                <span>{inst}</span>
                                                                                                            </li>
                                                                                                        ))}
                                                                                                    </ol>
                                                                                                ) : (
                                                                                                    <p className="text-[11px] italic text-slate-400">Detailed instructions are not available for this exercise.</p>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {msg.role === 'assistant' && i === latestAssistantMessageIndex && msg.suggestedQuestionCards && msg.suggestedQuestionCards.length > 0 && (
                                                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Related Questions</p>
                                                                <div className="space-y-2.5">
                                                                    {msg.suggestedQuestionCards.slice(0, 6).map((card, cardIndex) => {
                                                                        if (card.inputType === 'text') {
                                                                            return (
                                                                                <div key={`${card.question}-${cardIndex}`}>
                                                                                    <TextInputFlashcard
                                                                                        card={card}
                                                                                        isLoading={isTyping}
                                                                                        onSend={(text) => {
                                                                                            void handleCoachFlashcardOptionClick(card, {
                                                                                                label: text,
                                                                                                userStatement: text,
                                                                                            });
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return (
                                                                            <OptionFlashcard
                                                                                key={`${card.question}-${cardIndex}`}
                                                                                card={card}
                                                                                isLoading={isTyping}
                                                                                onSelect={(option) => {
                                                                                    void handleCoachFlashcardOptionClick(card, option);
                                                                                }}
                                                                            />
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {isTyping && (
                                                <div className="flex justify-start animate-in fade-in">
                                                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                                                        <div className="flex gap-1">
                                                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                        </div>
                                                        <span className="text-xs text-slate-500 font-medium ml-1">Coach is analyzing...</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={chatEndRef} className="h-4" />
                                        </div>
                                    )}
                                </div>

                                {/* Chat Input Box */}
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                    {/* Image Preview */}
                                    {selectedImage && (
                                        <div className="mb-2 relative inline-block">
                                            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                                <img
                                                    src={selectedImage.base64}
                                                    alt="Preview"
                                                    className="w-16 h-16 object-cover rounded-lg"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{selectedImage.file.name}</p>
                                                    <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">Vision mode enabled</p>
                                                </div>
                                                <button
                                                    onClick={handleRemoveImage}
                                                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="relative group">
                                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-blue-500/10 rounded-2xl blur-md opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"></div>
                                        <input
                                            type="text"
                                            value={inputMessage}
                                            onChange={e => setInputMessage(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                            className="relative w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-5 pr-24 py-4 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all dark:text-white shadow-sm"
                                            placeholder={selectedImage ? "Ask about this image..." : "Ask for alternatives, nutrition tips, or modifications..."}
                                        />
                                        <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageSelect}
                                                className="hidden"
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className={`aspect-square h-full rounded-xl transition-all flex items-center justify-center active:scale-95 ${
                                                    selectedImage 
                                                        ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600' 
                                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-600'
                                                }`}
                                                title="Upload image"
                                            >
                                                <ImageIcon className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={handleSendMessage}
                                                disabled={(!inputMessage.trim() && !selectedImage) || isTyping}
                                                className="aspect-square h-full bg-teal-600 text-white rounded-xl hover:bg-teal-700 hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center active:scale-95"
                                            >
                                                <Send className="w-4 h-4 ml-0.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default FitnessPanel;
