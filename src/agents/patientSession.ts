import { MemorySaver } from '@langchain/langgraph/web';

const sessionStore = new Map<string, MemorySaver>();

export function getOrCreateCheckpointer(threadId: string): MemorySaver {
  if (!sessionStore.has(threadId)) {
    sessionStore.set(threadId, new MemorySaver());
  }
  return sessionStore.get(threadId)!;
}

export function clearSession(threadId: string): void {
  sessionStore.delete(threadId);
}
