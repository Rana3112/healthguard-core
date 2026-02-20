import React, { useEffect, useRef } from 'react';
import { AgentSession, AgentAction, HealthOrder } from '../types';
import { Loader2, Lock, ArrowRight, CheckCircle, CreditCard, ShoppingCart, Terminal, Maximize2, Minimize2, X } from 'lucide-react';

interface AgentActivityMonitorProps {
  session: AgentSession;
  dispatch: React.Dispatch<AgentAction>;
}

const AgentActivityMonitor: React.FC<AgentActivityMonitorProps> = ({ session, dispatch }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.logs]);

  // Simulation Timeline
  useEffect(() => {
    if (!session.isActive) return;

    let timeoutIds: any[] = [];

    const steps = [
      {
        time: 1000,
        status: 'searching',
        log: `Navigating to ${session.platform.toLowerCase()}.com...`,
        progress: 20
      },
      {
        time: 2500,
        status: 'searching',
        log: `Searching DOM for input#search-bar... Found.`,
        progress: 35
      },
      {
        time: 3500,
        status: 'searching',
        log: `Typing query: "${session.item}"...`,
        progress: 45
      },
      {
        time: 5000,
        status: 'selecting',
        log: `Parsing search results... Best match found (Confidence: 98%).`,
        progress: 60
      },
      {
        time: 6500,
        status: 'selecting',
        log: `Extracting price... Verified. Clicked [Add to Cart].`,
        progress: 75
      },
      {
        time: 8000,
        status: 'checkout',
        log: `Redirecting to checkout. Verifying delivery address...`,
        progress: 85
      },
      {
        time: 9500,
        status: 'completed',
        log: `Payment processed (**** 4242). Order confirmed.`,
        progress: 100
      }
    ];

    // Execute steps
    steps.forEach(step => {
      const id = setTimeout(() => {
        dispatch({
          type: 'UPDATE_SESSION_STATUS',
          payload: {
            status: step.status as any,
            log: step.log,
            progress: step.progress
          }
        });

        // Finalize
        if (step.status === 'completed') {
           setTimeout(() => {
             const priceMap: {[key: string]: number} = { 'Amazon': 250, 'Flipkart': 240, '1mg': 220, 'Apollo': 230 };
             const basePrice = priceMap[session.platform] || 200;
             const finalPrice = basePrice * session.quantity;

             const order: HealthOrder = {
                id: Math.random().toString(36).substr(2, 9),
                item: session.item,
                type: 'medicine', // simplified assumption
                status: 'ordered',
                platform: session.platform,
                price: `₹${finalPrice}`,
                paymentStatus: 'paid',
                timestamp: new Date()
              };
              dispatch({ type: 'ADD_ORDER', payload: order });
              // Close window after short delay
              setTimeout(() => dispatch({ type: 'END_AGENT_SESSION' }), 2000);
           }, 1000);
        }
      }, step.time);
      timeoutIds.push(id);
    });

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // UI Theme Helpers
  const getThemeColor = () => {
    switch(session.platform) {
      case 'Amazon': return 'bg-slate-900';
      case 'Flipkart': return 'bg-blue-600';
      case '1mg': return 'bg-orange-500';
      case 'Apollo': return 'bg-teal-600';
      default: return 'bg-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Browser Header */}
        <div className="bg-gray-100 border-b border-gray-200 p-2 flex items-center gap-3">
          <div className="flex gap-1.5 ml-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-1.5 flex items-center gap-2 text-xs text-gray-500 font-mono shadow-inner">
            <Lock className="w-3 h-3 text-green-600" />
            https://www.{session.platform.toLowerCase()}.in/checkout/secure
          </div>
          <div className="flex gap-2 text-gray-400">
            <Minimize2 className="w-4 h-4" />
            <Maximize2 className="w-4 h-4" />
            <X className="w-4 h-4 cursor-pointer hover:text-red-500" onClick={() => dispatch({type: 'END_AGENT_SESSION'})} />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Main Viewport (Simulated Website) */}
            <div className="flex-1 bg-gray-50 flex flex-col relative">
                {/* Navbar Mock */}
                <div className={`${getThemeColor()} h-14 w-full flex items-center px-4 justify-between text-white shadow-md z-10`}>
                   <div className="font-bold text-lg tracking-tight flex items-center gap-2">
                     <ShoppingCart className="w-5 h-5" /> {session.platform}
                   </div>
                   <div className="bg-white/20 h-8 w-1/3 rounded flex items-center px-3 text-xs text-white/70">
                      Searching for '{session.item}'...
                   </div>
                   <div className="flex gap-4 text-sm">
                      <span>Account</span>
                      <span>Cart ({(session.status === 'checkout' || session.status === 'completed') ? session.quantity : 0})</span>
                   </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 p-8 overflow-y-auto">
                   {session.status === 'searching' && (
                      <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
                        {[1,2,3].map(i => (
                          <div key={i} className="flex gap-4 border border-gray-200 p-4 rounded-lg bg-white">
                            <div className="w-32 h-32 bg-gray-200 rounded"></div>
                            <div className="flex-1 space-y-2">
                               <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                               <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                               <div className="h-8 bg-gray-200 rounded w-1/4 mt-4"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                   )}

                   {(session.status === 'selecting' || session.status === 'checkout' || session.status === 'completed') && (
                      <div className="flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                         <div className="w-full md:w-1/3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-center">
                            {/* Placeholder Product Image */}
                            <div className="text-6xl text-gray-200 font-bold">Rx</div>
                         </div>
                         <div className="flex-1 space-y-4">
                            <h1 className="text-2xl font-bold text-gray-800">{session.item}</h1>
                            <p className="text-green-600 font-medium text-lg">In Stock • Delivery by Tomorrow</p>
                            <div className="flex items-center gap-2">
                               <span className="text-yellow-500">★★★★☆</span>
                               <span className="text-gray-400 text-sm">(1,240 reviews)</span>
                            </div>
                            
                            <div className="border-t border-gray-100 my-4 pt-4">
                              <div className="flex justify-between items-center mb-4">
                                <span className="text-gray-600">Quantity:</span>
                                <span className="font-bold">{session.quantity}</span>
                              </div>
                              <div className="flex justify-between items-center mb-6">
                                <span className="text-gray-600">Total:</span>
                                <span className="text-2xl font-bold text-gray-900">₹{250 * session.quantity}</span>
                              </div>
                              
                              <button 
                                className={`w-full py-4 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${
                                  session.status === 'completed' ? 'bg-green-600' : 'bg-yellow-500'
                                }`}
                              >
                                {session.status === 'completed' ? (
                                  <> <CheckCircle className="w-5 h-5" /> Order Placed </>
                                ) : (
                                  <> 
                                    {session.status === 'checkout' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                                    {session.status === 'checkout' ? "Processing..." : "Buy Now"}
                                  </>
                                )}
                              </button>
                            </div>
                         </div>
                      </div>
                   )}
                </div>
            </div>

            {/* Right Side: Agent Terminal / Debug Log */}
            <div className="w-80 bg-gray-900 text-green-400 font-mono text-xs flex flex-col border-l border-gray-700">
               <div className="p-2 border-b border-gray-700 flex items-center gap-2 text-gray-400 font-bold uppercase tracking-wider">
                 <Terminal className="w-3 h-3" /> Agent Activity Log
               </div>
               <div className="flex-1 overflow-y-auto p-3 space-y-2" ref={scrollRef}>
                  {session.logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="opacity-50 select-none">{`>`}</span>
                      <span>{log}</span>
                    </div>
                  ))}
                  {session.status !== 'completed' && (
                     <div className="animate-pulse">_</div>
                  )}
               </div>
               
               {/* Progress Bar in Terminal */}
               <div className="p-3 bg-gray-800 border-t border-gray-700">
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{session.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-green-500 transition-all duration-500 ease-out"
                        style={{ width: `${session.progress}%` }}
                     />
                  </div>
               </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AgentActivityMonitor;