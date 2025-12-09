
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

    // Helper: Retry Logic (Strengthened for Production)
    const retryOperation = async <T,>(operation: () => Promise<T>, retries = 5, delay = 5000): Promise<T> => {
        try {
            return await operation();
        } catch (error: any) {
            const errString = (error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))).toLowerCase();

            if (errString.includes('429') || errString.includes('quota') || errString.includes('resource_exhausted') || errString.includes('overloaded')) {
                if (retries <= 0) {
                    throw new Error("System is currently at maximum capacity. Please try again in 5 minutes.");
                }

                setImportStatus(`High Traffic: Pausing for ${delay / 1000}s before retry (${retries} attempts remaining)...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return retryOperation(operation, retries - 1, delay * 1.5);
            }
            throw error;
        }
    };

    // Handler for PDF using Gemini AI
    const processPdfWithAI = async (file: File) => {
        setImportStatus('Uploading PDF to AI Analyst...');
        const base64Data = await fileToBase64(file);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });

        const prompt = `
      You are an expert AI system for structured data extraction from complex unstructured documents.

TASK:
Analyze the provided document. It contains an inventory list / product catalog.
Extract **ALL product items**, not just top few. Include every main product entry and its variants, but ignore small accessories unless they contain distinct product codes or specifications.

OUTPUT FORMAT:
Return ONLY a JSON object with a property called "items" containing an array of product objects.

For each item, extract and infer the following fields:

- id: Auto-generate unique ID using format PROD-001, PROD-002, etc.
- modelName: (string, exact product name or model code)
- manufacturer: (string, infer from context; if missing use "Unknown")
- category: (infer category from section headings such as "HV Cables", "Instrumentation Cables", etc.)
- unitPrice: (number, default = 0 if missing)
- currency: (string, detect for example: INR, USD, etc.; default = "INR")
- stockQty: (number, default = 0 if missing)
- minStockThreshold: (number, default = 5)
- isAvailable: (boolean → true if stockQty > minStockThreshold, else false)
- specs: an array of key/value technical specification pairs (e.g.,
   { "key": "Voltage", "value": "11kV" },
   { "key": "Conductor", "value": "Aluminium" },
   { "key": "Insulation", "value": "XLPE" } )

ADDITIONAL REQUIREMENTS:
- Normalize repeated products into a single object and merge specs instead of duplicating.
- Automatically infer missing values wherever possible using contextual clues.
- Clean and standardize text by removing special characters and newline break issues.
- Preserve numeric formats accurately without units unless part of specification.
- Ensure JSON is syntactically valid and ready for direct ingestion into a database.

RETURN FORMAT EXAMPLE (STRUCTURE ONLY, NOT SAMPLE DATA):
{
  "items": [
    {
      "id": "PROD-001",
      "modelName": "",
      "manufacturer": "",
      "category": "",
      "unitPrice": 0,
      "currency": "INR",
      "stockQty": 0,
      "minStockThreshold": 5,
      "isAvailable": false,
      "specs": [
        {"key": "", "value": ""}
      ]
    }
  ]
}

IMPORTANT:
Return ONLY the JSON. Do not include explanations, natural language, tags, or commentary.

    `;

        setImportStatus('AI is extracting structured data from PDF (this may take a moment)...');

        // Using Retry Logic
        let response;
        try {
            response = await retryOperation(() => ai.models.generateContent({
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
            }));
        } catch (e: any) {
            console.error("PDF Extraction Failed:", e);
            throw new Error(e.message || "Could not extract data from PDF. API may be overloaded. Please try again later.");
        }

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

        return result.items.map((item: any, idx: number) => ({
            id: `sku-imp-pdf-${Date.now()}-${idx}`,
            modelName: item.modelName || 'Unknown Model',
            manufacturer: item.manufacturer || 'Unknown Mfg',
            unitPrice: item.unitPrice || 0,
            stockQty: item.stockQty || 0,
            minStockThreshold: item.minStockThreshold || 5,
            specs: item.specs ? item.specs.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {}) : {}
        } as SKU));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsImporting(true);
        setImportStatus('Analyzing file type...');

        try {
            let newSkus: SKU[] = [];

            if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) {
                setImportStatus('Processing spreadsheet locally...');
                newSkus = await processSpreadsheet(file);
            } else if (file.name.endsWith('.pdf')) {
                newSkus = await processPdfWithAI(file);
            } else {
                throw new Error("Unsupported file format. Please use CSV, XLSX, or PDF.");
            }

            setSkus(prev => [...newSkus, ...prev]);
            setImportStatus(`Success! Imported ${newSkus.length} items.`);
            setTimeout(() => setImportStatus(''), 3000);
        } catch (err: any) {
            console.error(err);
            setImportStatus(`Error: ${err.message}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleGenerateMockData = async () => {
        setIsGenerating(true);
        // Simulate generation delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        const mockData: SKU[] = Array.from({ length: 5 }).map((_, i) => ({
            id: `sku-gen-${Date.now()}-${i}`,
            modelName: `Transformer Type-${String.fromCharCode(65 + i)}`,
            manufacturer: 'VoltTech Industries',
            unitPrice: 15000 + (Math.random() * 5000),
            stockQty: Math.floor(Math.random() * 20),
            minStockThreshold: 3,
            specs: {
                'kVA': 100 + (i * 50),
                'Voltage': '11kV',
                'Cooling': 'ONAN'
            }
        }));

        setSkus(prev => [...mockData, ...prev]);
        setIsGenerating(false);
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">System Administration</h2>
                <p className="text-slate-500">Manage Product Inventory, Pricing Rules, and System Config.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Col: Actions */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Database size={20} className="text-blue-600" /> Data Import
                        </h3>

                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isImporting ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                                }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept=".csv,.xlsx,.pdf"
                            />

                            {isImporting ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                                    <p className="text-sm font-medium text-slate-600">{importStatus}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <Upload className="text-slate-400 mb-2" size={32} />
                                    <p className="text-sm font-medium text-slate-600">Click to Upload</p>
                                    <p className="text-xs text-slate-400 mt-1">Supports PDF Datasheets, Excel, CSV</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                            <button
                                onClick={handleGenerateMockData}
                                disabled={isGenerating}
                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg flex items-center justify-center gap-2"
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                                Auto-Generate Sample Data
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Settings size={20} className="text-slate-600" /> Global Config
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Margin</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="number" placeholder="25" className="w-full border border-slate-300 bg-white rounded px-3 py-2 text-sm" />
                                    <span className="text-slate-500">%</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tax Rate</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="number" placeholder="10" className="w-full border border-slate-300 bg-white rounded px-3 py-2 text-sm" />
                                    <span className="text-slate-500">%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: Inventory Table */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                        <div className="flex items-center gap-2">
                            <Package size={18} className="text-slate-500" />
                            <span className="font-bold text-slate-700">Inventory Database ({skus.length})</span>
                        </div>
                        <div className="flex gap-2 text-xs">
                            <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100"><div className="w-2 h-2 rounded-full bg-green-500"></div> In Stock</span>
                            <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100"><div className="w-2 h-2 rounded-full bg-red-500"></div> Low Stock</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        {skus.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <Package size={48} className="mb-4 opacity-20" />
                                <p>No inventory items found.</p>
                                <p className="text-sm">Upload a PDF datasheet or Excel file to populate.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 pl-6 font-medium">Model / Part No</th>
                                        <th className="p-3 font-medium">Manufacturer</th>
                                        <th className="p-3 font-medium text-right">Unit Price</th>
                                        <th className="p-3 font-medium text-center">Stock</th>
                                        <th className="p-3 font-medium">Specs</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {skus.map(sku => (
                                        <tr key={sku.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-3 pl-6 font-medium text-slate-900">{sku.modelName}</td>
                                            <td className="p-3 text-slate-500">{sku.manufacturer}</td>
                                            <td className="p-3 text-right font-mono text-slate-600">${sku.unitPrice.toLocaleString()}</td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={sku.stockQty}
                                                        onChange={(e) => handleStockUpdate(sku.id, parseInt(e.target.value))}
                                                        className={`w-16 text-center border rounded py-1 outline-none focus:ring-2 focus:ring-blue-500 ${sku.stockQty <= sku.minStockThreshold
                                                            ? 'border-red-300 bg-red-50 text-red-700'
                                                            : 'border-slate-200 bg-white text-slate-700'
                                                            }`}
                                                    />
                                                    {sku.stockQty <= sku.minStockThreshold && (
                                                        <AlertCircle size={14} className="text-red-500" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {Object.entries(sku.specs).slice(0, 3).map(([k, v]) => (
                                                        <span key={k} className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200 truncate max-w-[80px]">
                                                            {k}: {v}
                                                        </span>
                                                    ))}
                                                    {Object.keys(sku.specs).length > 3 && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200">
                                                            +{Object.keys(sku.specs).length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
