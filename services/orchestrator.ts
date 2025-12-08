
import { AgentRole, LogEntry, RFP, SKUMatch, SKU, ProductRequirement, PricingLine, FinalResponse, TestRequirement } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

export class Orchestrator {
  private addLog: (entry: LogEntry) => void;
  private ai: GoogleGenAI;

  constructor(addLog: (entry: LogEntry) => void) {
    this.addLog = addLog;
    try {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });
    } catch (e) {
        console.warn("API Key missing or invalid, agents will run in simulation mode.");
        this.ai = new GoogleGenAI({ apiKey: 'dummy_key' });
    }
  }

  private log(agent: AgentRole, message: string, type: LogEntry['type'] = 'info') {
    this.addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      agent,
      message,
      type
    });
  }

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper to ensure AI calls don't hang forever
  async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T | null): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        if (fallback !== null) {
            console.warn(`Operation timed out after ${ms}ms, using fallback`);
            resolve(fallback);
        } else {
            reject(new Error(`Operation timed out after ${ms}ms`));
        }
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error("Async operation failed:", error);
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Internal helper for logic sharing between independent agents
  // IMPLEMENTS TECHNICAL AGENT MATH RULES
  private performMatching(products: ProductRequirement[], availableSkus: SKU[]): SKUMatch[] {
    return products.map(prod => {
      const scoredSkus = availableSkus.map(sku => {
        let totalScore = 0;
        let paramCount = 0;
        const details: Record<string, number> = {};

        // ----------------- PARAMETER MATCHING LOGIC -----------------
        // Rules:
        // 1. All parameters have equal weightage.
        // 2. Missing parameters score = 0.
        // 3. Normalized Math formulas for Numeric/Range/Categorical.

        // SAFETY: Handle case where params might be null/undefined from extraction
        const params = prod.params || {};

        for (const [key, val] of Object.entries(params)) {
            if (val === null || val === undefined || val === '') continue; 
            paramCount++;
            
            const skuVal = sku.specs[key];
            
            // Rule: Missing parameters score = 0
            if (skuVal === undefined || skuVal === null) {
                details[key] = 0; 
                continue;
            }

            let score = 0;

            // ----------------- NORMALIZATION ------------------
            const rfpValStr = String(val).trim().toLowerCase();
            const skuValStr = String(skuVal).trim().toLowerCase();

            // Check for Range in RFP value (e.g., "100-200")
            const rangeMatch = rfpValStr.match(/^(\d+)-(\d+)$/);
            
            if (rangeMatch) {
                // ---------------- RANGE SCORING -------------------------
                // If RFP specifies range [L, U]:
                // m_i = 1 if OEM_i in [L, U]
                // else m_i = 1 − (distance_to_range / range_width)
                
                const min = parseFloat(rangeMatch[1]);
                const max = parseFloat(rangeMatch[2]);
                const skuNum = parseFloat(skuValStr);
                
                if (!isNaN(skuNum)) {
                    if (skuNum >= min && skuNum <= max) {
                        score = 1;
                    } else {
                        const dist = skuNum < min ? min - skuNum : skuNum - max;
                        const rangeWidth = max - min || 1; // Avoid division by zero
                        score = Math.max(0, 1 - (dist / rangeWidth));
                    }
                }
            } else if (!isNaN(parseFloat(rfpValStr)) && !isNaN(parseFloat(skuValStr)) && isFinite(parseFloat(rfpValStr))) {
                 // ---------------- NUMERIC CLOSENESS ----------------------
                 // m_i = max(0, 1 − |OEM_i − RFP_i| / (RFP_i + ε))
                 
                 const rfpNum = parseFloat(rfpValStr);
                 const skuNum = parseFloat(skuValStr);
                 const epsilon = 0.00001; // Avoid division by zero
                 
                 const diff = Math.abs(skuNum - rfpNum);
                 score = Math.max(0, 1 - (diff / (rfpNum + epsilon)));
            } else {
                // ---------------- EXACT MATCH SCORING -------------------
                // For exact categorical matches: m_i = 1 if exact match else 0
                // (Simulating semantic match > 0.8 with exact string check here)
                score = rfpValStr === skuValStr ? 1 : 0;
            }

            details[key] = score;
            totalScore += score;
        }
        
        // ---------------- FINAL SPEC MATCH METRIC ---------------
        // SpecMatch = (1/N) × Σ m_i × 100
        if (paramCount === 0) {
             return { sku, matchScore: 0, details: { 'error': 0 } };
        }

        const finalScore = (totalScore / paramCount) * 100;
        return { sku, matchScore: finalScore, details };
      });

      // ---------------- TOP-3 SKU SELECTION -------------------
      // Sort descending and choose Top-3
      scoredSkus.sort((a, b) => b.matchScore - a.matchScore);
      
      const topMatch = scoredSkus[0];
      
      // Handle case where inventory is empty or no matches
      if (!topMatch) {
          return {
              itemNo: prod.itemNo,
              rfpParams: prod.params as Record<string, string|number>,
              matches: [],
              selectedSkuId: '',
              isMTO: true,
              requestedQty: prod.qty
          };
      }

      const isMTO = topMatch.sku.stockQty < prod.qty;

      return {
        itemNo: prod.itemNo,
        rfpParams: prod.params as Record<string, string|number>,
        matches: scoredSkus.slice(0, 3), // Top 3
        selectedSkuId: topMatch.sku.id,
        isMTO,
        requestedQty: prod.qty
      };
    });
  }

  // Step 1: Main Agent - Extraction
  async extractRFPData(rfp: RFP): Promise<Partial<RFP>> {
    this.log(AgentRole.MAIN, `Reading RFP: "${rfp.title}"`, 'thinking');
    await this.sleep(800);
    this.log(AgentRole.MAIN, 'Identifying key deliverables and technical standards...', 'info');
    
    const aiCall = async () => {
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
              products: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    itemNo: { type: Type.STRING },
                    description: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    params: { 
                      type: Type.OBJECT,
                      properties: {
                         kVA: { type: Type.NUMBER, nullable: true },
                         voltage: { type: Type.NUMBER, nullable: true },
                         efficiency: { type: Type.NUMBER, nullable: true },
                         cooling: { type: Type.STRING, nullable: true },
                         frequency: { type: Type.NUMBER, nullable: true },
                         phases: { type: Type.NUMBER, nullable: true }
                      },
                      nullable: true
                    }
                  },
                  required: ["itemNo", "description", "qty", "unit"]
                }
              },
              tests: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    testName: { type: Type.STRING },
                    scope: { type: Type.STRING },
                    perUnit: { type: Type.BOOLEAN },
                    perLot: { type: Type.BOOLEAN },
                    remarks: { type: Type.STRING }
                  },
                  required: ["testName", "perUnit", "perLot"]
                }
              }
            }
          };
    
          const prompt = `
            Act as an expert technical presales engineer.
            Analyze the following RFP information to extract product requirements and required tests.
            
            RFP Title: "${rfp.title}"
            RFP Excerpt: "${rfp.excerpt}"
            
            CRITICAL INSTRUCTION:
            The excerpt might be brief. If it lacks specific details, you MUST INFER and GENERATE plausible, industry-standard product line items and tests based on the RFP Title.
            Do not return empty lists. Create a realistic demo scenario if needed.
            
            1. Extract/Infer 1-5 Product Items (Transformers, Cables, Switchgear, etc).
            2. Extract/Infer 2-3 Standard Tests (Type Tests, Routine Tests).
            3. Extract technical parameters (kV, kVA, Current, etc) into the 'params' object.
          `;
    
          const result = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: 0.1
            }
          });
          
          if (!result.text) throw new Error("No response from AI");
          const parsed = JSON.parse(result.text);
          
          return { 
              products: parsed.products || [], 
              tests: parsed.tests || [] 
          };
    };

    // Increased timeout to 60s to avoid timeouts
    try {
        const extracted = await this.withTimeout(aiCall(), 60000, null);
        this.log(AgentRole.MAIN, `Extraction success: Found ${extracted.products.length} items and ${extracted.tests.length} tests.`, 'success');
        return extracted;
    } catch (e: any) {
        this.log(AgentRole.MAIN, `Extraction Failed: ${e.message}`, 'error');
        throw e;
    }
  }

  // Step 2: Technical Agent - SKU Matching (Independent)
  async runTechnicalMatching(products: ProductRequirement[], availableSkus: SKU[]): Promise<SKUMatch[]> {
    this.log(AgentRole.TECHNICAL, `Comparing extracted specs against ${availableSkus.length} OEM SKUs using vector logic...`, 'thinking');
    await this.sleep(1500);

    if (availableSkus.length === 0) {
        this.log(AgentRole.TECHNICAL, `No Inventory Data Found! Please upload SKU data in Admin Panel.`, 'error');
        return [];
    }

    const matches = this.performMatching(products, availableSkus);

    matches.forEach(m => {
        if (m.matches.length === 0) {
            this.log(AgentRole.TECHNICAL, `No matching SKUs found for Item ${m.itemNo}`, 'warning');
            return;
        }
        
        const topMatch = m.matches[0];
        if (m.isMTO) {
          this.log(AgentRole.TECHNICAL, `Stock Alert: Best match "${topMatch.sku.modelName}" (SpecMatch: ${topMatch.matchScore.toFixed(1)}%) insufficient stock.`, 'warning');
        } else {
          this.log(AgentRole.TECHNICAL, `Selected "${topMatch.sku.modelName}" with SpecMatch: ${topMatch.matchScore.toFixed(1)}%`, 'success');
        }
    });

    return matches;
  }

  // Step 3: Pricing Agent (Independent - Parallel)
  async runPricing(products: ProductRequirement[], availableSkus: SKU[], tests: TestRequirement[], currency: string = 'USD'): Promise<FinalResponse> {
    this.log(AgentRole.PRICING, `Initiating parallel market cost analysis & tax calculation in ${currency}...`, 'thinking');
    await this.sleep(2000);

    if (availableSkus.length === 0) {
         this.log(AgentRole.PRICING, `Cannot calculate pricing: Inventory is empty.`, 'error');
         throw new Error("Inventory Empty");
    }

    // Pricing Agent independently determines the SKU to price (typically the best match)
    const matches = this.performMatching(products, availableSkus);

    let subtotal = 0;
    const pricingLines: PricingLine[] = matches.map(match => {
      const selected = match.matches.find(m => m.sku.id === match.selectedSkuId);
      
      if (!selected) {
          return {
              itemNo: match.itemNo,
              skuModel: "NO MATCH FOUND",
              unitPrice: 0,
              qty: match.requestedQty || 0,
              productTotal: 0,
              testCosts: 0,
              lineTotal: 0,
              notes: "Requires Manual Sourcing"
          };
      }
      
      const qty = match.requestedQty || 1; 
      
      const unitPrice = selected.sku.unitPrice;
      const productTotal = unitPrice * qty;

      let testCost = 0;
      tests.forEach(t => {
        const baseTestCost = 500; 
        if (t.perUnit) testCost += baseTestCost * qty;
        if (t.perLot) testCost += (baseTestCost * 2);
      });

      const lineTotal = productTotal + testCost;
      subtotal += lineTotal;

      // Add Internal Message note if MTO
      const notes = match.isMTO 
        ? "MTO: Made to Order - 4-6 Weeks Lead Time"
        : "Standard Stock Delivery (1-2 Weeks)";

      return {
        itemNo: match.itemNo,
        skuModel: selected.sku.modelName,
        unitPrice,
        qty,
        productTotal,
        testCosts: testCost,
        lineTotal,
        notes
      };
    });

    const logistics = subtotal * 0.05;
    const contingency = subtotal * 0.03;
    const taxes = (subtotal + logistics + contingency) * 0.10;
    const grandTotal = subtotal + logistics + contingency + taxes;

    // Determine symbol for log
    const symbols: Record<string, string> = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'INR': '₹', 'JPY': '¥' };
    const sym = symbols[currency] || '$';

    this.log(AgentRole.PRICING, `Total Estimated: ${sym}${grandTotal.toLocaleString()}`, 'success');

    return {
      pricingTable: pricingLines,
      subtotal,
      logistics,
      contingency,
      taxes,
      grandTotal,
      generatedAt: new Date().toISOString(),
      currency
    };
  }

  // Step 4: Response
  async generateResponse(rfp: RFP, pricing: FinalResponse) {
    this.log(AgentRole.RESPONSE, 'Compiling technical sheets and commercial offer...', 'thinking');
    await this.sleep(1000);
    this.log(AgentRole.RESPONSE, 'Response Package Ready.', 'success');
  }
}
