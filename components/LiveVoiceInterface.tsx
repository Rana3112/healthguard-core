import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { floatTo16BitPCM, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/audioUtils';
import { Mic, MicOff, Volume2, Radio, Activity } from 'lucide-react';
import { toolsDef } from '../services/geminiService';

interface LiveVoiceInterfaceProps {
  onAgentAction: (action: any) => void;
}

const LiveVoiceInterface: React.FC<LiveVoiceInterfaceProps> = ({ onAgentAction }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Audio Context Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Session
  const sessionRef = useRef<any>(null);

  const getGeminiApiKey = () =>
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    (import.meta as any)?.env?.API_KEY ||
    (typeof process !== 'undefined' ? (process as any)?.env?.API_KEY : undefined);

  const connectToLiveAPI = async () => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      setError("API Key missing");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });

      // Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: 'You are HealthGuard, a compassionate and knowledgeable healthcare assistant. Speak clearly and concisely. You can set health alerts.',
          tools: toolsDef, // Reuse tools definition
        },
      };

      const sessionPromise = ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: () => {
            console.log("Live Session Opened");
            setIsConnected(true);
            setIsConnecting(false);

            // Start processing microphone input
            const ctx = inputAudioContextRef.current;
            if (!ctx) return;

            inputSourceRef.current = ctx.createMediaStreamSource(stream);
            processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
              if (isMuted) return; // Simple mute implementation

              const inputData = e.inputBuffer.getChannelData(0);

              // Visualize volume
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolumeLevel(Math.sqrt(sum / inputData.length) * 5); // Scale up a bit

              // Convert and Send
              const pcm16 = floatTo16BitPCM(inputData);
              const base64Data = arrayBufferToBase64(pcm16);

              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Data
                  }
                });
              });
            };

            inputSourceRef.current.connect(processorRef.current);
            processorRef.current.connect(ctx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls
            if (message.toolCall) {
              console.log("Tool Call Received", message.toolCall);
              for (const fc of message.toolCall.functionCalls) {
                // We execute the local logic (e.g. update React state)
                // In a real app we'd actually do the logic. Here we simulate success.
                // We need to pass this up to the parent to show in Dashboard
                if (fc.name === 'setHealthAlert') {
                  onAgentAction({
                    type: 'ADD_ALERT',
                    payload: {
                      id: Math.random().toString(),
                      message: fc.args.message,
                      time: fc.args.time,
                      active: true
                    }
                  });
                }

                // Send response back to model
                sessionPromise.then(session => {
                  session.sendToolResponse({
                    functionResponses: {
                      id: fc.id,
                      name: fc.name,
                      response: { result: "Success" }
                    }
                  });
                });
              }
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              const audioData = base64ToArrayBuffer(base64Audio);

              // Decode
              try {
                // We need to implement manual decoding since raw PCM isn't supported by decodeAudioData directly
                // Wait, the API returns PCM? No, usually Live API returns PCM.
                // The provided guide uses a manual decodeAudioData function.

                const pcmData = new Int16Array(audioData);
                const float32Data = new Float32Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                  float32Data[i] = pcmData[i] / 32768.0;
                }

                const buffer = ctx.createBuffer(1, float32Data.length, 24000);
                buffer.getChannelData(0).set(float32Data);

                const source = ctx.createBufferSource();
                source.buffer = buffer;

                const node = ctx.createGain();
                node.gain.value = 1.0;
                source.connect(node);
                node.connect(ctx.destination);

                // Schedule playback
                if (nextStartTimeRef.current < ctx.currentTime) {
                  nextStartTimeRef.current = ctx.currentTime;
                }
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;

                audioQueueRef.current.add(source);
                source.onended = () => {
                  audioQueueRef.current.delete(source);
                };

              } catch (e) {
                console.error("Audio decode error", e);
              }
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              console.log("Interrupted");
              audioQueueRef.current.forEach(source => source.stop());
              audioQueueRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            console.log("Session Closed");
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Session Error", err);
            setError("Connection Error: " + err.toString());
            disconnect();
          }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (err) {
      console.error(err);
      setIsConnecting(false);
      setError("Failed to initialize Live API");
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => s.close()); // Use any to avoid type complexity
      sessionRef.current = null;
    }

    if (inputSourceRef.current) inputSourceRef.current.disconnect();
    if (processorRef.current) processorRef.current.disconnect();
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();

    setIsConnected(false);
    setIsConnecting(false);
    nextStartTimeRef.current = 0;
  };

  useEffect(() => {
    return () => {
      disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-br from-medical-50 to-white">
      <div className="relative mb-8">
        <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 ${isConnected ? 'bg-medical-500 shadow-lg shadow-medical-200' : 'bg-gray-200'}`}>
          {isConnecting ? (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          ) : isConnected ? (
            <div className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden">
              {/* Visualizer Ring Simulation */}
              <div
                className="absolute bg-white opacity-20 rounded-full transition-all duration-75"
                style={{ width: `${50 + volumeLevel * 20}%`, height: `${50 + volumeLevel * 20}%` }}
              />
              <Radio className="w-16 h-16 text-white z-10 animate-pulse-slow" />
            </div>
          ) : (
            <MicOff className="w-16 h-16 text-gray-400" />
          )}
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">
        {isConnected ? "Listening..." : "Live Health Consultation"}
      </h2>
      <p className="text-gray-500 mb-8 text-center max-w-md">
        {isConnected
          ? "Speak naturally. I'm listening to your health concerns and can set alerts or provide advice."
          : "Start a real-time voice session with HealthGuard AI."}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        {!isConnected ? (
          <button
            onClick={connectToLiveAPI}
            disabled={isConnecting}
            className="flex items-center gap-2 bg-medical-600 hover:bg-medical-700 text-white px-6 py-3 rounded-full font-medium transition-colors disabled:opacity-50"
          >
            <Mic className="w-5 h-5" />
            Start Session
          </button>
        ) : (
          <>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full font-medium transition-colors"
            >
              End Session
            </button>
          </>
        )}
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
        <Activity className="w-4 h-4" />
        <span>Powered by Gemini 2.5 Live API</span>
      </div>
    </div>
  );
};

export default LiveVoiceInterface;
