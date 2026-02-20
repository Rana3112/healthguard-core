export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Singleton state to prevent overlapping audio
let activeContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

export const stopCurrentAudio = () => {
  if (activeSource) {
    try {
      activeSource.stop();
      activeSource.disconnect();
    } catch (e) {
      // Ignore errors if already stopped
    }
    activeSource = null;
  }
  
  if (activeContext) {
    try {
      if (activeContext.state !== 'closed') {
        activeContext.close();
      }
    } catch (e) {
      // Ignore errors during close
    }
    activeContext = null;
  }
};

// Play raw 16-bit PCM audio with singleton enforcement
export const playPCM16 = (base64Data: string, onEnded?: () => void, sampleRate = 24000) => {
  // 1. Stop any currently playing audio to prevent "two voices" effect
  stopCurrentAudio();

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    activeContext = audioContext;

    const arrayBuffer = base64ToArrayBuffer(base64Data);
    const dataInt16 = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(dataInt16.length);
    
    // Convert Int16 to Float32
    for (let i = 0; i < dataInt16.length; i++) {
      float32Data[i] = dataInt16[i] / 32768.0;
    }
    
    const buffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
    buffer.getChannelData(0).set(float32Data);
    
    const source = audioContext.createBufferSource();
    activeSource = source;
    
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    source.onended = () => {
      // Only trigger cleanup if this is still the active context
      if (activeContext === audioContext) {
        stopCurrentAudio();
        if (onEnded) onEnded();
      }
    };
    
  } catch (error) {
    console.error("Error playing audio:", error);
    stopCurrentAudio();
    if (onEnded) onEnded();
  }
};