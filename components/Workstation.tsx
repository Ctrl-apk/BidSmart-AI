
import React, { useState, useEffect, useRef } from 'react';
import { RFP, AgentRole, LogEntry, RFPStatus, SKUMatch, FinalResponse, SKU } from '../types';
import { Orchestrator } from '../services/orchestrator';
import { Play, RotateCcw, FileText, Cpu, Calculator, CheckCircle2, ChevronRight, Activity, Download, Loader2, AlertTriangle, PackageX } from 'lucide-react';

interface WorkstationProps {
  rfp: RFP;
  onUpdate: (rfp: RFP) => void;
  skus: SKU[];
}

// Declare jsPDF and autoTable for TS since they are loaded via importmap
declare const jspdf: any;
declare const doc: any;

const Workstation: React.FC<WorkstationProps> = ({ rfp, onUpdate, skus }) => {
  // We keep the logs state to satisfy the Orchestrator callback, even if we don't display the panel
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<AgentRole | null>(null);
  const [skuMatches, setSkuMatches] = useState<SKUMatch[]>([]);
  const [finalPricing, setFinalPricing] = useState<FinalResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'pricing' | 'response'>('overview');
  
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
        if (rfp.status === RFPStatus.COMPLETED) {
            setActiveTab('response');
        }
    }
  }, [rfp]);

  // Automatic Tab Switching based on Agent Step
  useEffect(() => {
    if (activeStep === AgentRole.MAIN) setActiveTab('overview');
    if (activeStep === AgentRole.TECHNICAL) setActiveTab('technical');
    if (activeStep === AgentRole.PRICING) setActiveTab('pricing');
    if (activeStep === AgentRole.RESPONSE) setActiveTab('response');
  }, [activeStep]);

  const runPipeline = async () => {
    if (!orchestratorRef.current) return;
    setIsRunning(true);
    setLogs([]);
    setActiveStep(AgentRole.MAIN);
    setActiveTab('overview');
    
    // Reset local state for fresh run
    setSkuMatches([]);
    setFinalPricing(null);
    onUpdate({ ...rfp, status: RFPStatus.PROCESSING, products: [], tests: [] });

    try {
      // Step 1: Extract
      const extraction = await orchestratorRef.current.extractRFPData(rfp);
      const updatedRfp = { ...rfp, ...extraction };
      onUpdate(updatedRfp);

      // Step 2: Technical
      setActiveStep(AgentRole.TECHNICAL);
      if (!updatedRfp.products) throw new Error("No products extracted");
      
      // Pass the current inventory (skus) to the matching logic
      const matches = await orchestratorRef.current.runTechnicalMatching(updatedRfp.products, skus);
      setSkuMatches(matches);

      // Step 3: Pricing
      setActiveStep(AgentRole.PRICING);
      if (!updatedRfp.tests) throw new Error("No tests extracted");
      const pricing = await orchestratorRef.current.runPricing(matches, updatedRfp.tests);
      setFinalPricing(pricing);

      // Step 4: Response
      setActiveStep(AgentRole.RESPONSE);
      await orchestratorRef.current.generateResponse(updatedRfp, pricing);
      
      onUpdate({ ...updatedRfp, status: RFPStatus.COMPLETED, finalResponse: pricing });
      setActiveStep(null);
      
    } catch (e) {
      console.error(e);
      setLogs(prev => [...prev, {
        id: 'err', timestamp: Date.now(), agent: AgentRole.MAIN, type: 'error', message: 'Pipeline Error: ' + e
      }]);
      setIsRunning(false);
      setActiveStep(null);
    } finally {
      setIsRunning(false);
    }
  };

  const generatePDF = async () => {
    if (!finalPricing) return;
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("BidSmart AI - Commercial Proposal", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`RFP: ${rfp.title}`, 14, 30);
    doc.text(`Client: ${rfp.client}`, 14, 35);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);

    const tableData = finalPricing.pricingTable.map(row => [
        row.itemNo,
        row.skuModel,
        `$${row.unitPrice.toLocaleString()}`,
        row.qty,
        `$${row.testCosts.toLocaleString()}`,
        `$${row.lineTotal.toLocaleString()}`
    ]);

    autoTable(doc, {
        startY: 50,
        head: [['Item', 'SKU Model', 'Unit Price', 'Qty', 'Test Costs', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Subtotal: $${finalPricing.subtotal.toLocaleString()}`, 140, finalY);
    doc.text(`Logistics: $${finalPricing.logistics.toLocaleString()}`, 140, finalY + 5);
    doc.text(`Taxes (10%): $${finalPricing.taxes.toLocaleString()}`, 140, finalY + 10);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Grand Total: $${finalPricing.grandTotal.toLocaleString()}`, 140, finalY + 20);
    
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

  const steps = [
    { role: AgentRole.MAIN, label: 'Main Agent', icon: FileText },
    { role: AgentRole.TECHNICAL, label: 'Technical Agent', icon: Cpu },
    { role: AgentRole.PRICING, label: 'Pricing Agent', icon: Calculator },
    { role: AgentRole.RESPONSE, label: 'Response', icon: CheckCircle2 },
  ];

  // Helper for empty states
  const LoadingPlaceholder = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
        <Loader2 className="animate-spin mb-4 text-blue-500" size={32} />
        <p className="font-medium text-slate-600">{message}</p>
        <p className="text-sm mt-1">Please wait while the agent processes the data...</p>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <span>Workstation</span>
            <ChevronRight size={14} />
            <span>{rfp.id}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">{rfp.title}</h1>
        </div>
        <div className="flex gap-3">
            {rfp.status === RFPStatus.COMPLETED && (
                <button 
                  onClick={generatePDF}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 border border-slate-300"
                >
                    <Download size={16} /> Download Response
                </button>
            )}
            <button 
                onClick={runPipeline}
                disabled={isRunning}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-white shadow-sm transition-all ${
                    isRunning ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
                {isRunning ? <RotateCcw className="animate-spin" size={18} /> : <Play size={18} />}
                {isRunning ? 'Running Agents...' : 'Run Agents'}
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Content Tabs */}
        <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
            
            {/* Pipeline Status Bar */}
            <div className="mb-8 flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                {steps.map((step, idx) => {
                    const isActive = activeStep === step.role;
                    const Icon = step.icon;
                    return (
                        <div key={idx} className={`flex items-center gap-3 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${isActive ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                                {isActive ? <Loader2 className="animate-spin" size={18}/> : <Icon size={18} />}
                            </div>
                            <span className="font-medium text-sm">{step.label}</span>
                            {idx < steps.length - 1 && <div className="w-12 h-px bg-slate-200 mx-2" />}
                        </div>
                    );
                })}
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-slate-200 mb-6">
                {['overview', 'technical', 'pricing', 'response'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`pb-3 text-sm font-medium capitalize transition-colors ${
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
                        {/* Show loading state if active step is MAIN */}
                        {activeStep === AgentRole.MAIN ? (
                             <LoadingPlaceholder message="Main Agent is analyzing RFP PDF..." />
                        ) : (
                            <>
                                <div className="bg-white p-6 rounded-lg border border-slate-200">
                                    <h3 className="text-lg font-bold mb-4">Extracted Requirements</h3>
                                    {rfp.products.length > 0 ? (
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500">
                                                <tr>
                                                    <th className="p-3">Item No</th>
                                                    <th className="p-3">Description</th>
                                                    <th className="p-3">Qty</th>
                                                    <th className="p-3">Key Params</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rfp.products.map(p => (
                                                    <tr key={p.itemNo} className="border-t border-slate-100 animate-in fade-in duration-500">
                                                        <td className="p-3 font-medium">{p.itemNo}</td>
                                                        <td className="p-3">{p.description}</td>
                                                        <td className="p-3">{p.qty} {p.unit}</td>
                                                        <td className="p-3">
                                                            {Object.entries(p.params).map(([k,v]) => (
                                                                <span key={k} className="inline-block bg-slate-100 px-2 py-1 rounded text-xs mr-2 mb-1">
                                                                    {k}: {v}
                                                                </span>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-slate-400 italic">No data extracted. Click "Run Agents" to start.</p>
                                    )}
                                </div>
                                
                                <div className="bg-white p-6 rounded-lg border border-slate-200">
                                     <h3 className="text-lg font-bold mb-4">Applicable Tests</h3>
                                     {rfp.tests.length > 0 ? (
                                         <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
                                             {rfp.tests.map(t => (
                                                 <li key={t.id}><span className="font-semibold">{t.testName}</span> - {t.scope} <span className="text-slate-400">({t.remarks})</span></li>
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
                        {activeStep === AgentRole.TECHNICAL ? (
                             <LoadingPlaceholder message="Technical Agent is querying vector database..." />
                        ) : skuMatches.length > 0 ? (
                             skuMatches.map(match => (
                                <div key={match.itemNo} className="bg-white p-6 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex justify-between items-start mb-4">
                                        <h4 className="font-bold text-slate-800">Item {match.itemNo} SKU Recommendations</h4>
                                        {match.isMTO && (
                                            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200">
                                                <PackageX size={16} />
                                                <span className="text-xs font-bold">MTO (Made to Order) - Insufficient Stock</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-4">
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
                                                    <span className="font-bold text-sm">{m.sku.modelName}</span>
                                                    <div className="flex gap-2">
                                                        <span className={`text-xs font-bold w-fit px-2 py-0.5 mt-1 rounded ${idx === 0 ? 'bg-green-200 text-green-800' : 'bg-slate-200'}`}>
                                                            {m.matchScore.toFixed(1)}% Match
                                                        </span>
                                                        <span className="text-xs text-slate-500 mt-1.5">Stock: {m.sku.stockQty}</span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-600 space-y-1 mt-3">
                                                    {Object.entries(m.details).map(([param, score]) => (
                                                        <div key={param} className="flex justify-between">
                                                            <span>{param}</span>
                                                            <span className={(score as number) >= 0.9 ? 'text-green-600' : 'text-amber-600'}>
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
                             <p className="text-slate-400">Waiting for Technical Agent...</p>
                        )}
                    </div>
                )}

                {activeTab === 'pricing' && (
                    <div className="bg-white p-6 rounded-lg border border-slate-200">
                         {activeStep === AgentRole.PRICING ? (
                             <LoadingPlaceholder message="Pricing Agent is calculating logistics and taxes..." />
                        ) : finalPricing ? (
                            <div className="animate-in zoom-in-95 duration-500">
                                <div className="flex justify-between items-end mb-6">
                                    <div>
                                        <p className="text-sm text-slate-500">Grand Total</p>
                                        <h2 className="text-3xl font-bold text-blue-600">${finalPricing.grandTotal.toLocaleString()}</h2>
                                    </div>
                                    <div className="text-right text-sm text-slate-600">
                                        <p>Logistics: ${finalPricing.logistics.toLocaleString()}</p>
                                        <p>Taxes (10%): ${finalPricing.taxes.toLocaleString()}</p>
                                    </div>
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left py-3">Item No</th>
                                            <th className="text-left py-3">SKU Model</th>
                                            <th className="text-right py-3">Unit Price</th>
                                            <th className="text-right py-3">Qty</th>
                                            <th className="text-right py-3">Test Costs</th>
                                            <th className="text-right py-3">Total</th>
                                            <th className="text-left py-3 pl-4">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {finalPricing.pricingTable.map(row => (
                                            <tr key={row.itemNo}>
                                                <td className="py-3 font-medium text-slate-900">{row.itemNo}</td>
                                                <td className="py-3 text-slate-600">{row.skuModel}</td>
                                                <td className="py-3 text-right">${row.unitPrice.toLocaleString()}</td>
                                                <td className="py-3 text-right">{row.qty}</td>
                                                <td className="py-3 text-right">${row.testCosts.toLocaleString()}</td>
                                                <td className="py-3 text-right font-bold text-slate-800">${row.lineTotal.toLocaleString()}</td>
                                                <td className="py-3 pl-4">
                                                    <span className={`text-xs px-2 py-1 rounded ${row.notes.includes('MTO') ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-green-100 text-green-800'}`}>
                                                        {row.notes}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                             <p className="text-slate-400">Waiting for Pricing Agent...</p>
                        )}
                    </div>
                )}

                {activeTab === 'response' && (
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Bid Response Ready!</h2>
                        <p className="text-slate-500 max-w-md mb-8">
                            The agents have successfully processed the RFP. The technical compliance matrix and commercial offer are ready for review.
                        </p>
                        <button 
                            onClick={generatePDF}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:scale-105"
                        >
                            <Download size={20} /> Download Final PDF Proposal
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Workstation;
