import React, { useState, useEffect, useRef } from 'react';
import { RFP, AgentRole, LogEntry, RFPStatus, SKUMatch, FinalResponse, SKU } from '../types';
import { Orchestrator } from '../services/orchestrator';
import { Play, RotateCcw, FileText, Cpu, Calculator, CheckCircle2, ChevronRight, Activity, Download, Loader2, AlertTriangle, PackageX, Check, Coins, ShieldCheck, Scale, TrendingUp, BarChart3, Info, Zap, Ruler, Box, ScanEye, ArrowRightLeft, Fingerprint, Magnet, GitMerge, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

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

const WinGauge = ({ score }: { score: number }) => {
    const safeScore = typeof score === 'number' ? score : 0;
    return (
        <div className="relative w-32 h-32 flex items-center justify-center">
             <svg className="w-full h-full transform -rotate-90">
                 <circle cx="64" cy="64" r="28" stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                 <circle cx="64" cy="64" r="28" stroke={safeScore > 75 ? "#22c55e" : safeScore > 50 ? "#eab308" : "#ef4444"} strokeWidth="6" fill="transparent" strokeDasharray={`${safeScore * 1.75} 200`} />
             </svg>
             <div className="absolute flex flex-col items-center">
                 <span className="text-2xl font-bold text-slate-700">{Math.round(safeScore)}%</span>
                 <span className="text-2xl font-bold text-slate-700">{Math.round(safeScore)}%</span>
                 <span className="text-[10px] text-slate-400 uppercase">Win Prob</span>
             </div>
        </div>
    )
}

const Workstation: React.FC<WorkstationProps> = ({ rfp, onUpdate, skus }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgents, setActiveAgents] = useState<AgentRole[]>([]);
  
  const [skuMatches, setSkuMatches] = useState<SKUMatch[]>(rfp.skuMatches || []);
  const [finalResponse, setFinalResponse] = useState<FinalResponse | null>(null);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'commercials' | 'strategy' | 'response'>('overview');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  
  const orchestratorRef = useRef<Orchestrator | null>(null);

  useEffect(() => {
    orchestratorRef.current = new Orchestrator((log) => {
      setLogs(prev => [...prev, log]);
    });
  }, []);

  useEffect(() => {
    if (rfp.finalResponse) {
        setFinalResponse(rfp.finalResponse);
        if (rfp.finalResponse.currency) setSelectedCurrency(rfp.finalResponse.currency);
    }
    if (rfp.skuMatches) setSkuMatches(rfp.skuMatches);
  }, [rfp]);

  useEffect(() => {
    if (activeAgents.includes(AgentRole.MAIN)) setActiveTab('overview');
    else if (activeAgents.some(r => [AgentRole.TECHNICAL, AgentRole.PRICING, AgentRole.RISK, AgentRole.COMPLIANCE].includes(r))) setActiveTab('technical');
    else if (activeAgents.includes(AgentRole.STRATEGY)) setActiveTab('strategy');
    else if (activeAgents.includes(AgentRole.RESPONSE)) setActiveTab('response');
  }, [activeAgents]);

  const runPipeline = async () => {
    if (!orchestratorRef.current) return;
    setIsRunning(true);
    setLogs([]);
    setActiveAgents([AgentRole.MAIN]);
    setActiveTab('overview');
    
    // Reset
    setSkuMatches([]);
    setFinalResponse(null);
    onUpdate({ ...rfp, status: RFPStatus.PROCESSING, products: [], tests: [], finalResponse: undefined, skuMatches: undefined });

    try {
      // 1. Extraction
      const extraction = await orchestratorRef.current.extractRFPData(rfp);
      const updatedRfp = { ...rfp, ...extraction };
      onUpdate(updatedRfp);

      if (!updatedRfp.products) throw new Error("No products extracted");

      // 2. Parallel Orchestration (Tech, Price, Risk, Compliance)
      setActiveAgents([AgentRole.TECHNICAL, AgentRole.PRICING, AgentRole.RISK, AgentRole.COMPLIANCE]);
      
      const [matches, pricingPartial, risk, compliance] = await Promise.all([
        orchestratorRef.current.runTechnicalMatching(updatedRfp.products, skus),
        orchestratorRef.current.runPricing(updatedRfp.products, skus, updatedRfp.tests || [], selectedCurrency),
        orchestratorRef.current.runRiskAssessment(updatedRfp, skuMatches), 
        orchestratorRef.current.runComplianceCheck(updatedRfp)
      ]);

      // Let's perform a quick Strategy Synthesis
      setActiveAgents([AgentRole.STRATEGY]);
      const strategy = await orchestratorRef.current.runStrategyAnalysis(matches, pricingPartial, risk, compliance);

      // Construct Final
      const completeResponse: FinalResponse = {
          ...pricingPartial as any,
          riskAnalysis: risk,
          complianceCheck: compliance,
          competitorAnalysis: strategy.competitorAnalysis,
          winProbability: strategy.winProbability,
          executiveSummary: strategy.summary,
          generatedAt: new Date().toISOString()
      };

      setSkuMatches(matches);
      setFinalResponse(completeResponse);

      // 4. Response
      setActiveAgents([AgentRole.RESPONSE]);
      await orchestratorRef.current.generateResponse(updatedRfp, completeResponse);
      
      onUpdate({ 
          ...updatedRfp, 
          status: RFPStatus.COMPLETED, 
          finalResponse: completeResponse,
          skuMatches: matches 
      });
      
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
    if (!finalResponse) return;
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const currency = finalResponse.currency || selectedCurrency;
    
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("Strategic Commercial Proposal", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`RFP Ref: ${rfp.title}`, 14, 32);
    doc.text(`Generated by BidSmart Agentic System`, 14, 37);

    // Executive Summary
    doc.setFillColor(240, 248, 255);
    doc.rect(14, 45, 180, 25, 'F');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Executive Summary:", 18, 52);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(finalResponse.executiveSummary, 170), 18, 58);

    const tableData = finalResponse.pricingTable.map(row => [
        row.itemNo,
        row.skuModel,
        `${currency} ${row.unitPrice.toLocaleString()}`,
        row.qty,
        `${currency} ${row.lineTotal.toLocaleString()}`
    ]);

    autoTable(doc, {
        startY: 75,
        head: [['Item', 'SKU', 'Unit Price', 'Qty', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Grand Total: ${currency} ${finalResponse.grandTotal.toLocaleString()}`, 140, finalY);
    
    doc.save(`Proposal_${rfp.id}.pdf`);
  };

  const StepNode = ({ role, label, icon: Icon }: { role: AgentRole, label: string, icon: any }) => {
    const isActive = activeAgents.includes(role);
    const isCompleted = !isActive && finalResponse && role !== AgentRole.RESPONSE ? true : false;
    
    let containerClass = 'border-slate-200 bg-slate-50 text-slate-400';
    if (isActive) containerClass = 'border-blue-600 bg-blue-50 text-blue-600 ring-4 ring-blue-100';
    else if (isCompleted || (role === AgentRole.RESPONSE && rfp.status === RFPStatus.COMPLETED)) containerClass = 'border-green-600 bg-green-100 text-green-700';

    return (
        <div className="flex flex-col items-center gap-2 z-10 w-24 text-center">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all duration-300 bg-white ${containerClass}`}>
                {isActive ? <Loader2 className="animate-spin" size={20} /> : <Icon size={20} />}
            </div>
            <span className="text-[10px] font-bold leading-tight">{label}</span>
        </div>
    );
  };

  return (
    <div className="flex h-full flex-col w-full bg-slate-50/50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            {rfp.title} 
            {finalResponse && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full border border-green-200">Completed</span>}
          </h1>
        </div>
        <div className="flex items-center gap-3">
             <select 
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-2 py-1 outline-none"
            >
                {CURRENCY_OPTIONS.map(opt => <option key={opt.code} value={opt.code}>{opt.code}</option>)}
            </select>
            <button 
                onClick={runPipeline}
                disabled={isRunning}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-white transition-all text-sm ${
                    isRunning ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200'
                }`}
            >
                {isRunning ? <RotateCcw className="animate-spin" size={16} /> : <Play size={16} />}
                {isRunning ? 'Orchestrating Agents...' : 'Run Pipeline'}
            </button>
            {finalResponse && (
                <button onClick={generatePDF} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
                    <Download size={20} />
                </button>
            )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Visual Pipeline 2.0 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex justify-center overflow-x-auto">
                 <div className="relative min-w-[700px] h-[160px]">
                      {/* Lines */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-200" style={{ strokeWidth: 2 }}>
                          {/* Main Split */}
                          <path d="M100,80 L180,80" />
                          <path d="M180,80 C210,80 210,30 240,30" />
                          <path d="M180,80 C210,80 210,60 240,60" />
                          <path d="M180,80 C210,80 210,100 240,100" />
                          <path d="M180,80 C210,80 210,130 240,130" />
                          
                          {/* Extensions */}
                          <path d="M240,30 L320,30" />
                          <path d="M240,60 L320,60" />
                          <path d="M240,100 L320,100" />
                          <path d="M240,130 L320,130" />

                          {/* Converge to Strategy */}
                          <path d="M320,30 C350,30 350,80 380,80" />
                          <path d="M320,60 C350,60 350,80 380,80" />
                          <path d="M320,100 C350,100 350,80 380,80" />
                          <path d="M320,130 C350,130 350,80 380,80" />

                          {/* To Response */}
                          <path d="M380,80 L480,80" />
                      </svg>

                      {/* Nodes */}
                      <div className="absolute top-[80px] left-[70px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.MAIN} label="Extraction" icon={FileText} /></div>
                      
                      <div className="absolute top-[30px] left-[280px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.TECHNICAL} label="Technical" icon={Cpu} /></div>
                      <div className="absolute top-[63px] left-[280px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.PRICING} label="Pricing" icon={Calculator} /></div>
                      <div className="absolute top-[97px] left-[280px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.RISK} label="Risk" icon={ShieldCheck} /></div>
                      <div className="absolute top-[130px] left-[280px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.COMPLIANCE} label="Compliance" icon={Scale} /></div>
                      
                      <div className="absolute top-[80px] left-[420px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.STRATEGY} label="Strategy" icon={TrendingUp} /></div>
                      <div className="absolute top-[80px] left-[550px] -translate-y-1/2 -translate-x-1/2"><StepNode role={AgentRole.RESPONSE} label="Response" icon={CheckCircle2} /></div>
                 </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-slate-200">
                {['overview', 'technical', 'commercials', 'strategy', 'response'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`pb-3 text-sm font-medium capitalize transition-colors ${
                            activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        {tab === 'commercials' ? 'BOM & Cost' : tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div>
                {activeTab === 'overview' && (
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="font-bold text-slate-800 mb-4">RFP Extraction Summary</h3>
                        {rfp.products.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 rounded border border-slate-100">
                                    <span className="text-xs text-slate-500 uppercase font-bold">Requirements</span>
                                    <p className="text-2xl font-bold text-slate-800 mt-1">{rfp.products.length} Items</p>
                                    <p className="text-sm text-slate-600 mt-2">Extracted from {rfp.products.length > 0 ? 'PDF Text' : 'Input'}</p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded border border-slate-100">
                                    <span className="text-xs text-slate-500 uppercase font-bold">Tests Required</span>
                                    <p className="text-2xl font-bold text-slate-800 mt-1">{rfp.tests.length} Standard Tests</p>
                                    <div className="flex gap-2 mt-2">
                                        {rfp.tests.slice(0,3).map(t => <span key={t.id} className="text-xs bg-white px-2 py-1 rounded border shadow-sm">{t.testName}</span>)}
                                    </div>
                                </div>
                            </div>
                        ) : <p className="text-slate-400 italic">No extraction data available. Run the pipeline.</p>}
                    </div>
                )}

                {activeTab === 'technical' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-2">
                        {skuMatches.map(m => {
                            const match = m.matches[0];
                            const score = match?.matchScore || 0;
                            const isGood = score > 80;
                            const isMed = score > 50 && score <= 80;

                            return (
                                <div key={m.itemNo} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    {/* Header */}
                                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                                                {m.itemNo.substring(0,2)}
                                            </div>
                                            <span className="font-semibold text-slate-700">{m.itemNo} Analysis</span>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${isGood ? 'bg-green-100 text-green-700 border-green-200' : isMed ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                            {score.toFixed(0)}% Match Confidence
                                        </div>
                                    </div>

                                    {/* The Bridge Visualization */}
                                    <div className="p-6 grid grid-cols-1 md:grid-cols-7 gap-4 items-center relative">
                                        
                                        {/* Left: Requirement */}
                                        <div className="md:col-span-3 p-4 bg-slate-50 rounded-lg border border-slate-100 relative">
                                            <div className="absolute -top-3 left-4 bg-slate-200 text-slate-600 px-2 py-0.5 text-[10px] font-bold uppercase rounded">
                                                RFP Requirement
                                            </div>
                                            <div className="flex items-start gap-3 mt-2">
                                                <ScanEye className="text-slate-400 mt-1" size={20} />
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">Extracted Specs</p>
                                                    <div className="space-y-1 mt-2">
                                                        {Object.entries(m.rfpParams).map(([k, v]) => (
                                                            <div key={k} className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-200 pb-1 last:border-0 min-w-[140px]">
                                                                <span className="font-medium mr-4">{k}:</span>
                                                                <span className="font-mono text-slate-800">{v}</span>
                                                            </div>
                                                        ))}
                                                        {Object.keys(m.rfpParams).length === 0 && <p className="text-xs text-slate-400 italic">No detailed params found.</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Middle: The AI Connector */}
                                        <div className="md:col-span-1 flex flex-col items-center justify-center text-slate-300">
                                            <div className="h-0.5 w-full bg-slate-200 absolute top-1/2 left-0 right-0 z-0 hidden md:block"></div>
                                            <div className="w-2 h-2 rounded-full bg-slate-300 relative z-10"></div>
                                        </div>

                                        {/* Right: SKU Match */}
                                        <div className="md:col-span-3 p-4 bg-blue-50/50 rounded-lg border border-blue-100 relative">
                                            <div className="absolute -top-3 right-4 bg-blue-200 text-blue-700 px-2 py-0.5 text-[10px] font-bold uppercase rounded">
                                                Inventory Match
                                            </div>
                                            <div className="flex items-start gap-3 mt-2">
                                                <Fingerprint className="text-blue-500 mt-1" size={20} />
                                                <div className="w-full">
                                                    <p className="font-bold text-slate-800 text-sm">{match?.sku.modelName || 'No Match Found'}</p>
                                                    
                                                    {match ? (
                                                        <div className="space-y-1 mt-2">
                                                            {/* Show specs on right to match left format for comparison */}
                                                            {Object.entries(match.sku.specs).slice(0, 4).map(([k, v]) => (
                                                                <div key={k} className="flex items-center justify-between text-xs text-slate-600 border-b border-blue-200 pb-1 last:border-0">
                                                                    <span className="font-medium">{k}:</span>
                                                                    <span className="font-mono text-slate-900">{v}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="p-2 bg-red-50 text-red-600 text-xs rounded">
                                                            No suitable product found in database.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                    
                                    {/* Footer Details */}
                                    <div className="bg-slate-50 px-6 py-2 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
                                        <div className="flex gap-4">
                                            {/* Cleaned up as requested */}
                                        </div>
                                        {m.isMTO && <span className="text-amber-600 font-bold flex items-center gap-1"><Box size={12} /> Low Stock (MTO)</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {skuMatches.length === 0 && (
                             <div className="text-center py-12 text-slate-400">
                                 <Loader2 className="animate-spin mx-auto mb-2" />
                                 <p>Waiting for Technical Agent to populate matches...</p>
                             </div>
                        )}
                    </div>
                )}

                {activeTab === 'strategy' && finalResponse && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in-95">
                        
                        {/* Win Probability */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                            <h3 className="font-bold text-slate-800 mb-2 w-full text-left">Win Probability</h3>
                            <WinGauge score={finalResponse.winProbability} />
                            <p className="text-sm text-center text-slate-600 mt-2 px-4">{finalResponse.executiveSummary}</p>
                        </div>

                        {/* Competitor Benchmarking */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
                             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                 <BarChart3 size={18} className="text-blue-600" /> Market Benchmarking
                             </h3>
                             <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart 
                                        data={[
                                            { name: 'Our Price', price: finalResponse.competitorAnalysis.ourPrice, color: '#3b82f6' },
                                            { name: 'Market Avg', price: finalResponse.competitorAnalysis.marketAvg, color: '#94a3b8' },
                                            { name: 'Market High', price: finalResponse.competitorAnalysis.marketHigh, color: '#ef4444' }
                                        ]}
                                        layout="vertical"
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                        <Tooltip formatter={(val: number) => `${getCurrencySymbol(selectedCurrency)}${val.toLocaleString()}`} />
                                        <Bar dataKey="price" radius={[0, 4, 4, 0]} barSize={30}>
                                            {/* Cells handled by payload color */}
                                            <Cell fill="#3b82f6" />
                                            <Cell fill="#94a3b8" />
                                            <Cell fill="#fca5a5" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                             </div>
                        </div>

                        {/* Risk Matrix */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-3">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <ShieldCheck size={18} className="text-indigo-600" /> Risk & Compliance Audit
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-sm text-slate-700">Risk Assessment</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${finalResponse.riskAnalysis.level === 'Low' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {finalResponse.riskAnalysis.level} Risk
                                        </span>
                                    </div>
                                    <ul className="text-sm text-slate-600 space-y-1 list-disc pl-4">
                                        {finalResponse.riskAnalysis.factors.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-sm text-slate-700">Compliance Check</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${finalResponse.complianceCheck.status === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {finalResponse.complianceCheck.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600">{finalResponse.complianceCheck.details}</p>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {activeTab === 'commercials' && finalResponse && (
                     <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm animate-in fade-in">
                         <div className="flex justify-between items-end mb-6">
                            <div>
                                <h3 className="font-bold text-slate-800">Detailed Bill of Materials</h3>
                                <p className="text-sm text-slate-500">Breakdown of Costs, Testing & Logistics</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Grand Total Estimate</p>
                                <p className="text-3xl font-bold text-blue-600">{getCurrencySymbol(selectedCurrency)}{finalResponse.grandTotal.toLocaleString()}</p>
                            </div>
                         </div>
                         
                         <table className="w-full text-sm">
                             <thead className="bg-slate-50 text-slate-500 text-left">
                                 <tr>
                                     <th className="p-3">Item</th>
                                     <th className="p-3">SKU</th>
                                     <th className="p-3 text-right">Unit Price</th>
                                     <th className="p-3 text-right">Qty</th>
                                     <th className="p-3 text-right">Total</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {finalResponse.pricingTable.map(row => (
                                     <tr key={row.itemNo}>
                                         <td className="p-3 font-medium">{row.itemNo}</td>
                                         <td className="p-3">{row.skuModel}</td>
                                         <td className="p-3 text-right">{getCurrencySymbol(selectedCurrency)}{row.unitPrice.toLocaleString()}</td>
                                         <td className="p-3 text-right">{row.qty}</td>
                                         <td className="p-3 text-right font-bold">{getCurrencySymbol(selectedCurrency)}{row.lineTotal.toLocaleString()}</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                )}
            </div>

        </div>
      </div>
    </div>
  );
};

export default Workstation;