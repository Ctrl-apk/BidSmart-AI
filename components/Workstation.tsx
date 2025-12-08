
import React, { useState, useEffect, useRef } from 'react';
import { RFP, AgentRole, LogEntry, RFPStatus, SKUMatch, FinalResponse, SKU } from '../types';
import { Orchestrator } from '../services/orchestrator';
import { Play, RotateCcw, FileText, Cpu, Calculator, CheckCircle2, ChevronRight, Activity, Download, Loader2, AlertTriangle, PackageX, Check, Coins } from 'lucide-react';

interface WorkstationProps {
  rfp: RFP;
  onUpdate: (rfp: RFP) => void;
  skus: SKU[];
}

// Declare jsPDF and autoTable for TS since they are loaded via importmap
declare const jspdf: any;
declare const doc: any;

const CURRENCY_OPTIONS = [
    { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
    { code: 'EUR', symbol: '€', name: 'Euro (€)' },
    { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen (¥)' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar (C$)' },
];

const Workstation: React.FC<WorkstationProps> = ({ rfp, onUpdate, skus }) => {
  // We keep the logs state to satisfy the Orchestrator callback, even if we don't display the panel
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgents, setActiveAgents] = useState<AgentRole[]>([]);
  const [skuMatches, setSkuMatches] = useState<SKUMatch[]>([]);
  const [finalPricing, setFinalPricing] = useState<FinalResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'pricing' | 'response'>('overview');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  
  const orchestratorRef = useRef<Orchestrator | null>(null);

  // Initialize orchestrator
  useEffect(() => {
    orchestratorRef.current = new Orchestrator((log) => {
      setLogs(prev => [...prev, log]);
    });
  }, []);

  // Sync state if RFP is already completed
  useEffect(() => {
    if (rfp.finalResponse) {
        setFinalPricing(rfp.finalResponse);
        if (rfp.finalResponse.currency) {
            setSelectedCurrency(rfp.finalResponse.currency);
        }
        if (rfp.status === RFPStatus.COMPLETED) {
            setActiveTab('response');
        }
    }
  }, [rfp]);

  // Automatic Tab Switching logic
  useEffect(() => {
    if (activeAgents.includes(AgentRole.MAIN)) setActiveTab('overview');
    if (activeAgents.includes(AgentRole.TECHNICAL) && activeAgents.includes(AgentRole.PRICING)) setActiveTab('technical');
    else if (activeAgents.includes(AgentRole.TECHNICAL)) setActiveTab('technical');
    else if (activeAgents.includes(AgentRole.PRICING)) setActiveTab('pricing');
    
    if (activeAgents.includes(AgentRole.RESPONSE)) setActiveTab('response');
  }, [activeAgents]);

  const runPipeline = async () => {
    if (!orchestratorRef.current) return;
    setIsRunning(true);
    setLogs([]);
    setActiveAgents([AgentRole.MAIN]);
    setActiveTab('overview');
    
    // Reset local state for fresh run
    setSkuMatches([]);
    setFinalPricing(null);
    onUpdate({ ...rfp, status: RFPStatus.PROCESSING, products: [], tests: [] });

    try {
      // Step 1: Extract (Main Agent)
      const extraction = await orchestratorRef.current.extractRFPData(rfp);
      const updatedRfp = { ...rfp, ...extraction };
      onUpdate(updatedRfp);

      if (!updatedRfp.products) throw new Error("No products extracted");
      if (!updatedRfp.tests) throw new Error("No tests extracted");

      // Step 2 & 3: Parallel Execution (Technical & Pricing)
      setActiveAgents([AgentRole.TECHNICAL, AgentRole.PRICING]);
      
      const [matches, pricing] = await Promise.all([
        orchestratorRef.current.runTechnicalMatching(updatedRfp.products, skus),
        orchestratorRef.current.runPricing(updatedRfp.products, skus, updatedRfp.tests, selectedCurrency)
      ]);

      setSkuMatches(matches);
      setFinalPricing(pricing);

      // Step 4: Response
      setActiveAgents([AgentRole.RESPONSE]);
      await orchestratorRef.current.generateResponse(updatedRfp, pricing);
      
      onUpdate({ ...updatedRfp, status: RFPStatus.COMPLETED, finalResponse: pricing });
      setActiveAgents([]);
      
    } catch (e) {
      console.error(e);
      setLogs(prev => [...prev, {
        id: 'err', timestamp: Date.now(), agent: AgentRole.MAIN, type: 'error', message: 'Pipeline Error: ' + e
      }]);
      setIsRunning(false);
      setActiveAgents([]);
    } finally {
      setIsRunning(false);
    }
  };

  const getCurrencySymbol = (code: string) => {
    return CURRENCY_OPTIONS.find(c => c.code === code)?.symbol || '$';
  };

  const generatePDF = async () => {
    if (!finalPricing) return;
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const currency = finalPricing.currency || selectedCurrency;
    const symbol = getCurrencySymbol(currency);
    
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("BidSmart AI - Commercial Proposal", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`RFP: ${rfp.title}`, 14, 30);
    doc.text(`Client: ${rfp.client}`, 14, 35);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);
    doc.text(`Currency: ${currency}`, 14, 45);

    const tableData = finalPricing.pricingTable.map(row => [
        row.itemNo,
        row.skuModel,
        `${currency} ${row.unitPrice.toLocaleString()}`,
        row.qty,
        `${currency} ${row.testCosts.toLocaleString()}`,
        `${currency} ${row.lineTotal.toLocaleString()}`
    ]);

    autoTable(doc, {
        startY: 55,
        head: [['Item', 'SKU Model', 'Unit Price', 'Qty', 'Test Costs', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Subtotal: ${currency} ${finalPricing.subtotal.toLocaleString()}`, 140, finalY);
    doc.text(`Logistics: ${currency} ${finalPricing.logistics.toLocaleString()}`, 140, finalY + 5);
    doc.text(`Taxes (10%): ${currency} ${finalPricing.taxes.toLocaleString()}`, 140, finalY + 10);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Grand Total: ${currency} ${finalPricing.grandTotal.toLocaleString()}`, 140, finalY + 20);
    
    // Notes
    const notes = finalPricing.pricingTable
        .filter(r => r.notes.includes("MTO"))
        .map(r => `Item ${r.itemNo}: ${r.notes}`);
    
    if (notes.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(200, 50, 50);
        doc.text("Important Notes:", 14, finalY + 30);
        notes.forEach((note, i) => {
            doc.text(note, 14, finalY + 35 + (i * 5));
        });
    }

    doc.save(`Proposal_${rfp.id}.pdf`);
  };

  // Helper to determine status for styling
  const getAgentStatus = (role: AgentRole) => {
    if (activeAgents.includes(role)) return 'active';
    
    if (role === AgentRole.MAIN && rfp.products.length > 0) return 'completed';
    if (role === AgentRole.TECHNICAL && skuMatches.length > 0) return 'completed';
    if (role === AgentRole.PRICING && finalPricing) return 'completed';
    if (role === AgentRole.RESPONSE && rfp.status === RFPStatus.COMPLETED) return 'completed';
    
    return 'pending';
  };

  const StepNode = ({ role, label, icon: Icon }: { role: AgentRole, label: string, icon: any }) => {
    const status = getAgentStatus(role);
    
    let containerClass = 'border-slate-200 bg-slate-50 text-slate-400';
    let iconElement = <Icon size={18} />;

    if (status === 'active') {
        containerClass = 'border-blue-600 bg-blue-50 text-blue-600 ring-2 ring-blue-100 ring-offset-2';
        iconElement = <Loader2 className="animate-spin" size={18} />;
    } else if (status === 'completed') {
        containerClass = 'border-green-600 bg-green-100 text-green-700';
        iconElement = <Check size={18} strokeWidth={3} />;
    }

    return (
        <div className="flex flex-col items-center gap-2 z-10 w-24 text-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-white ${containerClass}`}>
                {iconElement}
            </div>
            <span className={`text-[10px] font-bold transition-colors duration-300 leading-tight ${status === 'pending' ? 'text-slate-400' : 'text-slate-700'}`}>
                {label}
            </span>
        </div>
    );
  };

  const LoadingPlaceholder = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
        <Loader2 className="animate-spin mb-4 text-blue-500" size={32} />
        <p className="font-medium text-slate-600">{message}</p>
        <p className="text-sm mt-1">Multi-agent system is processing concurrently...</p>
    </div>
  );

  return (
    <div className="flex h-full flex-col w-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-20 shadow-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <span>Workstation</span>
            <ChevronRight size={14} />
            <span className="truncate">{rfp.id}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 truncate">{rfp.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            {/* Currency Selector */}
            <div className="relative">
                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                    <Coins size={16} className="text-slate-400" />
                    <select 
                        value={selectedCurrency}
                        onChange={(e) => setSelectedCurrency(e.target.value)}
                        disabled={isRunning}
                        className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer disabled:opacity-50"
                    >
                        {CURRENCY_OPTIONS.map(opt => (
                            <option key={opt.code} value={opt.code}>{opt.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {rfp.status === RFPStatus.COMPLETED && (
                <button 
                  onClick={generatePDF}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 border border-slate-300 transition-colors text-sm"
                >
                    <Download size={16} /> <span className="hidden sm:inline">Download</span>
                </button>
            )}
            <button 
                onClick={runPipeline}
                disabled={isRunning}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-white shadow-sm transition-all text-sm ${
                    isRunning ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
                {isRunning ? <RotateCcw className="animate-spin" size={18} /> : <Play size={18} />}
                {isRunning ? 'Running...' : 'Run Agents'}
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 bg-slate-50 p-4 md:p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Visual Pipeline Status (Responsive Fixed Width Container) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <div className="min-w-[600px] w-[600px] h-[200px] mx-auto relative flex items-center justify-center">
                        {/* Connecting Lines Layer (SVG coordinates match the layout below) */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} viewBox="0 0 600 200">
                            {/* Main (140, 100) -> Fork (200, 100) */}
                            <path d="M165,100 L200,100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            
                            {/* Fork Split */}
                            <path d="M200,100 C230,100 230,60 260,60" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            <path d="M200,100 C230,100 230,140 260,140" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            
                            {/* Parallel Lines */}
                            <path d="M260,60 L340,60" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            <path d="M260,140 L340,140" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            
                            {/* Merge Join */}
                            <path d="M340,60 C370,60 370,100 400,100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            <path d="M340,140 C370,140 370,100 400,100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                            
                            {/* Merge to End */}
                            <path d="M400,100 L435,100" stroke="#cbd5e1" strokeWidth="2" fill="none" />
                        </svg>

                        {/* Nodes Overlay - Positioned using Grid/Flex to match SVG coordinates */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* Left: Main Agent (Center ~ 140px from left of graph area) */}
                            <div className="absolute left-[100px]">
                                <StepNode role={AgentRole.MAIN} label="Extraction" icon={FileText} />
                            </div>

                            {/* Middle Column: Parallel Agents (Center ~ 300px) */}
                            <div className="absolute left-[280px] flex flex-col gap-12">
                                <StepNode role={AgentRole.TECHNICAL} label="Technical Match" icon={Cpu} />
                                <StepNode role={AgentRole.PRICING} label="Pricing Logic" icon={Calculator} />
                            </div>

                            {/* Right: Response (Center ~ 460px) */}
                            <div className="absolute left-[460px]">
                                <StepNode role={AgentRole.RESPONSE} label="Final Proposal" icon={CheckCircle2} />
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="absolute bottom-3 right-4 text-[10px] text-slate-400 uppercase tracking-widest font-semibold bg-white px-2">
                            Agentic Orchestration
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 md:gap-8 border-b border-slate-200 overflow-x-auto scrollbar-hide">
                    {['overview', 'technical', 'pricing', 'response'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`pb-3 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
                                activeTab === tab 
                                ? 'text-blue-600 border-b-2 border-blue-600' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            {tab} Data
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="min-h-[400px]">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {activeAgents.includes(AgentRole.MAIN) ? (
                                <LoadingPlaceholder message="Main Agent is analyzing RFP PDF..." />
                            ) : (
                                <>
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-lg font-bold mb-4">Extracted Requirements</h3>
                                        {rfp.products.length > 0 ? (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-50 text-slate-500">
                                                        <tr>
                                                            <th className="p-3 whitespace-nowrap">Item No</th>
                                                            <th className="p-3 min-w-[200px]">Description</th>
                                                            <th className="p-3 whitespace-nowrap">Qty</th>
                                                            <th className="p-3 min-w-[300px]">Key Params</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rfp.products.map(p => (
                                                            <tr key={p.itemNo} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                                                                <td className="p-3 font-medium">{p.itemNo}</td>
                                                                <td className="p-3">{p.description}</td>
                                                                <td className="p-3 whitespace-nowrap">{p.qty} {p.unit}</td>
                                                                <td className="p-3">
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {Object.entries(p.params || {}).map(([k,v]) => (
                                                                            <span key={k} className="inline-block bg-slate-100 px-2 py-1 rounded text-xs border border-slate-200">
                                                                                {k}: {v}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-slate-400 italic">No data extracted. Click "Run Agents" to start.</p>
                                        )}
                                    </div>
                                    
                                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                        <h3 className="text-lg font-bold mb-4">Applicable Tests</h3>
                                        {rfp.tests.length > 0 ? (
                                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {rfp.tests.map(t => (
                                                    <li key={t.id} className="text-sm p-3 bg-slate-50 rounded border border-slate-100">
                                                        <div className="font-bold text-slate-800">{t.testName}</div>
                                                        <div className="text-slate-600 mt-1">{t.scope}</div>
                                                        {t.remarks && <div className="text-xs text-slate-400 mt-2 italic">{t.remarks}</div>}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-slate-400 italic">No tests extracted yet.</p>}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'technical' && (
                        <div className="space-y-6">
                            {activeAgents.includes(AgentRole.TECHNICAL) ? (
                                <LoadingPlaceholder message="Technical Agent is querying vector database..." />
                            ) : skuMatches.length > 0 ? (
                                skuMatches.map(match => (
                                    <div key={match.itemNo} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                                            <h4 className="font-bold text-slate-800">Item {match.itemNo} Recommendations</h4>
                                            {match.isMTO && (
                                                <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200">
                                                    <PackageX size={16} />
                                                    <span className="text-xs font-bold">MTO (Made to Order) - Insufficient Stock</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {match.matches.map((m, idx) => (
                                                <div key={m.sku.id} className={`relative p-4 rounded-lg border ${idx === 0 ? 'border-green-500 bg-green-50' : 'border-slate-200'}`}>
                                                    <div className="absolute top-2 right-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                                            idx === 0 ? 'bg-green-600 text-white' : 
                                                            idx === 1 ? 'bg-slate-600 text-white' : 'bg-slate-400 text-white'
                                                        }`}>
                                                            Rank #{idx + 1}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col mb-2 mt-2">
                                                        <span className="font-bold text-sm truncate pr-12">{m.sku.modelName}</span>
                                                        <div className="flex gap-2">
                                                            <span className={`text-xs font-bold w-fit px-2 py-0.5 mt-1 rounded ${idx === 0 ? 'bg-green-200 text-green-800' : 'bg-slate-200'}`}>
                                                                {m.matchScore.toFixed(1)}% Match
                                                            </span>
                                                            <span className="text-xs text-slate-500 mt-1.5">Stock: {m.sku.stockQty}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-slate-600 space-y-1 mt-3 pt-3 border-t border-slate-200/50">
                                                        {Object.entries(m.details).slice(0, 5).map(([param, score]) => (
                                                            <div key={param} className="flex justify-between">
                                                                <span className="capitalize">{param}</span>
                                                                <span className={(score as number) >= 0.9 ? 'text-green-600 font-bold' : 'text-amber-600'}>
                                                                    {(score as number) >= 0.9 ? 'Exact' : 'Close'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-400 text-center py-10">Waiting for Technical Agent output...</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                            {activeAgents.includes(AgentRole.PRICING) ? (
                                <LoadingPlaceholder message="Pricing Agent is calculating logistics and taxes..." />
                            ) : finalPricing ? (
                                <div className="animate-in zoom-in-95 duration-500">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-6">
                                        <div>
                                            <p className="text-sm text-slate-500 uppercase tracking-wider font-bold">Grand Total</p>
                                            <h2 className="text-4xl font-bold text-blue-600 mt-1">
                                                {getCurrencySymbol(finalPricing.currency || selectedCurrency)}{finalPricing.grandTotal.toLocaleString()}
                                            </h2>
                                        </div>
                                        <div className="text-left md:text-right text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                            <p className="flex justify-between md:justify-end gap-8"><span>Logistics:</span> <span>{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{finalPricing.logistics.toLocaleString()}</span></p>
                                            <p className="flex justify-between md:justify-end gap-8 mt-1"><span>Taxes (10%):</span> <span>{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{finalPricing.taxes.toLocaleString()}</span></p>
                                            <div className="mt-2 pt-2 border-t border-slate-200 font-bold text-slate-800 flex justify-between md:justify-end gap-8">
                                                <span>Total:</span> <span>{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{finalPricing.grandTotal.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                                <tr>
                                                    <th className="text-left py-3 px-2">Item No</th>
                                                    <th className="text-left py-3 px-2 min-w-[150px]">SKU Model</th>
                                                    <th className="text-right py-3 px-2">Unit Price</th>
                                                    <th className="text-right py-3 px-2">Qty</th>
                                                    <th className="text-right py-3 px-2">Test Costs</th>
                                                    <th className="text-right py-3 px-2 font-bold">Total</th>
                                                    <th className="text-left py-3 pl-6 min-w-[200px]">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {finalPricing.pricingTable.map(row => (
                                                    <tr key={row.itemNo}>
                                                        <td className="py-3 px-2 font-medium text-slate-900">{row.itemNo}</td>
                                                        <td className="py-3 px-2 text-slate-600">{row.skuModel}</td>
                                                        <td className="py-3 px-2 text-right">{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{row.unitPrice.toLocaleString()}</td>
                                                        <td className="py-3 px-2 text-right">{row.qty}</td>
                                                        <td className="py-3 px-2 text-right">{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{row.testCosts.toLocaleString()}</td>
                                                        <td className="py-3 px-2 text-right font-bold text-slate-800">{getCurrencySymbol(finalPricing.currency || selectedCurrency)}{row.lineTotal.toLocaleString()}</td>
                                                        <td className="py-3 pl-6">
                                                            <span className={`text-xs px-2 py-1 rounded inline-block ${row.notes.includes('MTO') ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-green-100 text-green-800'}`}>
                                                                {row.notes}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-400 text-center py-10">Waiting for Pricing Agent output...</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'response' && (
                        <div className="flex flex-col items-center justify-center min-h-[400px] text-center bg-white rounded-lg border border-slate-200">
                            <div className="w-24 h-24 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50/50">
                                <CheckCircle2 size={48} />
                            </div>
                            <h2 className="text-3xl font-bold text-slate-800 mb-3">Bid Response Ready!</h2>
                            <p className="text-slate-500 max-w-lg mb-10 px-4">
                                The agents have successfully processed the RFP. The technical compliance matrix and commercial offer have been generated and are ready for review.
                            </p>
                            <button 
                                onClick={generatePDF}
                                className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all hover:scale-105"
                            >
                                <Download size={24} /> Download Final PDF Proposal
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Workstation;
