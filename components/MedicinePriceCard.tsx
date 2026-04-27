import React, { useState } from 'react';
import { MedicinePriceResult } from '../types';
import { ExternalLink, Star, TrendingDown, ShoppingCart, Truck, Award, Bot, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { getBackendUrl } from '../src/lib/backendUrl';

interface MedicinePriceCardProps {
    query: string;
    results: MedicinePriceResult[];
    cheapest: MedicinePriceResult | null;
}

// Updated styles for Standard Light Theme (Reverted)
const PLATFORM_STYLES: Record<string, { bg: string, text: string, border: string, accent: string }> = {
    'Amazon': { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', accent: 'bg-orange-500' },
    'Flipkart': { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', accent: 'bg-blue-500' },
    '1mg': { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', accent: 'bg-red-500' },
    'Apollo': { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', accent: 'bg-teal-500' },
    'PharmEasy': { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', accent: 'bg-green-500' },
    'Netmeds': { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', accent: 'bg-purple-500' },
    'Other': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', accent: 'bg-gray-500' },
};

const STEP_LABELS: Record<string, { icon: string, label: string }> = {
    'initializing': { icon: '⚙️', label: 'Loading AI agent...' },
    'launching': { icon: '🚀', label: 'Opening Chrome browser...' },
    'navigating': { icon: '🌐', label: 'Navigating to product page...' },
    'working': { icon: '🤖', label: 'AI agent is working...' },
    'completed': { icon: '✅', label: 'Order ready for payment!' },
    'browser_open': { icon: '🖥️', label: 'Browser is open — complete payment there!' },
    'error': { icon: '❌', label: 'Something went wrong' },
};

const MedicinePriceCard: React.FC<MedicinePriceCardProps> = ({ query, results, cheapest }) => {
    const [orderingIndex, setOrderingIndex] = useState<number | null>(null);
    const [orderSteps, setOrderSteps] = useState<Array<{ step: string, detail: string }>>([]);
    const [orderStatus, setOrderStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

    if (!results || results.length === 0) return null;

    const handleAutoOrder = async (result: MedicinePriceResult, index: number) => {
        if (orderStatus === 'running') return;

        setOrderingIndex(index);
        setOrderSteps([]);
        setOrderStatus('running');

        const BACKEND_URL = getBackendUrl();
        try {
            const response = await fetch(`${BACKEND_URL}/auto-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: result.link,
                    product_title: result.title,
                    platform: result.platform
                })
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setOrderStatus('error');
                setOrderSteps(prev => [...prev, { step: 'error', detail: 'Failed to connect to server' }]);
                return;
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.step === 'done') {
                                setOrderStatus('done');
                            } else if (data.step === 'final') {
                                if (data.result?.success) {
                                    setOrderStatus('done');
                                    setOrderSteps(prev => [...prev, { step: 'completed', detail: data.result.message || 'Order at checkout!' }]);
                                } else {
                                    setOrderStatus('error');
                                    setOrderSteps(prev => [...prev, { step: 'error', detail: data.result?.error || 'Agent stopped' }]);
                                }
                            } else if (data.step === 'error') {
                                setOrderStatus('error');
                                setOrderSteps(prev => [...prev, data]);
                            } else {
                                setOrderSteps(prev => [...prev, data]);
                            }
                        } catch { /* skip malformed JSON */ }
                    }
                }
            }
        } catch (err) {
            setOrderStatus('error');
            setOrderSteps(prev => [...prev, { step: 'error', detail: 'Cannot reach backend. Is the Python server running?' }]);
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
            {/* Header */}
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-medical-600" />
                        <h3 className="text-sm font-bold text-gray-800">Price Comparison</h3>
                    </div>
                    <span className="text-[10px] text-medical-600 bg-medical-50 border border-medical-100 px-2 py-0.5 rounded-full">
                        {results.length} platforms
                    </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                    Searching for "<span className="font-semibold text-gray-900">{query}</span>"
                </p>
            </div>

            {/* Cheapest Badge */}
            {cheapest && cheapest.price !== null && (
                <div className="bg-green-50 border-b border-green-100 px-4 py-2 flex items-center gap-2">
                    <Award className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-700 font-semibold">
                        Best Price: {cheapest.price_display} on {cheapest.platform}
                    </span>
                    <TrendingDown className="w-3 h-3 text-green-600" />
                </div>
            )}

            {/* Results */}
            <div className="divide-y divide-gray-100">
                {results.map((result, index) => {
                    const style = PLATFORM_STYLES[result.platform] || PLATFORM_STYLES['Other'];
                    const isCheapest = cheapest && result.price === cheapest.price && result.platform === cheapest.platform;
                    const isOrdering = orderingIndex === index && orderStatus === 'running';

                    return (
                        <div
                            key={index}
                            className={`p-3 hover:bg-gray-50 transition-colors ${isCheapest ? 'bg-green-50/30' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Product Image */}
                                {result.image ? (
                                    <img
                                        src={result.image}
                                        alt={result.title}
                                        className="w-14 h-14 object-contain rounded-lg bg-white border border-gray-200 p-1 flex-shrink-0"
                                    />
                                ) : (
                                    <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                                        <ShoppingCart className="w-6 h-6 text-gray-400" />
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row flex-1 min-w-0 gap-3">
                                    {/* Product Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">
                                            {result.title}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text} ${style.border} border`}>
                                                {result.platform}
                                            </span>
                                            {result.rating && (
                                                <span className="flex items-center gap-0.5 text-[10px] text-yellow-500">
                                                    <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                                                    {result.rating}
                                                </span>
                                            )}
                                            {result.delivery && (
                                                <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                                                    <Truck className="w-2.5 h-2.5" />
                                                    {result.delivery}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Price + Buttons */}
                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1.5 flex-shrink-0 mt-1 sm:mt-0">
                                        <span className={`text-sm font-bold ${isCheapest ? 'text-green-600' : 'text-gray-900'}`}>
                                            {result.price_display}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={result.link || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(result.title)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`flex items-center gap-1 text-[10px] sm:text-xs font-bold text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full ${style.accent} hover:opacity-90 transition-all shadow-sm whitespace-nowrap`}
                                            >
                                                Buy <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <button
                                                onClick={() => handleAutoOrder(result, index)}
                                                disabled={orderStatus === 'running'}
                                                className={`flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full transition-all shadow-sm whitespace-nowrap ${isOrdering
                                                    ? 'bg-amber-100 text-amber-700 border border-amber-200 cursor-wait'
                                                    : orderStatus === 'running'
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-white border border-medical-200 text-medical-600 hover:bg-medical-50'
                                                    }`}
                                                title="AI agent will automatically add this to your cart"
                                            >
                                                {isOrdering ? (
                                                    <><Loader2 className="w-3 h-3 animate-spin" /> Ordering...</>
                                                ) : (
                                                    <><Bot className="w-3 h-3" /> Auto-Order</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Order Progress (inline, below the product) */}
                            {orderingIndex === index && orderSteps.length > 0 && (
                                <div className="mt-2 ml-[68px] border-l-2 border-medical-200 pl-3 space-y-1">
                                    {orderSteps.map((s, i) => {
                                        const stepInfo = STEP_LABELS[s.step] || { icon: '🔄', label: s.step };
                                        const isLast = i === orderSteps.length - 1;
                                        return (
                                            <div key={i} className={`flex items-start gap-1.5 text-[11px] ${isLast ? 'text-medical-700 font-medium' : 'text-gray-500'}`}>
                                                <span className="flex-shrink-0">{stepInfo.icon}</span>
                                                <span className="line-clamp-1">{s.detail || stepInfo.label}</span>
                                            </div>
                                        );
                                    })}
                                    {orderStatus === 'running' && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span>AI agent is working...</span>
                                        </div>
                                    )}
                                    {orderStatus === 'done' && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-semibold">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Complete payment in the browser window</span>
                                        </div>
                                    )}
                                    {orderStatus === 'error' && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-red-500">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Agent stopped — try "Buy" to order manually</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 text-center">
                    Prices fetched via Google Shopping. <strong>Buy</strong> opens the page. <strong>Auto-Order</strong> uses AI to add to cart.
                </p>
            </div>
        </div>
    );
};

export default MedicinePriceCard;
