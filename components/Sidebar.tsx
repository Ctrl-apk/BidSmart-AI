import React from 'react';
import { LayoutDashboard, ShoppingCart, Briefcase, Settings, FileText } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setView: (view: any) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales Agent', icon: ShoppingCart },
    { id: 'workstation', label: 'Workstation', icon: Briefcase },
    { id: 'admin', label: 'Admin & Config', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">BS</span>
            BidSmart AI
        </h1>
        <p className="text-xs text-slate-500 mt-1">Agentic RFP Response System</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                active 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-white">
            JD
          </div>
          <div>
            <p className="text-sm font-medium text-white">John Doe</p>
            <p className="text-xs text-slate-500">Proposal Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;