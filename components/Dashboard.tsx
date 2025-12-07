
import React from 'react';
import { RFP, RFPStatus, SKU } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock, CheckCircle, AlertTriangle, Bell, AlertOctagon } from 'lucide-react';

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
    { name: 'Review', value: 1 },
    { name: 'Submitted', value: stats.completed },
  ];

  // Identify low stock items
  const lowStockItems = skus.filter(sku => sku.stockQty <= sku.minStockThreshold);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Executive Dashboard</h2>
        <p className="text-slate-500">Real-time overview of RFP pipeline and agent performance.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <TrendingUp size={12} /> +12% from last month
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
              <h3 className="text-3xl font-bold text-slate-900 mt-2">$4.5M</h3>
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
            <div className="h-64">
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

                    {/* Example generic message */}
                    <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-lg">
                         <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-full text-blue-500 shadow-sm">
                                <Bell size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-blue-900 text-sm">System Update</h4>
                                <p className="text-blue-700 text-xs">
                                    Pricing Logic v2.4 has been applied to all new RFPs.
                                </p>
                            </div>
                         </div>
                         <span className="text-xs text-blue-400">2h ago</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Col: Recent RFPs */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Recent RFPs</h3>
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
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
