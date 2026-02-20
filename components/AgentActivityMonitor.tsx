import React, { useEffect, useRef, useState } from 'react';
import { AgentSession, AgentAction, HealthOrder } from '../types';
import { Loader2, Lock, CheckCircle, CreditCard, ShoppingCart, Terminal, Maximize2, Minimize2, X, AlertTriangle } from 'lucide-react';

interface AgentActivityMonitorProps {
  session: AgentSession;
  orders: HealthOrder[];
  dispatch: React.Dispatch<AgentAction>;
}

const AgentActivityMonitor: React.FC<AgentActivityMonitorProps> = ({ session, orders, dispatch }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'browser' | 'terminal'>('browser');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);

  // Auto-scroll terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  // Simulate agent logs progressively
  useEffect(() => {
    if (session.isActive && session.logs.length > logs.length) {
      const timeout = setTimeout(() => {
        setLogs(prev => [...prev, session.logs[prev.length]]);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [session.logs, logs, session.isActive]);

  // Simulate Agent Process Steps
  useEffect(() => {
    if (session.isActive && session.status === 'connecting') {
      const runAgentSimulation = async () => {
        // 1. Searching
        await new Promise(r => setTimeout(r, 2000));
        dispatch({
          type: 'UPDATE_SESSION_STATUS',
          payload: { status: 'searching', log: `Navigating to ${session.platform}...`, progress: 20 }
        });

        // 2. Selecting
        await new Promise(r => setTimeout(r, 3000));
        dispatch({
          type: 'UPDATE_SESSION_STATUS',
          payload: { status: 'selecting', log: `Found "${session.item}". Verifying price and stock...`, progress: 50 }
        });

        // 3. Checkout
        await new Promise(r => setTimeout(r, 2500));
        dispatch({
          type: 'UPDATE_SESSION_STATUS',
          payload: { status: 'checkout', log: `Adding to cart and initiating secure checkout...`, progress: 80 }
        });

        // 4. Completed
        await new Promise(r => setTimeout(r, 2500));

        const newOrder: HealthOrder = {
          id: Math.random().toString(36).substr(2, 9),
          item: session.item,
          type: 'medicine',
          status: 'ordered',
          platform: session.platform,
          price: `₹${250 * session.quantity}`, // Mock price
          paymentStatus: 'paid',
          timestamp: new Date()
        };

        dispatch({ type: 'ADD_ORDER', payload: newOrder });
        dispatch({
          type: 'UPDATE_SESSION_STATUS',
          payload: { status: 'completed', log: `Order placed successfully! Order ID: ${newOrder.id}`, progress: 100 }
        });
        setShowConfetti(true);

        // End Session after delay
        setTimeout(() => dispatch({ type: 'END_AGENT_SESSION' }), 5000);
      };

      runAgentSimulation();
    }
  }, [session.isActive, session.status, dispatch, session.item, session.platform, session.quantity]);

  if (!session.isActive) return null;

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-full shadow-lg cursor-pointer hover:bg-blue-700 transition-all z-50 flex items-center gap-2 animate-bounce-subtle"
        onClick={() => setIsMinimized(false)}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-bold">Agent Active</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden" style={{ animation: 'zoomIn 0.3s ease-out' }}>

        {/* Header (Browser Chrome) */}
        <div className="bg-gray-100 border-b border-gray-200 p-3 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-400 cursor-pointer hover:bg-red-500" onClick={() => dispatch({ type: 'END_AGENT_SESSION' })} />
              <div className="w-3 h-3 rounded-full bg-yellow-400 cursor-pointer hover:bg-yellow-500" onClick={() => setIsMinimized(true)} />
              <div className="w-3 h-3 rounded-full bg-green-400 cursor-pointer hover:bg-green-500" />
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md text-xs text-gray-500 shadow-sm border border-gray-200 min-w-[300px]">
              <Lock className="w-3 h-3 text-green-600" />
              <span className="truncate">https://www.{session.platform ? session.platform.toLowerCase() : 'healthguard'}.in/checkout/secure</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('browser')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'browser' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              Browser Not View
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'terminal' ? 'bg-black text-green-400' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              Terminal Log
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col">

          {/* Progress Bar */}
          <div className="h-1 bg-gray-100 w-full">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${session.progress}%` }}
            />
          </div>

          {activeTab === 'browser' ? (
            <div className="flex-1 bg-gray-50 p-8 flex flex-col items-center justify-center relative overflow-hidden">

              {/* Simulated Browser View */}
              <div className="w-full max-w-2xl bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">

                {/* Product Section */}
                <div className="flex gap-4 animate-pulse-subtle">
                  <div className="w-24 h-24 bg-gray-200 rounded-md"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-8 bg-gray-100 rounded w-full mt-2"></div>
                  </div>
                </div>

                {/* Agent Overlay Actions */}
                <div className="border-t border-gray-100 pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {session.status === 'completed' ? (
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 animate-spin">
                          <Loader2 className="w-6 h-6" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-gray-900 capitalize">{session.status.replace('-', ' ')}...</h4>
                        <p className="text-xs text-gray-500">Autonomous Agent ID: HG-8821</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">₹{250 * session.quantity}</div>
                      <div className="text-xs text-gray-400">Total verified</div>
                    </div>
                  </div>
                </div>

                {/* Confetti (Success) */}
                {session.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                    <div className="text-center animate-bounce-in">
                      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-green-200">
                        <CheckCircle className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800">Order Placed!</h3>
                      <p className="text-gray-500">Redirecting to dashboard...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 text-center text-xs text-gray-400 flex flex-col items-center">
                <Terminal className="w-4 h-4 mb-2 opacity-50" />
                <p>HealthGuard Autonomous Browser • v2.1.0 • Running on Chromium Headless</p>
              </div>

            </div>
          ) : (
            <div className="flex-1 bg-slate-900 p-4 font-mono text-sm overflow-y-auto" ref={scrollRef}>
              {logs.map((log, i) => (
                <div key={i} className="mb-1 text-green-400 flex gap-2">
                  <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
                  <span>{'>'} {log}</span>
                </div>
              ))}
              {session.isActive && session.status !== 'completed' && (
                <div className="animate-pulse text-green-400 ml-2">_</div>
              )}
            </div>
          )}
        </div>

        {/* Status Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-2 px-4 flex justify-between items-center text-xs text-gray-500">
          <span>Session ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
          <span className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${session.status === 'completed' ? 'bg-green-500' : 'bg-green-500 animate-pulse'}`}></div>
            {session.status === 'completed' ? 'Tasks Completed' : 'Agent Running'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AgentActivityMonitor;