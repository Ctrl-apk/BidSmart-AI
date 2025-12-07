
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
  async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(`Operation timed out after ${ms}ms`);
        resolve(fallback);
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error("Async operation failed:", error);
      clearTimeout(timeoutId);
      return fallback;
    }
  }

  // Step 1: Main Agent - Extraction
  async extractRFPData(rfp: RFP): Promise<Partial<RFP>> {
    this.log(AgentRole.MAIN, `Reading RFP: "${rfp.title}"`, 'thinking');
    await this.sleep(800);
    this.log(AgentRole.MAIN, 'Identifying key deliverables and technical standards...', 'info');
    
    // Fallback data if AI fails
    const fallbackData = {
        products: [
           {
            itemNo: '1.01',
            description: `Primary Equipment: ${rfp.title.replace('Supply of', '').trim()}`,
            qty: 5,
            unit: 'Nos',
            params: { kVA: 1000, voltage: 11000, rating: 'Heavy Duty' }
           },
           {
            itemNo: '1.02',
            description: `Spares / Accessories`,
            qty: 10,
            unit: 'Set',
            params: { type: 'Maintenance Kit' }
           }
        ],
        tests: [
            { id: 't-1', testName: 'Routine Acceptance Test', scope: 'IEC 60076', perUnit: true, perLot: false, remarks: 'Factory acceptance' },
            { id: 't-2', testName: 'Type Test (Heat Run)', scope: 'IEC 60076-2', perUnit: false, perLot: true, remarks: 'One per lot' }
        ]
    };

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
                         cooling: { type: Type.STRING, nullable: true }
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
            Extract 2-3 realistic product line items and 2 tests for a tender: "${rfp.title}".
            Excerpt: "${rfp.excerpt}".
            Return JSON.
          `;
    
          const result = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: 0.3
            }
          });
          
          if (!result.text) throw new Error("No text");
          const parsed = JSON.parse(result.text);
          // Sanitize
          const products = (parsed.products || []).map((p: any) => ({
             ...p,
             params: p.params || { note: 'Standard Spec' }
          }));
          const tests = parsed.tests || [];
          if(products.length === 0) throw new Error("Empty products");
          
          return { products, tests };
    };

    // Race AI against 10s timeout
    const extracted = await this.withTimeout(aiCall(), 10000, fallbackData);

    this.log(AgentRole.MAIN, `Extraction success: Found ${extracted.products.length} items and ${extracted.tests.length} tests.`, 'success');
    return extracted;
  }

  // Step 2: Technical Agent - SKU Matching
  async runTechnicalMatching(products: ProductRequirement[], availableSkus: SKU[]): Promise<SKUMatch[]> {
    this.log(AgentRole.TECHNICAL, `Ingesting ${products.length} line items from Main Agent...`, 'info');
    await this.sleep(1200);

    const matches: SKUMatch[] = products.map(prod => {
      // Simulate analysis time
      
      const scoredSkus = availableSkus.map(sku => {
        let totalScore = 0;
        let paramCount = 0;
        const details: Record<string, number> = {};

        for (const [key, val] of Object.entries(prod.params)) {
            if (!val) continue; 
            paramCount++;
            const skuVal = sku.specs[key];
            
            if (skuVal === undefined) {
                details[key] = 0; 
                continue;
            }

            if (typeof val === 'number' && typeof skuVal === 'number') {
                const diff = Math.abs(val - skuVal);
                const divisor = val === 0 ? 1 : val;
                const score = Math.max(0, 1 - (diff / divisor)); 
                details[key] = score;
                totalScore += score;
            } else {
                const score = String(val).toLowerCase() === String(skuVal).toLowerCase() ? 1 : 0;
                details[key] = score;
                totalScore += score;
            }
        }
        
        if (paramCount === 0) {
             const randomFactor = Math.random() * 0.4;
             return { sku, matchScore: 50 + randomFactor * 30, details: { 'heuristic_match': 0.8 } };
        }

        const finalScore = paramCount > 0 ? (totalScore / paramCount) * 100 : 0;
        return { sku, matchScore: finalScore, details };
      });

      scoredSkus.sort((a, b) => b.matchScore - a.matchScore);
      const topMatch = scoredSkus[0];
      
      // Stock Validation Logic (MTO)
      const isMTO = topMatch.sku.stockQty < prod.qty;

      if (isMTO) {
        this.log(AgentRole.TECHNICAL, `⚠️ STOCK ALERT: Item ${prod.itemNo} requires ${prod.qty} units, but best match "${topMatch.sku.modelName}" has only ${topMatch.sku.stockQty}. Internal msg: MTO made to order.`, 'warning');
      } else {
        this.log(AgentRole.TECHNICAL, `Matched Item "${prod.description.substring(0, 20)}..." to ${topMatch.sku.modelName} (${topMatch.matchScore.toFixed(0)}%) - In Stock.`, 'success');
      }

      return {
        itemNo: prod.itemNo,
        rfpParams: prod.params as Record<string, string|number>,
        matches: scoredSkus.slice(0, 3), // Top 3
        selectedSkuId: topMatch.sku.id,
        isMTO,
        requestedQty: prod.qty
      };
    });

    return matches;
  }

  // Step 3: Pricing Agent
  async runPricing(matches: SKUMatch[], tests: TestRequirement[]): Promise<FinalResponse> {
    this.log(AgentRole.PRICING, 'Applying logic: Cost + Logistics + Taxes...', 'thinking');
    await this.sleep(1000);

    let subtotal = 0;
    const pricingLines: PricingLine[] = matches.map(match => {
      const selected = match.matches.find(m => m.sku.id === match.selectedSkuId);
      if (!selected) throw new Error("Selected SKU not found");
      
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

    this.log(AgentRole.PRICING, `Total Estimated: $${grandTotal.toLocaleString()}`, 'success');

    return {
      pricingTable: pricingLines,
      subtotal,
      logistics,
      contingency,
      taxes,
      grandTotal,
      generatedAt: new Date().toISOString()
    };
  }

  // Step 4: Response
  async generateResponse(rfp: RFP, pricing: FinalResponse) {
    this.log(AgentRole.RESPONSE, 'Compiling technical sheets and commercial offer...', 'thinking');
    await this.sleep(1000);
    this.log(AgentRole.RESPONSE, 'Response Package Ready.', 'success');
  }
}
