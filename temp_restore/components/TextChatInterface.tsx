import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Search, Wand2, X, Paperclip, Loader2, ArrowRight, Volume2, Square, MapPin, Zap, Sparkles, BrainCircuit } from 'lucide-react';
import { ChatMessage, MessageRole, AgentAction } from '../types';
import { sendMessageToAgent, handleToolCall, ModelMode } from '../services/geminiService';
import { blobToBase64, playPCM16, stopCurrentAudio } from '../utils/audioUtils';
import ReactMarkdown from 'react-markdown';

interface TextChatInterfaceProps {
  dispatch: React.Dispatch<AgentAction>;
}

// Helper to detect mime type from base64 header (simple heuristic)
const getImageSrc = (base64: string) => {
  if (!base64) return '';
  // PNG usually starts with iVBOR...
  if (base64.startsWith('iVBOR')) return `data:image/png;base64,${base64}`;
  // JPEG usually starts with /9j...
  if (base64.startsWith('/9j')) return `data:image/jpeg;base64,${base64}`;
  // Default fallback
  return `data:image/jpeg;base64,${base64}`;
};

const TextChatInterface: React.FC<TextChatInterfaceProps> = ({ dispatch }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: MessageRole.SYSTEM,
      text: "Namaste! I'm HealthGuard. I can suggest **Indian home remedies**, **healthy diet plans**, or order medicines for you. How are you feeling today?"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ file: File, base64: string } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>('standard');
  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  // Track which message ID is currently playing audio
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clean up audio when component unmounts
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  // Get User Location on Mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          console.log("Location acquired:", position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.warn("Location permission denied or error", err);
        }
      );
    }
  }, []);

  const handleAudioToggle = (msgId: string, audioData: string) => {
    if (playingMessageId === msgId) {
      // Stop if currently playing this message
      stopCurrentAudio();
      setPlayingMessageId(null);
    } else {
      // Play new message (playPCM16 handles stopping previous audio internally)
      setPlayingMessageId(msgId);
      playPCM16(audioData, () => {
        setPlayingMessageId(null);
      });
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await blobToBase64(file);
        setSelectedImage({ file, base64 });
        setIsEditMode(false); // Default to analyze
      } catch (err) {
        console.error("Image load failed", err);
      }
    }
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    // Stop any playing audio when sending new message
    if (playingMessageId) {
      stopCurrentAudio();
      setPlayingMessageId(null);
    }

    const userMsgId = Date.now().toString();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: MessageRole.USER,
      text: textToSend,
      image: selectedImage?.base64,
      isEditing: isEditMode
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    const currentImage = selectedImage?.base64; // Capture for closure
    const currentEditMode = isEditMode;
    setSelectedImage(null);
    setIsEditMode(false);
    setIsLoading(true);

    try {
      // API Call with Location
      const result = await sendMessageToAgent(
        messages, 
        newUserMsg.text, 
        currentImage, 
        currentEditMode,
        userLocation,
        modelMode
      );

      // Handle Tool Calls (Agentic Actions)
      if (result.toolCalls) {
         for (const call of result.toolCalls) {
            const toolResult = handleToolCall(call, dispatch);
            console.log("Tool executed:", toolResult);
         }
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.MODEL,
        text: result.text || "Action completed.",
        image: result.image, // If image generation/edit happened
        audio: result.audio,
        suggestedActions: result.suggestedActions,
        groundingSources: result.groundingMetadata?.groundingChunks?.map((chunk: any) => {
          if (chunk.web) {
            return { uri: chunk.web.uri, title: chunk.web.title };
          }
          if (chunk.maps) {
            // Check different possible map structures based on API version/response
            const uri = chunk.maps.googleMapsUri || chunk.maps.uri;
            const title = chunk.maps.title || "Google Maps Location";
            return uri ? { uri, title } : null;
          }
          return null;
        }).filter(Boolean)
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error("Chat Error", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: MessageRole.SYSTEM,
        text: "Sorry, I encountered an error processing your request."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === MessageRole.USER ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] lg:max-w-[70%] rounded-2xl p-4 shadow-sm relative ${
              msg.role === MessageRole.USER 
                ? 'bg-medical-600 text-white rounded-tr-none' 
                : msg.role === MessageRole.SYSTEM
                  ? 'bg-gray-100 text-gray-600 text-sm text-center w-full shadow-none self-center'
                  : 'bg-medical-50 text-gray-800 rounded-tl-none border border-medical-100'
            }`}>
              {/* Image Attachment (Uploaded or Generated) */}
              {msg.image && (
                <div className="mb-3 overflow-hidden rounded-lg">
                  <img 
                    src={getImageSrc(msg.image)} 
                    alt="Content" 
                    className="max-w-full h-auto object-cover" 
                  />
                  {msg.isEditing && <span className="text-xs bg-black/50 text-white px-2 py-1 absolute top-2 right-2 rounded">Edit Request</span>}
                </div>
              )}
              
              {/* Text Content with Markdown Rendering */}
              <div className={`prose prose-sm max-w-none ${msg.role === MessageRole.USER ? 'prose-invert' : ''}`}>
                <ReactMarkdown
                  components={{
                    // Style bold text with a specific green color to highlight remedies/key terms
                    strong: ({node, ...props}) => (
                      <strong className={`font-bold ${msg.role === MessageRole.USER ? 'text-white' : 'text-teal-700'}`} {...props} />
                    ),
                    ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-4 space-y-1 my-2" {...props} />,
                    li: ({node, ...props}) => <li className="pl-1" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                    a: ({node, ...props}) => <a className="underline hover:text-medical-800 transition-colors" target="_blank" {...props} />
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>

              {/* Audio Player Button */}
              {msg.audio && (
                <button 
                  onClick={() => handleAudioToggle(msg.id, msg.audio!)}
                  className={`mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors w-fit ${
                    playingMessageId === msg.id 
                      ? 'bg-red-100 text-red-600 border border-red-200' 
                      : 'bg-white/20 hover:bg-white/30 text-current border border-current/20'
                  }`}
                  title={playingMessageId === msg.id ? "Stop reading" : "Read aloud"}
                >
                  {playingMessageId === msg.id ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>Listen</span>
                    </>
                  )}
                </button>
              )}

              {/* Grounding Sources */}
              {msg.groundingSources && msg.groundingSources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-medical-200">
                  <p className="text-xs font-semibold text-medical-800 flex items-center gap-1 mb-1">
                    <Search className="w-3 h-3" /> Sources
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {msg.groundingSources.map((source, idx) => (
                      <a 
                        key={idx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs bg-white text-medical-600 border border-medical-200 px-2 py-1 rounded hover:bg-medical-100 truncate max-w-[200px]"
                      >
                        {source.title || new URL(source.uri).hostname}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Suggested Reply Chips (Only for the latest message if interactive) */}
            {msg.suggestedActions && msg.suggestedActions.length > 0 && msg.id === messages[messages.length - 1].id && !isLoading && (
              <div className="mt-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
                {msg.suggestedActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(action)}
                    className="bg-white border border-medical-200 text-medical-600 px-4 py-2 rounded-full text-sm font-medium hover:bg-medical-50 hover:border-medical-300 transition-colors shadow-sm flex items-center gap-1 group"
                  >
                    {action}
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-gray-50 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
               <Loader2 className="w-4 h-4 animate-spin text-medical-500" />
               <span className="text-sm text-gray-500">{modelMode === 'thinking' ? 'Reasoning deeply...' : 'Thinking...'}</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        
        {/* Model Selection Toolbar */}
        <div className="flex justify-center gap-2 mb-3">
          <button 
            onClick={() => setModelMode('fast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              modelMode === 'fast' ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            title="Fast responses (Gemini Flash Lite)"
          >
            <Zap className="w-3.5 h-3.5" />
            Fast
          </button>
          <button 
            onClick={() => setModelMode('standard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              modelMode === 'standard' ? 'bg-medical-100 text-medical-700 border border-medical-200 shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            title="Balanced with Maps & Search (Gemini Flash)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Standard
          </button>
          <button 
            onClick={() => setModelMode('thinking')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              modelMode === 'thinking' ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            title="Deep reasoning for complex queries (Gemini Pro)"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            Deep Think
          </button>
        </div>

        {selectedImage && (
          <div className="mb-2 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-fit">
            <ImageIcon className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-600 max-w-[150px] truncate">{selectedImage.file.name}</span>
            <div className="h-4 w-px bg-gray-300 mx-1"></div>
            
            {/* Toggle between Analyze and Edit */}
            <button 
               onClick={() => setIsEditMode(!isEditMode)}
               className={`text-xs px-2 py-0.5 rounded transition-colors ${isEditMode ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {isEditMode ? (
                <span className="flex items-center gap-1"><Wand2 className="w-3 h-3"/> Editing</span>
              ) : (
                "Analyze"
              )}
            </button>

            <button onClick={() => setSelectedImage(null)} className="ml-2 hover:bg-gray-200 rounded p-1">
              <X className="w-3 h-3 text-gray-500" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <label className="cursor-pointer p-3 text-gray-400 hover:text-medical-600 hover:bg-medical-50 rounded-full transition-colors">
            <Paperclip className="w-5 h-5" />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleImageSelect}
            />
          </label>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isEditMode ? "Describe how to edit this image..." : userLocation ? "Type a message..." : "Type a message (enabling location...)"}
              className="w-full bg-gray-50 border border-gray-200 rounded-full py-3 px-4 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent text-gray-700 placeholder-gray-400"
            />
          </div>

          <button
            onClick={() => handleSend()}
            disabled={(!input && !selectedImage) || isLoading}
            className="bg-medical-600 hover:bg-medical-700 text-white p-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-medical-200"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {userLocation && (
           <p className="text-[10px] text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
             <MapPin className="w-3 h-3" /> Location active for emergencies
           </p>
        )}
      </div>
    </div>
  );
};

export default TextChatInterface;