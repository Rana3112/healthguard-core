import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image, Loader2, Sparkles, Activity, Pill, MapPin, Volume2, Square, FileSearch, ShieldAlert, Zap, BrainCircuit, Eye, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { sendMessageToAgent, ModelMode, generateSpeech } from '../services/geminiService';
import { AgentAction, ChatMessage, MessageRole } from '../types';
import MedicinePriceCard from './MedicinePriceCard';
import NearbyPharmacyMap from './NearbyPharmacyMap';

interface TextChatInterfaceProps {
  dispatch: React.Dispatch<AgentAction>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onMessagesChange: (messages: ChatMessage[]) => void;
  modelMode: ModelMode;
  setModelMode: (mode: ModelMode) => void;
  onQuickTool?: (type: string) => void;
  pendingQuickTool?: string | null;
  onQuickToolConsumed?: () => void;
  onOpenDrugInteractions?: () => void;
}

const TextChatInterface: React.FC<TextChatInterfaceProps> = ({ dispatch, messages, setMessages, onMessagesChange, modelMode, setModelMode, onQuickTool, pendingQuickTool, onQuickToolConsumed, onOpenDrugInteractions }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ file: File, base64: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number, lon: number } | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  // Stores a prompt to auto-send right after the user picks an image (for vision quick tools)
  const pendingAutoPromptRef = useRef<string | null>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  // Get Location (Optional: for locating hospitals/pharmacies)
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      }, (error) => {
        console.log("Location access denied or error:", error);
      });
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access the microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5001';
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      if (data.text) {
        await handleSend(data.text);
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleInitialSend = async () => {
    if (!input.trim() && !selectedImage) return;

    const userText = input;
    setInput(''); // Clear input immediately

    await handleSend(userText);
  }

  // Send Message Handler
  const handleSend = async (text: string, imageOverride?: { file: File, base64: string } | null) => {
    const imageToUse = imageOverride !== undefined ? imageOverride : selectedImage;
    if (!text.trim() && !imageToUse) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      text: text,
      image: imageToUse?.base64,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    // Reset inputs — always clear selectedImage to prevent stale images on next send
    const imageToSend = imageToUse;
    setSelectedImage(null);

    try {
      // Prepare history for API
      const history = updatedMessages.map(m => ({
        id: m.id,
        role: m.role === MessageRole.USER ? MessageRole.USER : MessageRole.MODEL,
        text: m.text,
        image: m.image
      }));

      // Call Gemini Service with Mode
      const response = await sendMessageToAgent(
        history,
        text,
        imageToSend ? imageToSend.base64.split(',')[1] : undefined,
        false, // isEditRequest
        userLocation ? { lat: userLocation.lat, lng: userLocation.lon } : null,
        modelMode // PASS THE MODE
      );

      // Handle Agent Actions
      if (response.text.includes("[AGENT_ORDER_START]")) {
        dispatch({
          type: 'START_AGENT_SESSION',
          payload: { platform: 'Amazon', item: 'Medical Supplies', quantity: 1 }
        });
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.MODEL,
        text: response.text,
        timestamp: Date.now(),
        suggestedActions: response.suggestedActions,
        priceComparison: response.priceComparison
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: "I'm sorry, I'm having trouble connecting right now. Please try again.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = { file, base64: reader.result as string };
        setSelectedImage(imageData);
        setModelMode('vision');
        // If a quick tool was waiting for an upload, auto-send the prompt immediately
        if (pendingAutoPromptRef.current) {
          const prompt = pendingAutoPromptRef.current;
          pendingAutoPromptRef.current = null;
          // Use a tiny delay so React can flush the setSelectedImage state first
          setTimeout(() => handleSend(prompt, imageData), 50);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlayTTS = async (text: string, messageId: string) => {
    if (playingMessageId === messageId) return; // Already playing this one

    try {
      setPlayingMessageId(messageId);

      const audioBase64 = await generateSpeech(text);

      if (!audioBase64) {
        throw new Error("Cloud TTS Failed to generate audio");
      }

      // Play the base64 audio directly (Gemini 2.0 Flash usually returns audio/wav compatible base64)
      const audioUrl = `data:audio/wav;base64,${audioBase64}`;
      const audio = new Audio(audioUrl);

      audio.onended = () => setPlayingMessageId(null);
      audio.onerror = () => setPlayingMessageId(null);

      await audio.play();
    } catch (error) {
      console.error("TTS Error:", error);
      setPlayingMessageId(null);
    }
  };

  const runMedicalCheck = (type: string) => {
    handleSend(`Check specifically for ${type} related issues based on my previous messages or image.`);
  };

  // Handle quick tool triggers from the header buttons
  useEffect(() => {
    if (!pendingQuickTool) return;

    switch (pendingQuickTool) {
      // Vision mode — upload symptom document/photo, auto-submit analysis
      case 'Symptoms':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this symptom document or image. Identify all symptoms mentioned, assess their severity, suggest possible conditions or causes, and recommend next steps including home remedies and when to see a doctor. Format the results clearly.';
        fileInputRef.current?.click();
        break;

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Medicines':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medicine. Identify the medicine name, its uses, dosage instructions, side effects, warnings, and any important drug interactions. Format the results clearly.';
        fileInputRef.current?.click();
        break;

      // Pharmacy — switch to Agent mode, show interactive map with pharmacy data
      case 'Pharmacy': {
        setModelMode('agent');
        const pharmacyMsg: ChatMessage = {
          id: Date.now().toString(),
          role: MessageRole.MODEL,
          text: '📍 Searching for nearby pharmacies and medical stores around your location...',
          showPharmacyMap: true,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, pharmacyMsg]);
        break;
      }

      // Vision mode — show file dialog, auto-submit prompt once image chosen
      case 'Report':
        setModelMode('vision');
        pendingAutoPromptRef.current = 'Analyze this medical report. Extract ALL lab values and test results. For each value: show the parameter name, measured value, normal range, and status (✅ Normal, ⬆️ High, ⬇️ Low). Flag any critical or abnormal values. Then provide a summary of overall health and actionable recommendations. Format results in a clear table.';
        fileInputRef.current?.click();
        break;

      // Redirect to the dedicated Drug Interaction tool in the right sidebar
      case 'Drugs':
        onOpenDrugInteractions?.();
        break;
    }
    onQuickToolConsumed?.();
  }, [pendingQuickTool]);

  const getPlaceholder = () => {
    switch (modelMode) {
      case 'agent': return "Ask me to find medicines, compare prices, or set alerts...";
      case 'vision': return "Upload an image of a medicine or report to analyze...";
      case 'thinking': return "Ask a complex medical question for deep reasoning...";
      case 'fast': return "Ask for quick home remedies or tips...";
      default: return "Describe your symptoms or ask for health advice...";
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
        {messages.length === 1 && messages[0].role === MessageRole.SYSTEM && ( // Assuming first message is welcome
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40 select-none">
            <div className="w-20 h-20 bg-teal-100 rounded-3xl flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">How can I help today?</h2>
            <p className="text-slate-500 max-w-sm">
              {modelMode === 'agent' ? "I'm in Agent Mode. I can find medicines and prices for you." : "Ask about symptoms, analyze medical reports, or get fitness advice."}
            </p>
          </div>
        )}

        {messages.filter(m => m.role !== MessageRole.SYSTEM).map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`
                            max-w-[85%] lg:max-w-[75%] rounded-2xl p-4 shadow-sm relative group
                            ${msg.role === MessageRole.USER
                ? 'bg-teal-600 text-white rounded-tr-none'
                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none pb-9'
              }
                        `}>
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="max-w-xs rounded-lg mb-3 border border-white/20" />
              )}

              <div className={`prose prose-sm max-w-none ${msg.role === MessageRole.USER ? 'prose-invert text-white' : 'text-slate-700'}`}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
                        <table className="w-full text-sm text-left" {...props} />
                      </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-slate-50 text-slate-700 uppercase text-xs" {...props} />,
                    th: ({ node, ...props }) => <th className="px-4 py-3 font-bold border-b border-slate-200" {...props} />,
                    td: ({ node, ...props }) => <td className="px-4 py-2 border-b border-slate-100 last:border-0" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-teal-700 bg-teal-50 px-1 rounded" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-4 space-y-1 my-2" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-4 space-y-1 my-2" {...props} />,
                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>

              {/* SERP Price Card (Model Only) */}
              {msg.priceComparison && (
                <MedicinePriceCard
                  query={msg.priceComparison.query}
                  results={msg.priceComparison.results}
                  cheapest={msg.priceComparison.cheapest}
                />
              )}

              {/* Pharmacy Map Card (Model Only) */}
              {msg.showPharmacyMap && (
                <div className="mt-3">
                  <NearbyPharmacyMap />
                </div>
              )}

              {/* TTS Button (Model Only) */}
              {msg.role === MessageRole.MODEL && (
                <button
                  onClick={() => handlePlayTTS(msg.text, msg.id)}
                  disabled={playingMessageId === msg.id}
                  className="absolute bottom-2 left-2 p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-50 rounded-full transition-colors"
                  title="Read Aloud"
                >
                  {playingMessageId === msg.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Suggested Actions (Only for last model message) */}
              {msg.role === MessageRole.MODEL && msg.suggestedActions && msg === messages[messages.length - 1] && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {msg.suggestedActions.map(reply => (
                    <button
                      key={reply}
                      onClick={() => handleSend(reply)}
                      className="text-xs bg-slate-50 hover:bg-slate-100 text-teal-600 px-3 py-1.5 rounded-full border border-teal-100 transition-colors"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}

              {msg.timestamp && (
                <span className={`text-[10px] absolute bottom-1 ${msg.role === MessageRole.USER ? 'left-2 text-teal-200' : 'right-2 text-slate-300'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
              <span className="text-xs text-slate-500 font-medium">
                {modelMode === 'thinking' ? "Thinking deeply..." : modelMode === 'agent' ? "Searching platforms..." : "Analyzing..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Input Area */}
      <div className={`p-4 backdrop-blur-md border-t border-slate-100 transition-colors ${modelMode === 'agent' ? 'bg-purple-50/80' : 'bg-white/80'}`}>
        <div className="max-w-4xl mx-auto">
          {/* Mode Switcher (above input bar) */}
          <div className="flex justify-center mb-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700 gap-0.5">
              <button onClick={() => setModelMode('fast')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'fast' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Zap className={`w-3 h-3 ${modelMode === 'fast' ? 'text-amber-500' : ''}`} /> Fast
              </button>
              <button onClick={() => setModelMode('standard')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'standard' ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Sparkles className={`w-3 h-3 ${modelMode === 'standard' ? 'text-teal-500' : ''}`} /> Standard
              </button>
              <button onClick={() => setModelMode('thinking')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'thinking' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <BrainCircuit className={`w-3 h-3 ${modelMode === 'thinking' ? 'text-indigo-500' : ''}`} /> Deep Think
              </button>
              <button onClick={() => setModelMode('vision')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'vision' ? 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200 dark:border-fuchsia-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Eye className={`w-3 h-3 ${modelMode === 'vision' ? 'text-fuchsia-500' : ''}`} /> Vision
              </button>
              <button onClick={() => setModelMode('agent')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${modelMode === 'agent' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'}`}>
                <Bot className={`w-3 h-3 ${modelMode === 'agent' ? 'text-rose-500' : ''}`} /> Agent
              </button>
            </div>
          </div>

          {/* Image Preview */}
          {selectedImage && (
            <div className="mb-3 flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200 inline-flex">
              <img src={selectedImage.base64} className="w-10 h-10 object-cover rounded-lg" />
              <div className="text-xs">
                <p className="font-semibold text-slate-700 truncate max-w-[120px]">{selectedImage.file.name}</p>
                <button onClick={() => setSelectedImage(null)} className="text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
              title="Upload Image"
            >
              <Image className="w-5 h-5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageSelect}
            />

            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInitialSend()}
                placeholder={getPlaceholder()}
                className={`w-full border-none rounded-2xl pl-4 pr-12 py-3.5 focus:ring-2 text-slate-700 placeholder:text-slate-400 font-medium transition-all ${modelMode === 'agent'
                  ? 'bg-white focus:ring-purple-500/20'
                  : 'bg-slate-100 focus:ring-teal-500/20'
                  }`}
              />
              {/* Send Button inside Input */}
              <button
                onClick={handleInitialSend}
                disabled={!input.trim() && !selectedImage}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${input.trim() || selectedImage
                  ? (modelMode === 'agent' ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md')
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`p-3 rounded-xl transition-all ${isRecording ? 'text-white bg-red-500 hover:bg-red-600 animate-pulse shadow-md shadow-red-500/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'} ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={isRecording ? 'Stop Recording' : 'Voice Input'}
            >
              {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />)}
            </button>
          </div>
        </div>
      </div>
    </div >
  );
};

export default TextChatInterface;