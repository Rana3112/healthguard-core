const viteEnv = import.meta.env;

export function getGroqApiKey(): string | undefined {
  return viteEnv.VITE_GROQ_API_KEY;
}

export function getOpenRouterApiKey(): string | undefined {
  return viteEnv.VITE_OPENROUTER_API_KEY;
}

export function getGeminiApiKey(): string | undefined {
  return viteEnv.VITE_GEMINI_API_KEY;
}
