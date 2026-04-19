function getEnvVar(key: string): string | undefined {
  const viteEnv = (import.meta as any)?.env?.[key];
  if (viteEnv) return viteEnv;

  if (typeof process !== "undefined") {
    return (process as any)?.env?.[key];
  }

  return undefined;
}

export function getGroqApiKey(): string | undefined {
  return getEnvVar("VITE_GROQ_API_KEY") || getEnvVar("GROQ_API_KEY");
}

export function getOpenRouterApiKey(): string | undefined {
  return getEnvVar("VITE_OPENROUTER_API_KEY") || getEnvVar("OPENROUTER_API_KEY");
}

export function getGeminiApiKey(): string | undefined {
  return getEnvVar("VITE_GEMINI_API_KEY") || getEnvVar("GEMINI_API_KEY") || getEnvVar("API_KEY");
}
