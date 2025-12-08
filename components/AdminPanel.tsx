
import React, { useRef, useState } from 'react';
import { Upload, Database, Settings, Package, AlertCircle, FileSpreadsheet, Loader2, FileType, Wand2 } from 'lucide-react';
import { SKU } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';

interface AdminPanelProps {
    skus: SKU[];
    setSkus: React.Dispatch<React.SetStateAction<SKU[]>>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ skus, setSkus }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleStockUpdate = (id: string, newQty: number) => {
    setSkus(prev => prev.map(sku => sku.id === id ? { ...sku, stockQty: newQty } : sku));
  };

  // Helper: Read file as Base64 for AI
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g. "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Helper: Clean JSON string from Markdown code blocks
  const cleanJsonString = (str: string) => {
    return str.replace(/```json/g, '').replace(/```/g, '').trim();
  };

  // Handler for Excel/CSV using SheetJS
  const processSpreadsheet = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) throw new Error("Spreadsheet appears empty");

    return jsonData.map((row: any, idx) => {
        // Try to map common column names loosely
        const model = row['Model'] || row['model'] || row['Part No'] || row['Item'] || 'Unknown';
        const mfg = row['Manufacturer'] || row['Maker'] || row['Brand'] || 'Generic';
        const price = row['Price'] || row['Unit Price'] || row['Cost'] || 0;
        const stock = row['Stock'] || row['Qty'] || row['Quantity'] || 0;
        const minStock = row['Min Stock'] || row['Threshold'] || 5;

        // Collect other fields into specs
        const specs: any = {};
        Object.keys(row).forEach(key => {
            if (!['Model', 'Manufacturer', 'Price', 'Stock', 'Min Stock'].includes(key)) {
                specs[key] = row[key];
            }
        });

        return {
            id: `sku-imp-xls-${Date.now()}-${idx}`,
            modelName: model,
            manufacturer: mfg,
            unitPrice: Number(price) || 0,
            stockQty: Number(stock) || 0,
            minStockThreshold: Number(minStock) || 5,
            specs: specs
        } as SKU;
    });
  };

  // Handler for PDF using Gemini AI
  const processPdfWithAI = async (file: File) => {
    setImportStatus('Uploading PDF to AI Analyst...');
    const base64Data = await fileToBase64(file);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });
    
    const prompt = `
      Analyze this document. It contains an inventory list or product catalog.
      Extract all product items into a structured JSON list.
      For each item, extract:
      - modelName (string)
      - manufacturer (string, infer if possible or use "Unknown")
      - unitPrice (number, default to 0 if missing)
      - stockQty (number, default to 0 if missing)
      - minStockThreshold (number, default to 5)
      - specs: A list of key-value pairs for technical specifications (e.g. key="Voltage", value="11kV").
      
      Return ONLY the JSON object with a property "items" containing the array.
    `;

    setImportStatus('AI is extracting structured data from PDF...');
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'application/pdf', data: base64Data } }
                ]
            }
        ],
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                modelName: { type: Type.STRING },
                                manufacturer: { type: Type.STRING },
                                unitPrice: { type: Type.NUMBER },
                                stockQty: { type: Type.NUMBER },
                                minStockThreshold: { type: Type.NUMBER },
                                specs: { 
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            key: { type: Type.STRING },
                                            value: { type: Type.STRING }
                                        },
                                        required: ["key", "value"]
                                    },
                                    nullable: true
                                }
                            },
                            required: ["modelName", "unitPrice"]
                        }
                    }
                }
            }
        }
    });

    if (!response.text) throw new Error("AI returned empty response");
    
    let result;
    try {
        result = JSON.parse(cleanJsonString(response.text));
    } catch (e) {
        throw new Error("Failed to parse AI response: " + e);
    }
    
    if (!result || !Array.isArray(result.items)) {
        console.warn("AI response did not contain items array:", result);
        return [];
    }
    
    return result.items.map((item: any, idx: number) => {
        // Convert specs array back to object Record<string, string|number>
        const specsObj: Record<string, string | number> = {};
        if (item.specs && Array.isArray(item.specs)) {
            item.specs.forEach((s: {key: string, value: string}) => {
                if (s.key && s.value) {
                    // Try to parse number if it looks like one
                    const num = parseFloat(s.value);
                    specsObj[s.key] = isNaN(num) ? s.value : num;
                }
            });
        }

        return {
            ...item,
            id: `sku-imp-ai-${Date.now()}-${idx}`,
            modelName: item.modelName || 'Unknown Item',
            manufacturer: item.manufacturer || 'Unknown',
            unitPrice: item.unitPrice || 0,
            stockQty: item.stockQty || 0, // Ensure defaults
            minStockThreshold: item.minStockThreshold || 5,
            specs: Object.keys(specsObj).length > 0 ? specsObj : { note: 'Extracted from PDF' }
        };
    });
  };

  const generateWithAI = async () => {
      setIsGenerating(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy' });
          const prompt = `
             Generate 10 realistic Industrial/Electrical inventory items (Transformers, Switchgears, Cables) for a demo database.
             Include varying specifications (Voltage, kVA, Length).
             Return JSON.
          `;
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    modelName: { type: Type.STRING },
                                    manufacturer: { type: Type.STRING },
                                    unitPrice: { type: Type.NUMBER },
                                    stockQty: { type: Type.NUMBER },
                                    specs: { 
                                        type: Type.OBJECT, 
                                        properties: {
                                            kVA: { type: Type.NUMBER, nullable: true },
                                            voltage: { type: Type.NUMBER, nullable: true },
                                            cooling: { type: Type.STRING, nullable: true }
                                        },
                                        nullable: true 
                                    }
                                }
                            }
                        }
                    }
                  }
              }
          });

          if(response.text) {
              const cleanedText = cleanJsonString(response.text);
              const data = JSON.parse(cleanedText);
              
              if (data.items && Array.isArray(data.items)) {
                  const newSkus: SKU[] = data.items.map((item: any, idx: number) => ({
                      id: `gen-${Date.now()}-${idx}`,
                      modelName: item.modelName || 'Unknown Item',
                      manufacturer: item.manufacturer || 'Generic',
                      unitPrice: item.unitPrice || 0,
                      stockQty: item.stockQty || 0,
                      minStockThreshold: 5,
                      specs: item.specs || {}
                  }));
                  setSkus(prev => [...prev, ...newSkus]);
                  alert(`Success! Generated ${newSkus.length} new items.`);
              } else {
                  throw new Error("Invalid structure returned by AI");
              }
          }

      } catch(e) {
          console.error(e);
          alert("Generation failed: " + e);
      } finally {
          setIsGenerating(false);
      }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus('Initializing import...');

    try {
        let newSkus: SKU[] = [];

        if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            setImportStatus('Parsing spreadsheet...');
            newSkus = await processSpreadsheet(file);
        } else if (file.name.endsWith('.pdf')) {
            newSkus = await processPdfWithAI(file);
        } else {
            throw new Error("Unsupported file format. Please use CSV, Excel, or PDF.");
        }

        if (newSkus.length > 0) {
            setSkus(prev => [...prev, ...newSkus]);
            alert(`Success! Imported ${newSkus.length} new items into inventory.`);
        } else {
            alert('No valid items found in the file.');
        }

    } catch (error: any) {
        console.error("Import failed:", error);
        alert(`Import failed: ${error.message || 'Unknown error'}`);
    } finally {
        setIsImporting(false);
        setImportStatus('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">System Administration</h2>
            <p className="text-slate-500">Configure agents, manage inventory, and set pricing logic.</p>
        </div>
        <button 
            onClick={generateWithAI}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 shadow-sm disabled:opacity-50"
        >
            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
            {isGenerating ? 'Generating...' : 'Auto-Generate Data'}
        </button>
      </div>

      {/* Inventory Management Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-blue-600" /> Inventory & Stock Control
            </h3>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                {skus.length} Items
            </span>
        </div>
        
        {skus.length === 0 ? (
            <div className="p-12 text-center">
                <p className="text-slate-400 mb-2">Inventory is empty.</p>
                <p className="text-slate-500 text-sm">Upload a file or use "Auto-Generate" to seed database.</p>
            </div>
        ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
                        <tr>
                            <th className="p-4">SKU / Model</th>
                            <th className="p-4">Manufacturer</th>
                            <th className="p-4 text-center">Unit Price</th>
                            <th className="p-4 text-center">Stock Level</th>
                            <th className="p-4 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {skus.map(sku => {
                            const isLowStock = sku.stockQty <= sku.minStockThreshold;
                            return (
                                <tr key={sku.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-medium text-slate-900">{sku.modelName}</div>
                                        <div className="text-xs text-slate-400">ID: {sku.id}</div>
                                    </td>
                                    <td className="p-4 text-slate-600">{sku.manufacturer}</td>
                                    <td className="p-4 text-center">₹{sku.unitPrice.toLocaleString()}</td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <input 
                                                type="number" 
                                                value={sku.stockQty}
                                                onChange={(e) => handleStockUpdate(sku.id, parseInt(e.target.value) || 0)}
                                                className="w-16 border border-blue-200 bg-blue-50 rounded text-center py-1 px-1 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-700 font-medium"
                                            />
                                            <span className="text-slate-400 text-xs">/ min {sku.minStockThreshold}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        {isLowStock ? (
                                            <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded text-xs font-bold">
                                                <AlertCircle size={12} /> Low Stock
                                            </span>
                                        ) : (
                                            <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-bold">
                                                In Stock
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* SKU Upload */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Database size={20} className="text-slate-500" /> Bulk Import
            </h3>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".csv, .xlsx, .xls, .pdf" 
                className="hidden" 
            />
            
            <div 
                onClick={!isImporting ? triggerFileUpload : undefined}
                className={`border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50 transition-all ${
                    isImporting 
                    ? 'opacity-70 cursor-wait' 
                    : 'hover:bg-slate-100 hover:border-blue-400 cursor-pointer group'
                }`}
            >
                {isImporting ? (
                    <div className="py-2">
                         <Loader2 className="animate-spin text-blue-500 mx-auto mb-3" size={32} />
                         <p className="text-sm font-medium text-slate-700">{importStatus}</p>
                    </div>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:scale-110 transition-transform">
                            <Upload className="text-blue-500" size={24} />
                        </div>
                        <p className="text-sm font-medium text-slate-700">Click to upload Inventory File</p>
                        <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500">
                             <span className="flex items-center gap-1"><FileSpreadsheet size={12}/> Excel/CSV</span>
                             <span className="w-1 h-1 bg-slate-300 rounded-full" />
                             <span className="flex items-center gap-1"><FileType size={12}/> PDF Datasheets (AI)</span>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Pricing Logic */}
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
            <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" /> Pricing Logic
            </h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-blue-800 mb-1">Contingency %</label>
                    <input type="number" defaultValue={3} className="w-full border border-blue-200 rounded px-3 py-2 bg-white text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-blue-800 mb-1">Logistics Overhead %</label>
                    <input type="number" defaultValue={5} className="w-full border border-blue-200 rounded px-3 py-2 bg-white text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="pt-2 text-xs text-blue-600 flex items-start gap-1">
                    <AlertCircle size={14} className="mt-0.5" />
                    Updates apply to all future Pricing Agent runs.
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
