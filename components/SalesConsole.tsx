
import React, { useState } from 'react';
import { RFP, RFPStatus, SKU } from '../types';
import { Search, Globe, Loader2, ArrowRight, Download, Sparkles, Plus, X, Globe2, Database, Briefcase, Building, Factory, BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

interface SalesConsoleProps {
  rfps: RFP[];
  setRfps: React.Dispatch<React.SetStateAction<RFP[]>>;
  onSelect: (id: string) => void;
  skus: SKU[];
}

const MARKET_PRESETS = [
    { id: 'global', label: 'Global (All Web)', icon: Globe2, urls: [] },
    { id: 'gov', label: 'Government', icon: Building, urls: ['tenders.gov.in', 'sam.gov', 'etenders.gov.in'] },
    { id: 'private', label: 'Private Sector', icon: Factory, urls: ['constructionwire.com', 'infrastructure-today.com', 'projectsmonitor.com'] },
];

const SalesConsole: React.FC<SalesConsoleProps> = ({ rfps, setRfps, onSelect, skus }) => {
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scanTerm, setScanTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);
  
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

  const isUrl = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch {
        return str.includes('www.') || (str.includes('.') && !str.includes(' '));
    }
  };

  // Helper: Robust Production Retry Logic
  const retryOperation = async <T,>(operation: () => Promise<T>, retries = 3, delay = 4000): Promise<T> => {
    try {
      return await operation();
    } catch (error: any) {
      if (retries <= 0) throw error;
      
      // Analyze error for Quota/Rate Limits
      const errString = (error.message || JSON.stringify(error)).toLowerCase();
      const isQuota = errString.includes('429') || errString.includes('quota') || errString.includes('resource_exhausted');
      const isTransient = errString.includes('503') || errString.includes('overloaded') || errString.includes('fetch failed');

      if (isQuota || isTransient) {
          console.warn(`API Limit Hit (${errString}). Retrying in ${delay/1000}s... (${retries} attempts left)`);
          
          // Update UI to inform user of delay
          setStatusMessage(`High traffic detected. Retrying in ${delay/1000}s...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          // Exponential backoff: 4s -> 8s -> 16s
          return retryOperation(operation, retries - 1, delay * 2); 
      }
      
      throw error;
    }
  };

  const getInventoryContext = () => {
    if (skus.length === 0) return "No specific inventory loaded. Look for general industrial opportunities.";
    
    // Create a comprehensive summary of the inventory to ensure equal weightage
    const uniqueManufacturers = Array.from(new Set(skus.map(s => s.manufacturer))).join(', ');
    
    // Include all models (within reason) to ensure nothing is prioritized over others
    const allModels = skus.map(s => s.modelName).join(', ');
    
    // Aggregate all unique specification keys across all SKUs
    const allSpecKeys = Array.from(new Set(skus.flatMap(s => Object.keys(s.specs)))).join(', ');
    
    return `
      We are a supplier of products from: ${uniqueManufacturers}.
      Our Inventory Catalog includes: ${allModels}.
      Technical parameters we deal with: ${allSpecKeys}.
      
      STRICT INSTRUCTION: 
      1. You MUST give EQUAL WEIGHTAGE to every single item in the Inventory Catalog list above.
      2. Do NOT prioritize specific manufacturers or product types over others unless explicitly requested in the user query.
      3. When assessing relevance, check against the ENTIRE catalog with equal probability.
      
      Use this inventory list to assess 'matchLikelihood' for each finding.
    `;
  };

  const handleScan = async () => {
    if (!scanTerm) return;
    setIsScanning(true);
    setIsError(false);
    setStatusMessage('Initializing Sales Agent...');
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy' });
        let prompt = "";
        const isUrlInput = isUrl(scanTerm);
        const inventoryContext = getInventoryContext();

        if (isUrlInput) {
            // URL MODE
            setStatusMessage('Analyzing specific URL for inventory eligibility...');
            prompt = `
                I have a direct link to a tender/RFP listing: "${scanTerm}".
                
                ${inventoryContext}
                
                Task:
                1. Analyze the content at this URL.
                2. Identify specific tender opportunities listed there.
                3. For each opportunity, extract:
                   - Title
                   - Client
                   - Excerpt
                   - Due Date
                   - THE SPECIFIC LINK to that tender's detail page (if available in the content).
                
                If the page is a single tender, extract its details and its direct URL.
            `;
        } else {
            // SEARCH MODE
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

            setStatusMessage(`Scanning ${activeMarket === 'global' ? 'Global Web' : activeMarket + ' Sources'}...`);
            
            prompt = `
                Act as a Sales Intelligence Agent.
                
                ${inventoryContext}
                
                Task:
                Find 3 currently active (or recent) public tenders, RFPs, or procurement opportunities related to: "${scanTerm}".
                
                ${searchContext}
                
                STRICT REQUIREMENT: Ensure findings are distributed across the different types of products in our inventory if possible. Treat all inventory items with equal importance.
                
                For each finding, provide:
                1. Title of the Tender
                2. Client/Organization Name
                3. A brief technical excerpt (2 sentences).
                4. Due Date (approximate if not exact)
                5. The SPECIFIC DIRECT URL to the tender document or detail page. Do NOT return a general portal URL if a specific one is found.
            `;
        }

        // WRAPPED IN RETRY LOGIC
        const searchResponse = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            }
        }));
        
        const rawSearchText = searchResponse.text;
        
        if (!rawSearchText) throw new Error("No results found.");

        // STEP 2: GENERATION (Structured Data Extraction)
        setStatusMessage('Evaluating eligibility against stock...');
        
        await processAndAddRfps(ai, rawSearchText, isUrlInput ? scanTerm : undefined, inventoryContext);
        setStatusMessage('');

    } catch (e: any) {
        console.error("AI Scan failed", e);
        setIsError(true);
        
        const errStr = (e.message || JSON.stringify(e)).toLowerCase();
        if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('resource_exhausted')) {
            setStatusMessage("⚠️ API Quota Exceeded. Please check your usage limits or try again in a few minutes.");
        } else {
             setStatusMessage("⚠️ Connection failed. Please check the URL or try refining your search terms.");
        }
    } finally {
        setIsScanning(false);
    }
  };

  const processAndAddRfps = async (ai: GoogleGenAI, textContext: string, fallbackUrl?: string, inventoryContext: string = '') => {
    const extractionPrompt = `
        Analyze the following text which contains information about RFPs/Tenders.
        Extract the opportunities into a strict JSON format.
        
        Reference Inventory Context:
        ${inventoryContext}
        
        Text Data (Search Results):
        ${textContext}
        
        Rules:
        - Map "URL" to the 'url' field. 
        - CRITICAL: Extract the SPECIFIC, DIRECT URL for the individual tender/RFP. 
        - Do NOT default to a general source URL (like ${fallbackUrl || 'the portal home page'}) unless it is the ONLY link available.
        - If a specific link is not found, return null or empty string.
        
        - Map "Due Date" to 'dueDate' (Format YYYY-MM-DD). If missing, use a date 30 days from now.
        - "matchLikelihood": Evaluate how well this opportunity matches the Reference Inventory Context. Must be "High", "Medium", or "Low". Treat all inventory items with STRICTLY EQUAL weightage.
        - Ensure 'excerpt' justifies the match likelihood.
    `;

    // Internal Retry for the second call
    const retryOperation = async <T,>(operation: () => Promise<T>, retries = 3, delay = 4000): Promise<T> => {
        try {
          return await operation();
        } catch (error: any) {
          if (retries <= 0) throw error;
          const errString = (error.message || JSON.stringify(error)).toLowerCase();
          if (errString.includes('429') || errString.includes('quota') || errString.includes('resource_exhausted') || errString.includes('overloaded')) {
              await new Promise(resolve => setTimeout(resolve, delay));
              return retryOperation(operation, retries - 1, delay * 2);
          }
          throw error;
        }
    };

    const jsonResponse = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
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
                                url: { type: Type.STRING },
                                matchLikelihood: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
                            },
                            required: ["title", "client", "excerpt", "dueDate", "matchLikelihood"]
                        }
                    }
                }
            }
        }
    }));

    if (jsonResponse.text) {
        const cleanedJson = cleanJsonString(jsonResponse.text);
        const data = JSON.parse(cleanedJson);
        
        if (data.opportunities && Array.isArray(data.opportunities)) {
            const newRfps: RFP[] = data.opportunities.map((opp: any, idx: number) => {
                const finalUrl = (opp.url && opp.url.length > 5 && opp.url !== 'Source Unavailable') 
                    ? opp.url 
                    : `https://google.com/search?q=${encodeURIComponent(opp.title + ' tender document')}`;

                return {
                    id: `rfp-${Date.now()}-${idx}`,
                    title: opp.title || 'Untitled Opportunity',
                    client: opp.client || 'Unknown Client',
                    dueDate: opp.dueDate || new Date().toISOString().split('T')[0],
                    url: finalUrl,
                    excerpt: opp.excerpt || 'No details available',
                    status: RFPStatus.DISCOVERED,
                    products: [],
                    tests: [],
                    matchLikelihood: opp.matchLikelihood || 'Medium'
                };
            });
            
            const sortedRfps = newRfps.sort((a, b) => {
                const map = { 'High': 3, 'Medium': 2, 'Low': 1 };
                return (map[b.matchLikelihood || 'Low'] || 0) - (map[a.matchLikelihood || 'Low'] || 0);
            });

            setRfps(prev => [...sortedRfps, ...prev]);
        }
    }
  };

  const getMatchColor = (level?: string) => {
      switch(level) {
          case 'High': return 'bg-green-100 text-green-700 border-green-200';
          case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
          case 'Low': return 'bg-slate-100 text-slate-600 border-slate-200';
          default: return 'bg-slate-100 text-slate-600';
      }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Sales Agent Console</h2>
          <p className="text-slate-500">Autonomous Market Scanning & Multi-Channel Ingestion.</p>
        </div>
        <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium">
                <Download size={16} /> Export CSV
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-in fade-in duration-300">
        {/* Left: Simplified Market Selection */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
                <Database size={20} className="text-blue-600"/>
                <h3 className="font-bold">Target Market</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
                Select a knowledge base for the agent to focus its search (if searching by keywords).
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
            
            {/* Inventory Status Indicator */}
            <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                    <BarChart3 size={16} className="text-indigo-500" />
                    <span className="text-xs font-bold text-slate-700">Stock Context Active</span>
                </div>
                {skus.length > 0 ? (
                    <p className="text-xs text-slate-500">
                        Agent is active. Cross-referencing <span className="font-bold">{skus.length} SKUs</span> with <span className="font-semibold text-indigo-600">strict equal weightage</span> against market data.
                    </p>
                ) : (
                    <div className="flex items-start gap-2 bg-amber-50 p-2 rounded border border-amber-100">
                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700">
                            No inventory loaded. Search will be generic. Add stock in Admin Panel for better matching.
                        </p>
                    </div>
                )}
            </div>
        </div>

        {/* Right: Scanner Control */}
        <div className="bg-indigo-50 p-6 rounded-xl shadow-sm border border-indigo-100 lg:col-span-2 flex flex-col justify-center">
            <label className="block text-sm font-bold text-indigo-900 mb-2">Paste your URL</label>
            <div className="flex gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-indigo-400" size={20} />
                <input 
                type="text" 
                value={scanTerm}
                onChange={(e) => setScanTerm(e.target.value)}
                placeholder="https://example.com/rfp-details"
                className="w-full pl-10 pr-4 py-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-indigo-900 placeholder-indigo-300"
                />
            </div>
            <button 
                onClick={handleScan}
                disabled={isScanning}
                className={`px-6 py-2 font-medium rounded-lg flex items-center gap-2 shadow-md hover:shadow-lg transition-all min-w-[140px] justify-center ${
                    isError 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-70`}
            >
                {isScanning ? <Loader2 className="animate-spin" /> : (isError ? <RefreshCw size={18} /> : <Globe size={18} />)}
                {isScanning ? 'Scanning...' : (isError ? 'Retry' : 'Start Scan')}
            </button>
            </div>
            <div className={`mt-4 flex items-center gap-2 text-xs font-medium h-5 ${isError ? 'text-red-600' : 'text-indigo-600'}`}>
                {isScanning && <Loader2 className="animate-spin" size={12} />}
                <span>{statusMessage}</span>
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
                  Paste a URL or enter keywords in the Scanner above to populate your pipeline.
              </p>
          </div>
      ) : (
          <div className="space-y-4">
            {rfps.map((rfp) => (
              <div key={rfp.id} className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md transition-shadow flex justify-between items-center group animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide ${rfp.status === RFPStatus.COMPLETED ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {rfp.status}
                        </span>
                        {/* Match Confidence Badge */}
                        <span className={`px-2 py-0.5 text-xs font-bold rounded border uppercase tracking-wide flex items-center gap-1 ${getMatchColor(rfp.matchLikelihood)}`}>
                            {rfp.matchLikelihood || 'Medium'} Confidence
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
                        <Globe2 size={12} /> Tender Link
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
