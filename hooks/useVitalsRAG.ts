import { useState, useEffect, useCallback } from 'react';
import { retrieveVitalsContext, retrieveVitalsContextLite } from '../services/vitalsRAG';

/**
 * Hook that provides reactive vitals RAG context.
 * Listens for 'vitals-updated' events and refreshes the context string.
 */
export function useVitalsRAG() {
    const [vitalsContext, setVitalsContext] = useState<string>('');
    const [vitalsContextLite, setVitalsContextLite] = useState<string>('');

    const refresh = useCallback(() => {
        setVitalsContext(retrieveVitalsContext());
        setVitalsContextLite(retrieveVitalsContextLite());
    }, []);

    useEffect(() => {
        refresh();
        const handler = () => refresh();
        window.addEventListener('vitals-updated', handler);
        return () => window.removeEventListener('vitals-updated', handler);
    }, [refresh]);

    return { vitalsContext, vitalsContextLite, refreshVitals: refresh };
}
