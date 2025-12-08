
import React from 'react';
import { RFP, RFPStatus, SKU } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock, CheckCircle, AlertTriangle, Bell, AlertOctagon, PlusCircle, ArrowRight, Settings, ShoppingCart, Briefcase } from 'lucide-react';

interface DashboardProps {
  rfps: RFP[];
  onViewRfp: (id: string) => void;
  skus: SKU[];
}

const Dashboard: React.FC<DashboardProps> = ({ rfps, onViewRfp, skus }) => {
  const stats = {
    discovered: rfps.filter(r => r.status === RFPStatus.DISCOVERED).length,
    completed: rfps.filter(r => r.status === RFPStatus.COMPLETED).length,
    processing: rfps.filter(r => r.status === RFPStatus.PROCESSING).length,
  };

  const pipelineData = [
    { name: 'Discovered', value: stats.discovered },
    { name: 'Processing', value: stats.processing },
    { name: 'Review', value: 0 },
    { name: 'Submitted', value: stats.completed },
  ];

  // Identify low stock items
  const lowStockItems = skus.filter(sku => sku.stockQty <= sku.minStockThreshold);

  // Workflow Steps Component
  const WorkflowSteps = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-8">
      <h3 className="text-lg font-bold text-slate-800 mb-4">Workflow Guide</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Step 1 */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex gap-3 hover:border-blue-200 transition-colors">
          <div className="bg-white border border-slate-200 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 shadow-sm">
             <Settings size={18} />
          </div>
          <div>
             <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                1. Add Inventory
                <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Admin Panel</span>
             </h4>
             <p className="text-xs text-slate-500 mt-1">Upload specs or use AI to generate stock data.</p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex gap-3 hover:border-indigo-200 transition-colors">
          <div className="bg-white border border-slate-200 text-indigo-600 w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 shadow-sm">
             <ShoppingCart size={18} />
          </div>
          <div>
             <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                2. Find RFPs
                <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Sales Console</span>
             </h4>
             <p className="text-xs text-slate-500 mt-1">Use the Agent to scan the web for opportunities.</p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex gap-3 hover:border-green-200 transition-colors">
          <div className="bg-white border border-slate-200 text-green-600 w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 shadow-sm">
             <Briefcase size={18} />
          </div>
          <div>
             <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                3. Generate Bid
                <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Workstation</span>
             </h4>
             <p className="text-xs text-slate-500 mt-1">Run multi-agent pipeline to build proposal.</p>
          </div>
        </div>

      </div>
    </div>
  );

  if (rfps.length === 0 && skus.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="text-blue-600" size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-800">Welcome to BidSmart AI</h2>
              <p className="text-slate-500 max-w-lg">
                  Follow the steps below to unleash the power of the Agentic Workflow.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-8 text-left">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Settings size={80} />
                      </div>
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10"><div className="bg-blue-100 p-1.5 rounded"><PlusCircle size={18} className="text-blue-600"/></div> 1. Add Inventory</h3>
                      <p className="text-sm text-slate-500 mb-4 relative z-10">
                          The Technical Agent needs product data to perform matching.
                      </p>
                      <button className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline relative z-10">
                          Go to Admin Panel <ArrowRight size={14} />
                      </button>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <ShoppingCart size={80} />
                      </div>
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10"><div className="bg-indigo-100 p-1.5 rounded"><PlusCircle size={18} className="text-indigo-600"/></div> 2. Find RFPs</h3>
                      <p className="text-sm text-slate-500 mb-4 relative z-10">
                          Use the Sales Agent to scan the web for new opportunities.
                      </p>
                      <button className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:underline relative z-10">
                          Go to Sales Console <ArrowRight size={14} />
                      </button>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-green-300 transition-all relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Briefcase size={80} />
                      </div>
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10"><div className="bg-green-100 p-1.5 rounded"><PlusCircle size={18} className="text-green-600"/></div> 3. Auto-Bid</h3>
                      <p className="text-sm text-slate-500 mb-4 relative z-10">
                          Run the workstation agents to generate PDFs.
                      </p>
                      <button className="text-green-600 text-sm font-bold flex items-center gap-1 hover:underline relative z-10">
                          Go to Workstation <ArrowRight size={14} />
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Executive Dashboard</h2>
        <p className="text-slate-500">Real-time overview of RFP pipeline and agent performance.</p>
      </div>

      <WorkflowSteps />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Pipeline</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">{rfps.length}</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
          </div>
          <div className="mt-4 text-xs text-green-600 flex items-center gap-1">
            <TrendingUp size={12} /> Live
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Avg. Turnaround</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">1.2h</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Clock size={24} />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400">Target: &lt; 4 hours</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Auto-Complete Rate</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">85%</h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <CheckCircle size={24} />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400">No manual override required</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Est. Win Value</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2 truncate">
                 {/* Default symbol if undefined, mostly handled by Workstation now */}
                 ₹{rfps.reduce((acc, r) => acc + (r.finalResponse?.grandTotal || 0), 0).toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Charts */}
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Pipeline Volume</h3>
            <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#f1f5f9'}} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            </div>

            {/* Notifications / Messages Area */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                    <Bell className="text-slate-500" size={20} />
                    <h3 className="text-lg font-bold text-slate-800">System Notifications & Alerts</h3>
                </div>
                
                <div className="space-y-3">
                    {lowStockItems.length > 0 ? (
                        lowStockItems.map(sku => (
                            <div key={sku.id} className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white p-2 rounded-full text-red-500 shadow-sm">
                                        <AlertOctagon size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-red-900 text-sm">Low Stock Alert</h4>
                                        <p className="text-red-700 text-xs">
                                            Material <strong>{sku.modelName}</strong> is below threshold. Current: {sku.stockQty} (Min: {sku.minStockThreshold})
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xs font-mono bg-red-200 text-red-800 px-2 py-1 rounded">Urgent</span>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-slate-500 text-sm text-center">
                            No active system alerts. All systems operational.
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Col: Recent RFPs */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Recent RFPs</h3>
          {rfps.length > 0 ? (
              <div className="space-y-4">
                {rfps.slice(0, 3).map(rfp => (
                  <div key={rfp.id} className="p-4 border border-slate-100 rounded-lg hover:border-blue-200 transition-colors cursor-pointer" onClick={() => onViewRfp(rfp.id)}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${rfp.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {rfp.status}
                      </span>
                      <span className="text-xs text-slate-400">{rfp.dueDate}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{rfp.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{rfp.client}</p>
                  </div>
                ))}
              </div>
          ) : (
              <p className="text-sm text-slate-400 italic">No RFPs in pipeline.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
