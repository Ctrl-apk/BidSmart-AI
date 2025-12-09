
import React, { useState } from 'react';
import { AgentRole, LogEntry, RFP, RFPStatus, SKU, User } from './types';
import { INITIAL_RFPS, SAMPLE_SKUS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesConsole from './components/SalesConsole';
import Workstation from './components/Workstation';
import AdminPanel from './components/AdminPanel';
import Auth from './components/Auth';
import { Menu } from 'lucide-react';

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);

  // App State
  const [currentView, setCurrentView] = useState<'dashboard' | 'sales' | 'workstation' | 'admin'>('dashboard');
  const [rfps, setRfps] = useState<RFP[]>(INITIAL_RFPS);
  const [skus, setSkus] = useState<SKU[]>(SAMPLE_SKUS);
  const [selectedRfpId, setSelectedRfpId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const selectedRfp = rfps.find(r => r.id === selectedRfpId);

  const navigateToRfp = (id: string) => {
    setSelectedRfpId(id);
    setCurrentView('workstation');
  };

  const updateRfp = (updated: RFP) => {
    setRfps(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleLogin = (authenticatedUser: User) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('dashboard');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard 
          rfps={rfps} 
          onViewRfp={navigateToRfp} 
          skus={skus} 
          onNavigate={setCurrentView} 
        />;
      case 'sales':
        return <SalesConsole rfps={rfps} setRfps={setRfps} onSelect={navigateToRfp} skus={skus} />;
      case 'workstation':
        if (!selectedRfp) return <div className="p-8 text-center text-slate-500">Please select an RFP from the Dashboard or Sales Console.</div>;
        return <Workstation rfp={selectedRfp} onUpdate={updateRfp} skus={skus} />;
      case 'admin':
        return <AdminPanel skus={skus} setSkus={setSkus} />;
      default:
        return <Dashboard 
          rfps={rfps} 
          onViewRfp={navigateToRfp} 
          skus={skus} 
          onNavigate={setCurrentView} 
        />;
    }
  };

  // Render Auth Screen if not logged in
  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        currentView={currentView} 
        setView={(view) => {
          setCurrentView(view);
          setIsSidebarOpen(false);
        }} 
        user={user}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col w-full h-full overflow-hidden bg-slate-50 relative">
        {/* Mobile Header */}
        <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0 z-30">
           <div className="flex items-center gap-2">
             <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold text-white">BS</span>
             <h1 className="font-bold text-slate-800">BidSmart AI</h1>
           </div>
           <button 
             onClick={() => setIsSidebarOpen(true)}
             className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
           >
             <Menu size={24} />
           </button>
        </div>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto w-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
