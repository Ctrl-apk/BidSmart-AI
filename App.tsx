
import React, { useState } from 'react';
import { AgentRole, LogEntry, RFP, RFPStatus, SKU } from './types';
import { INITIAL_RFPS, SAMPLE_SKUS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesConsole from './components/SalesConsole';
import Workstation from './components/Workstation';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'sales' | 'workstation' | 'admin'>('dashboard');
  const [rfps, setRfps] = useState<RFP[]>(INITIAL_RFPS);
  const [skus, setSkus] = useState<SKU[]>(SAMPLE_SKUS);
  const [selectedRfpId, setSelectedRfpId] = useState<string | null>(null);

  const selectedRfp = rfps.find(r => r.id === selectedRfpId);

  const navigateToRfp = (id: string) => {
    setSelectedRfpId(id);
    setCurrentView('workstation');
  };

  const updateRfp = (updated: RFP) => {
    setRfps(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard rfps={rfps} onViewRfp={navigateToRfp} skus={skus} />;
      case 'sales':
        return <SalesConsole rfps={rfps} setRfps={setRfps} onSelect={navigateToRfp} />;
      case 'workstation':
        if (!selectedRfp) return <div className="p-8">Please select an RFP</div>;
        return <Workstation rfp={selectedRfp} onUpdate={updateRfp} skus={skus} />;
      case 'admin':
        return <AdminPanel skus={skus} setSkus={setSkus} />;
      default:
        return <Dashboard rfps={rfps} onViewRfp={navigateToRfp} skus={skus} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar currentView={currentView} setView={setCurrentView} />
      <main className="flex-1 overflow-y-auto">
        {renderContent()}
      </main>
    </div>
  );
}
