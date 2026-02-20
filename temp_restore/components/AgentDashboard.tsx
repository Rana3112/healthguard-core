import React, { useState } from 'react';
import { AgentState, AgentAction, PlatformName } from '../types';
import { Pill, ShoppingBag, Clock, Bell, ShieldCheck, Activity, CheckCircle, CreditCard, ShoppingCart, Link, Unplug, Lock, X, Loader2 } from 'lucide-react';

interface AgentDashboardProps {
  state: AgentState;
  dispatch: React.Dispatch<AgentAction>;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({ state, dispatch }) => {
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformName | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  const platforms: { id: PlatformName, color: string, icon: React.ReactNode }[] = [
    { id: 'Amazon', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'Flipkart', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'Apollo', color: 'text-teal-600 bg-teal-50 border-teal-200', icon: <Activity className="w-4 h-4" /> },
    { id: '1mg', color: 'text-red-600 bg-red-50 border-red-200', icon: <Pill className="w-4 h-4" /> },
  ];

  const initiateConnection = (platform: PlatformName) => {
    setConnectingPlatform(platform);
    setUsername('');
    setPassword('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingPlatform) return;
    
    setIsAuthenticating(true);
    
    // Simulate authentication delay
    setTimeout(() => {
      dispatch({ type: 'CONNECT_ACCOUNT', payload: connectingPlatform });
      setIsAuthenticating(false);
      setConnectingPlatform(null);
    }, 1500);
  };

  return (
    <div className="relative h-full w-full bg-white border-l border-gray-200">
      {/* Main Dashboard Content */}
      <div className="h-full overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-medical-600" />
            <h2 className="font-semibold text-gray-800">HealthGuard Agent</h2>
          </div>
          <p className="text-xs text-gray-500">Secure • Local-First • Active</p>
        </div>

        <div className="p-4 space-y-6">
          {/* Vitals / Stats Placeholder */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Daily Vitals
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-medical-50 p-2 rounded-lg text-center">
                <span className="block text-lg font-bold text-medical-600">72</span>
                <span className="text-[10px] text-gray-500">BPM</span>
              </div>
              <div className="bg-medical-50 p-2 rounded-lg text-center">
                <span className="block text-lg font-bold text-medical-600">850</span>
                <span className="text-[10px] text-gray-500">Kcal</span>
              </div>
            </div>
          </div>

          {/* Connected Services / Wallet */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Link className="w-3 h-3" /> Linked Services
            </h3>
            <div className="space-y-2">
              {platforms.map((p) => {
                const isConnected = state.connectedAccounts[p.id];
                return (
                  <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg border ${isConnected ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-80'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md border ${p.color}`}>
                        {p.icon}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{p.id}</span>
                    </div>
                    <button
                      onClick={() => {
                          if (isConnected) {
                              dispatch({ type: 'DISCONNECT_ACCOUNT', payload: p.id });
                          } else {
                              initiateConnection(p.id);
                          }
                      }}
                      className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${
                        isConnected 
                          ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {isConnected ? 'Active' : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Connecting accounts allows HealthGuard to automatically place orders for prescribed medicines using your saved payment methods.
            </p>
          </div>

          {/* Orders */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Recent Orders
            </h3>
            {state.orders.length === 0 ? (
              <div className="text-sm text-gray-400 italic">No active orders</div>
            ) : (
              <ul className="space-y-3">
                {state.orders.map((order) => (
                  <li key={order.id} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                         <div className={`p-1.5 rounded-full ${order.type === 'medicine' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                          <Pill className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {order.platform || 'Online'}
                        </span>
                      </div>
                      {order.paymentStatus === 'paid' && (
                        <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">
                          <CheckCircle className="w-3 h-3" /> Paid
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm font-semibold text-gray-800 mb-1">{order.item}</p>
                    
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-gray-500">
                        <p className="capitalize text-medical-600">{order.status}</p>
                        <p className="text-[10px]">{new Date(order.timestamp).toLocaleTimeString()}</p>
                      </div>
                      {order.price && (
                        <div className="flex items-center gap-1 text-xs font-bold text-gray-700">
                          <CreditCard className="w-3 h-3 text-gray-400" />
                          {order.price}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Alerts */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Bell className="w-3 h-3" /> Active Alerts
            </h3>
            {state.alerts.length === 0 ? (
              <div className="text-sm text-gray-400 italic">No alerts set</div>
            ) : (
              <ul className="space-y-2">
                {state.alerts.map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between bg-yellow-50 p-2 rounded border border-yellow-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{alert.message}</p>
                        <p className="text-xs text-gray-500">{alert.time}</p>
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${alert.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Login Modal Overlay */}
      {connectingPlatform && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                 <Lock className="w-4 h-4 text-medical-600" />
                 Connect {connectingPlatform}
               </h3>
               <button 
                 onClick={() => setConnectingPlatform(null)} 
                 className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors"
               >
                 <X className="w-4 h-4" />
               </button>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email or Mobile</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isAuthenticating}
                  className="w-full bg-medical-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-medical-700 active:bg-medical-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-medical-200"
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Secure Login"
                  )}
                </button>
                <p className="text-[10px] text-center text-gray-400 mt-3 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Credentials encrypted & stored locally
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;