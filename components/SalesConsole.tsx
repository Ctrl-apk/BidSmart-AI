
import React, { useState } from 'react';
import { RFP, RFPStatus } from '../types';
import { Search, Globe, Loader2, ArrowRight, Download, Sparkles, Plus, X, Globe2, Database, Briefcase, Building, Factory } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface SalesConsoleProps {
  rfps: RFP[];
  setRfps: React.Dispatch<React.SetStateAction<RFP[]>>;
  onSelect: (id: string) => void;
}

const MARKET_PRESETS = [
    { id: 'global', label: 'Global (All Web)', icon: Globe2, urls: [] },
    { id: 'gov', label: 'Government', icon: Building, urls: ['tenders.gov.in', 'sam.gov', 'etenders.gov.in'] },
    { id: 'private', label: 'Private Sector', icon: Factory, urls: ['constructionwire.com', 'infrastructure-today.com', 'projectsmonitor.com'] },
];

const SalesConsole: React.FC<SalesConsoleProps> = ({ rfps, setRfps, onSelect }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanTerm, setScanTerm] = useState('distribution transformers');
  const [statusMessage, setStatusMessage] = useState('');
  
  // Simplified Market Configuration
  const [activeMarket, setActiveMarket] = useState('global');
  const [customUrls, setCustomUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');

  const addUrl = () => {
    if (newUrl && !customUrls.includes(newUrl)) {
      setCustomUrls([...customUrls, newUrl]);
      setNewUrl('');
      setActiveMarket('custom');
    }
  };

  const removeUrl = (url: string) => {
    setCustomUrls(customUrls.filter(u => u !== url));
  };

  const cleanJsonString = (str: string) => {
    return str.replace(/```json/g, '').replace(/```/g, '').trim();
  };

  const handleScan = async () => {
    setIsScanning(true);
    setStatusMessage('Initializing Search Agent...');
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy' });

        // DETERMINE SOURCES
        let searchContext = "";
        const selectedPreset = MARKET_PRESETS.find(p => p.id === activeMarket);
        let urlsToSearch = selectedPreset ? selectedPreset.urls : [];
        
        if (activeMarket === 'custom') {
            urlsToSearch = customUrls;
        }

        if (urlsToSearch.length > 0) {
            searchContext = `
            STRICTLY prioritize searching within these specific domains:
            ${urlsToSearch.join(', ')}
            
            If nothing is found in those specific domains, broaden the search.
            `;
        } else {
             searchContext = `Search broadly across reputable global tender portals and news sites.`;
        }

        // STEP 1: RETRIEVAL (RAG via Google Search)
        setStatusMessage(`Scanning ${activeMarket === 'global' ? 'Global Web' : activeMarket + ' Sources'}...`);
        
        const searchPrompt = `
            Act as a Sales Intelligence Agent.
            Find 3 currently active (or recent) public tenders, RFPs, or procurement opportunities related to: "${scanTerm}".
            
            ${searchContext}
            
            For each finding, provide:
            1. Title of the Tender
            2. Client/Organization Name
            3. A brief technical excerpt (2 sentences)
            4. Due Date (approximate if not exact)
            5. The specific URL where this was found.
        `;

        const searchResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: searchPrompt,
            config: {
                tools: [{googleSearch: {}}],
            }
        });
        
        const rawSearchText = searchResponse.text;
        
        if (!rawSearchText) throw new Error("No results found from search.");

        // STEP 2: GENERATION (Structured Data Extraction)
        setStatusMessage('Extracting structured data from search results...');
        
        const extractionPrompt = `
            Analyze the following text which contains search results for RFPs.
            Extract the opportunities into a strict JSON format.
            
            Text Data:
            ${rawSearchText}
            
            Rules:
            - Map "URL" to the 'url' field. If the text has a source link, use it.
            - Map "Due Date" to 'dueDate' (Format YYYY-MM-DD). If missing, use a date 30 days from now.
            - Ensure 'excerpt' looks professional.
        `;

        const jsonResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: extractionPrompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        opportunities: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    client: { type: Type.STRING },
                                    excerpt: { type: Type.STRING },
                                    dueDate: { type: Type.STRING },
                                    url: { type: Type.STRING }
                                },
                                required: ["title", "client", "excerpt", "dueDate"]
                            }
                        }
                    }
                }
            }
        });

        if (jsonResponse.text) {
            const cleanedJson = cleanJsonString(jsonResponse.text);
            const data = JSON.parse(cleanedJson);
            
            if (data.opportunities && Array.isArray(data.opportunities)) {
                const newRfps: RFP[] = data.opportunities.map((opp: any, idx: number) => ({
                    id: `rfp-${Date.now()}-${idx}`,
                    title: opp.title || 'Untitled Opportunity',
                    client: opp.client || 'Unknown Client',
                    dueDate: opp.dueDate || new Date().toISOString().split('T')[0],
                    url: opp.url || 'https://google.com/search?q=' + encodeURIComponent(opp.title),
                    excerpt: opp.excerpt || 'No details available',
                    status: RFPStatus.DISCOVERED,
                    products: [],
                    tests: []
                }));
                setRfps(prev => [...newRfps, ...prev]);
            }
        }
    } catch (e) {
        console.error("AI Scan failed", e);
        alert("Sales Agent failed to connect to tender network. Please check API Key.");
    } finally {
        setIsScanning(false);
        setStatusMessage('');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Sales Agent Console</h2>
          <p className="text-slate-500">Autonomous Market Scanning & RAG-based Discovery.</p>
        </div>
        <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium">
                <Download size={16} /> Export CSV
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Left: Simplified Market Selection */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
                <Database size={20} className="text-blue-600"/>
                <h3 className="font-bold">Target Market</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
                Select a knowledge base for the agent to focus its search.
            </p>
            
            <div className="space-y-2 mb-4">
                {MARKET_PRESETS.map(preset => {
                    const Icon = preset.icon;
                    return (
                        <button
                            key={preset.id}
                            onClick={() => setActiveMarket(preset.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-sm transition-all ${
                                activeMarket === preset.id
                                ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            <Icon size={18} />
                            {preset.label}
                        </button>
                    )
                })}
                 <button
                    onClick={() => setActiveMarket('custom')}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-sm transition-all ${
                        activeMarket === 'custom'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                >
                    <Briefcase size={18} />
                    Custom Source List
                </button>
            </div>

            {activeMarket === 'custom' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                    <div className="flex gap-2 mb-2">
                        <input 
                            type="text" 
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                            placeholder="Add domain (e.g. tenders.com)..."
                            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button onClick={addUrl} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="max-h-[100px] overflow-y-auto space-y-1">
                        {customUrls.map(url => (
                             <div key={url} className="flex items-center justify-between text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                <span className="truncate flex-1 text-slate-600">{url}</span>
                                <button onClick={() => removeUrl(url)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
                            </div>
                        ))}
                        {customUrls.length === 0 && <p className="text-xs text-slate-400 italic">No custom sources added.</p>}
                    </div>
                </div>
            )}
        </div>

        {/* Right: Scanner Control */}
        <div className="bg-indigo-50 p-6 rounded-xl shadow-sm border border-indigo-100 lg:col-span-2 flex flex-col justify-center">
            <label className="block text-sm font-bold text-indigo-900 mb-2">Product Category / Keywords</label>
            <div className="flex gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-indigo-400" size={20} />
                <input 
                type="text" 
                value={scanTerm}
                onChange={(e) => setScanTerm(e.target.value)}
                placeholder="Enter keywords (e.g., 'Switchgear', 'Solar Inverters')"
                className="w-full pl-10 pr-4 py-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-indigo-900 placeholder-indigo-300"
                />
            </div>
            <button 
                onClick={handleScan}
                disabled={isScanning}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-70 flex items-center gap-2 shadow-md hover:shadow-lg transition-all min-w-[140px] justify-center"
            >
                {isScanning ? <Loader2 className="animate-spin" /> : <Globe size={18} />}
                {isScanning ? 'Scanning...' : 'Start Scan'}
            </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-indigo-600 font-medium h-5">
                {isScanning && (
                    <>
                        <Loader2 className="animate-spin" size={12} />
                        <span>{statusMessage}</span>
                    </>
                )}
            </div>
        </div>
      </div>

      {/* Results Grid */}
      <h3 className="text-lg font-bold text-slate-800 mb-4">Discovered Opportunities</h3>
      
      {rfps.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <Sparkles className="mx-auto text-slate-300 mb-4" size={48} />
              <h4 className="text-lg font-bold text-slate-500">No active opportunities detected</h4>
              <p className="text-slate-400 max-w-md mx-auto mt-2">
                  Use the scanner above to deploy the Sales Agent. It will perform live retrieval using the selected Market source.
              </p>
          </div>
      ) : (
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
                    <a href={rfp.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-2 inline-flex items-center gap-1">
                        <Globe2 size={12} /> Source Link
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
      )}
    </div>
  );
};

export default SalesConsole;
