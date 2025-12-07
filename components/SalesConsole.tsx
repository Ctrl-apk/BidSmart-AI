import React, { useState } from 'react';
import { RFP, RFPStatus } from '../types';
import { Search, Globe, Loader2, ArrowRight, Download } from 'lucide-react';

interface SalesConsoleProps {
  rfps: RFP[];
  setRfps: React.Dispatch<React.SetStateAction<RFP[]>>;
  onSelect: (id: string) => void;
}

const SalesConsole: React.FC<SalesConsoleProps> = ({ rfps, setRfps, onSelect }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanTerm, setScanTerm] = useState('distribution transformers');

  const handleScan = async () => {
    setIsScanning(true);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create Top 3 RFP opportunities based on the search term
    const isUrl = scanTerm.includes('http');
    const baseTitle = isUrl ? `Tender Detected from URL` : scanTerm;
    
    const newRfps: RFP[] = [
      {
        id: `rfp-${Date.now()}-1`,
        title: isUrl ? `${baseTitle} - Primary Scope` : `Supply of ${baseTitle} - Phase 1`,
        client: 'Global Infrastructure Corp',
        dueDate: new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
        url: isUrl ? scanTerm : `https://tenders.gov/2024/${scanTerm.replace(/\s+/g, '-').toLowerCase()}-1.pdf`,
        excerpt: `High priority tender for ${baseTitle}. Strict technical compliance required for immediate project start.`,
        status: RFPStatus.DISCOVERED,
        products: [],
        tests: []
      },
      {
        id: `rfp-${Date.now()}-2`,
        title: isUrl ? `${baseTitle} - Ancillary Works` : `Annual Maintenance for ${baseTitle}`,
        client: 'Regional Utility Board',
        dueDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
        url: isUrl ? scanTerm : `https://rub.gov/procurement/${scanTerm.replace(/\s+/g, '-').toLowerCase()}-amc.pdf`,
        excerpt: `Long-term framework agreement for supply and maintenance of ${baseTitle} across multiple sites.`,
        status: RFPStatus.DISCOVERED,
        products: [],
        tests: []
      },
      {
        id: `rfp-${Date.now()}-3`,
        title: isUrl ? `${baseTitle} - Spare Parts` : `Emergency Procurement: ${baseTitle}`,
        client: 'Metro Transit Authority',
        dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        url: isUrl ? scanTerm : `https://mta.city/bids/${scanTerm.replace(/\s+/g, '-').toLowerCase()}-urgent.pdf`,
        excerpt: `Expedited procurement process for ${baseTitle} spares and replacement units.`,
        status: RFPStatus.DISCOVERED,
        products: [],
        tests: []
      }
    ];

    setRfps(prev => [...newRfps, ...prev]);
    setIsScanning(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Sales Agent Console</h2>
          <p className="text-slate-500">Automated web scanning and RFP discovery.</p>
        </div>
        <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium">
                <Download size={16} /> Export CSV
            </button>
        </div>
      </div>

      {/* Scanner Control - Light Color Box */}
      <div className="bg-indigo-50 p-6 rounded-xl shadow-sm border border-indigo-100 mb-8">
        <label className="block text-sm font-bold text-indigo-900 mb-2">Target Keywords / Portals / URLs</label>
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-indigo-400" size={20} />
            <input 
              type="text" 
              value={scanTerm}
              onChange={(e) => setScanTerm(e.target.value)}
              placeholder="Enter keywords or paste specific tender URL"
              className="w-full pl-10 pr-4 py-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-indigo-900 placeholder-indigo-300"
            />
          </div>
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-70 flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            {isScanning ? <Loader2 className="animate-spin" /> : <Globe size={18} />}
            {isScanning ? 'Scan Top 3' : 'Scan Top 3'}
          </button>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-indigo-600 font-medium">
           <span>Sources: <strong>TendersInfo, GovProcure, UtilityDaily</strong></span>
           <span>Next scheduled scan: <strong>Tomorrow, 09:00 AM</strong></span>
        </div>
      </div>

      {/* Results Grid */}
      <h3 className="text-lg font-bold text-slate-800 mb-4">Discovered Opportunities</h3>
      <div className="space-y-4">
        {rfps.map((rfp) => (
          <div key={rfp.id} className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md transition-shadow flex justify-between items-center group animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide ${rfp.status === RFPStatus.COMPLETED ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {rfp.status}
                    </span>
                    <span className="text-sm text-slate-500">Due: {rfp.dueDate}</span>
                </div>
                <h4 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {rfp.title}
                </h4>
                <p className="text-sm text-slate-600 mt-1 mb-2">{rfp.client}</p>
                <p className="text-sm text-slate-500 italic max-w-3xl border-l-2 border-slate-200 pl-3 line-clamp-2">
                    "{rfp.excerpt}"
                </p>
                <a href={rfp.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-2 inline-block">
                    View Source PDF
                </a>
            </div>
            
            <button 
                onClick={() => onSelect(rfp.id)}
                className="ml-6 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 group-hover:bg-blue-600 group-hover:text-white transition-all flex items-center gap-2 whitespace-nowrap"
            >
                Start Response <ArrowRight size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesConsole;