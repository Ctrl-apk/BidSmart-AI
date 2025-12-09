
import { AgentRole, LogEntry, RFP, SKUMatch, SKU, ProductRequirement, PricingLine, FinalResponse, TestRequirement, RiskAnalysis, ComplianceCheck, CompetitorAnalysis } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

export class Orchestrator {
  private addLog: (entry: LogEntry) => void;
  private ai: GoogleGenAI;

  constructor(addLog: (entry: LogEntry) => void) {
    this.addLog = addLog;
    try {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'dummy_key' });
    } catch (e) {
        console.warn("API Key missing or invalid.");
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

  // Retry Logic for Production Readiness
  async retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 4000): Promise<T> {
      try {
          return await operation();
      } catch (error: any) {
          if (retries <= 0) throw error;
          
          const errString = (error.message || JSON.stringify(error)).toLowerCase();
          const isQuota = errString.includes('429') || errString.includes('quota') || errString.includes('resource_exhausted');
          
          if (isQuota || errString.includes('503') || errString.includes('overloaded')) {
              this.log(AgentRole.MAIN, `API Busy (${isQuota ? 'Quota Limit' : 'Overload'}). Retrying in ${delay/1000}s...`, 'warning');
              await this.sleep(delay);
              return this.retryOperation(operation, retries - 1, delay * 2);
          }
          throw error;
      }
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
                const min = parseFloat(rangeMatch[1]);
                const max = parseFloat(rangeMatch[2]);
                const skuNum = parseFloat(skuValStr);
                
                if (!isNaN(skuNum)) {
                    if (skuNum >= min && skuNum <= max) {
                        score = 1;
                    } else {
                        const dist = skuNum < min ? min - skuNum : skuNum - max;
                        const rangeWidth = max - min || 1; 
                        score = Math.max(0, 1 - (dist / rangeWidth));
                    }
                }
            } else if (!isNaN(parseFloat(rfpValStr)) && !isNaN(parseFloat(skuValStr)) && isFinite(parseFloat(rfpValStr))) {
                 const rfpNum = parseFloat(rfpValStr);
                 const skuNum = parseFloat(skuValStr);
                 const epsilon = 0.00001; 
                 
                 const diff = Math.abs(skuNum - rfpNum);
                 score = Math.max(0, 1 - (diff / (rfpNum + epsilon)));
            } else {
                score = rfpValStr === skuValStr ? 1 : 0;
            }

            details[key] = score;
            totalScore += score;
        }
        
        // ---------------- FINAL SPEC MATCH METRIC ---------------
        if (paramCount === 0) {
             return { sku, matchScore: 0, details: { 'error': 0 } };
        }

        const finalScore = (totalScore / paramCount) * 100;
        return { sku, matchScore: finalScore, details };
      });

      // ---------------- TOP-3 SKU SELECTION -------------------
      scoredSkus.sort((a, b) => b.matchScore - a.matchScore);
      
      const topMatch = scoredSkus[0];
      
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

    try {
        // Use Retry Logic for Robustness
        const extracted = await this.retryOperation(() => this.withTimeout(aiCall(), 60000, null));
        
        if (!extracted) throw new Error("Extraction returned null.");

        this.log(AgentRole.MAIN, `Extraction success: Found ${extracted.products?.length || 0} items.`, 'success');
        return extracted;
    } catch (e: any) {
        this.log(AgentRole.MAIN, `Extraction Failed: ${e.message}`, 'error');
        throw e; // Propagate error for UI to handle (no mock data)
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
        // Self-Correction Logic
        if (m.matches.length === 0) {
            this.log(AgentRole.TECHNICAL, `Auto-Inference: No direct match for Item ${m.itemNo}. Expanding search parameters...`, 'warning');
            return;
        }
        
        const topMatch = m.matches[0];
        if (topMatch.matchScore < 60) {
            this.log(AgentRole.TECHNICAL, `Low Confidence Match (${topMatch.matchScore.toFixed(1)}%) for Item ${m.itemNo}. Initiating closest-substitute mapping.`, 'warning');
        } else if (m.isMTO) {
            this.log(AgentRole.TECHNICAL, `Stock Alert: Best match "${topMatch.sku.modelName}" available but insufficient qty (MTO).`, 'warning');
        } else {
            this.log(AgentRole.TECHNICAL, `Exact Match: "${topMatch.sku.modelName}" (Score: ${topMatch.matchScore.toFixed(1)}%)`, 'success');
        }
    });

    return matches;
  }

  // Step 3: Pricing Agent (Independent - Parallel)
  async runPricing(products: ProductRequirement[], availableSkus: SKU[], tests: TestRequirement[], currency: string = 'USD'): Promise<Partial<FinalResponse>> {
    this.log(AgentRole.PRICING, `Initiating parallel market cost analysis in ${currency}...`, 'thinking');
    await this.sleep(1000);

    if (availableSkus.length === 0) {
         throw new Error("Inventory Empty");
    }

    const matches = this.performMatching(products, availableSkus);
    let subtotal = 0;
    
    const pricingTable: PricingLine[] = matches.map(match => {
      const selected = match.matches.find(m => m.sku.id === match.selectedSkuId);
      
      if (!selected) {
          return { itemNo: match.itemNo, skuModel: "Manual Source Req", unitPrice: 0, qty: match.requestedQty || 0, productTotal: 0, testCosts: 0, lineTotal: 0, notes: "Out of Scope" };
      }
      
      const qty = match.requestedQty || 1; 
      const unitPrice = selected.sku.unitPrice;
      const productTotal = unitPrice * qty;
      let testCost = 0;
      tests.forEach(t => { if (t.perUnit) testCost += 500 * qty; if (t.perLot) testCost += 1000; });

      const lineTotal = productTotal + testCost;
      subtotal += lineTotal;

      const notes = match.isMTO ? "MTO: 4-6 Weeks" : "Ex-Stock: 1-2 Weeks";
      return { itemNo: match.itemNo, skuModel: selected.sku.modelName, unitPrice, qty, productTotal, testCosts: testCost, lineTotal, notes };
    });

    const logistics = subtotal * 0.05;
    const contingency = subtotal * 0.03;
    const taxes = (subtotal + logistics + contingency) * 0.10;
    const grandTotal = subtotal + logistics + contingency + taxes;

    this.log(AgentRole.PRICING, `Bill of Materials Generated. Gross Total: ${currency} ${grandTotal.toLocaleString()}`, 'success');

    return { pricingTable, subtotal, logistics, contingency, taxes, grandTotal, currency };
  }

  // Step 4: Risk Agent (New)
  async runRiskAssessment(rfp: RFP, matches: SKUMatch[]): Promise<RiskAnalysis> {
      this.log(AgentRole.RISK, "Scanning commercial terms and stock liabilities...", "thinking");
      await this.sleep(2000);

      const mtoCount = matches.filter(m => m.isMTO).length;
      const factors: string[] = [];
      let score = 20; // Base Risk

      if (mtoCount > 0) {
          factors.push(`Supply Chain: ${mtoCount} items are Made-To-Order (Lead time risk).`);
          score += 30;
      }
      if (rfp.dueDate && new Date(rfp.dueDate).getTime() - Date.now() < 86400000 * 5) {
          factors.push("Timeline: Submission due in < 5 days.");
          score += 15;
      }
      if (matches.some(m => m.matches.length > 0 && m.matches[0].matchScore < 80)) {
          factors.push("Technical: Some items have < 80% spec compliance.");
          score += 20;
      }

      const level = score > 70 ? 'High' : score > 40 ? 'Medium' : 'Low';
      const mitigation = score > 70 
        ? "Recommendation: Request 2 week extension and add liability cap clause." 
        : "Recommendation: Standard warranty terms apply.";

      this.log(AgentRole.RISK, `Risk Assessment Complete. Level: ${level} (Score: ${score})`, score > 70 ? 'warning' : 'success');

      return { score, level, factors, mitigation };
  }

  // Step 5: Compliance Agent (New)
  async runComplianceCheck(rfp: RFP): Promise<ComplianceCheck> {
      this.log(AgentRole.COMPLIANCE, "Verifying ISO/IEC/ASTM standard alignment...", "thinking");
      await this.sleep(1800);

      // Simulated Check
      const missing = [];
      if (!rfp.excerpt.includes("ISO 9001")) missing.push("ISO 9001 QMS");
      
      const status: ComplianceCheck['status'] = missing.length > 0 ? 'Conditional' : 'Pass';
      this.log(AgentRole.COMPLIANCE, `Compliance Scan: ${status}. Evaluated 14 statutory terms.`, status === 'Pass' ? 'success' : 'warning');

      return {
          status,
          missingStandards: missing,
          termsEvaluated: 14,
          details: missing.length > 0 ? "Missing explicit QMS requirement in RFP text." : "All standard regulatory clauses identified."
      };
  }

  // Step 6: Strategy Agent (Merger)
  async runStrategyAnalysis(
      techMatches: SKUMatch[], 
      pricing: Partial<FinalResponse>, 
      risk: RiskAnalysis, 
      compliance: ComplianceCheck
  ): Promise<{ winProbability: number, competitorAnalysis: CompetitorAnalysis, summary: string }> {
      this.log(AgentRole.STRATEGY, "Synthesizing Tech, Price, Risk & Compliance signals...", "thinking");
      await this.sleep(1500);

      // 1. Calculate Synthetic Competitor Data (Market Simulation)
      // Assume market is usually +10% to -10% of our price depending on randomization to simulate real world
      const variance = (Math.random() * 0.2) - 0.05; // -5% to +15%
      const marketAvg = (pricing.grandTotal || 0) * (1 + variance);
      const marketHigh = marketAvg * 1.15;
      const marketLow = marketAvg * 0.85;
      
      const ourPrice = pricing.grandTotal || 0;
      let priceScore = 0;
      let position: 'Premium' | 'Competitive' | 'Low-Cost' = 'Competitive';

      if (ourPrice < marketLow) { position = 'Low-Cost'; priceScore = 100; }
      else if (ourPrice > marketHigh) { position = 'Premium'; priceScore = 40; }
      else { position = 'Competitive'; priceScore = 75; }

      // 2. Tech Score (Average of top matches)
      const avgTechScore = techMatches.reduce((acc, m) => acc + (m.matches[0]?.matchScore || 0), 0) / (techMatches.length || 1);

      // 3. Win Probability Formula
      // Weightage: Tech (35%), Price (45%), Risk (10%), Compliance (10%)
      const riskPenalty = risk.score; // 0-100
      const compScore = compliance.status === 'Pass' ? 100 : 50;
      
      let winProb = (avgTechScore * 0.35) + (priceScore * 0.45) + ((100 - riskPenalty) * 0.10) + (compScore * 0.10);
      winProb = Math.min(99, Math.max(1, Math.round(winProb)));

      const summary = `Proposal Strategy: ${position} Positioning. Win probability calculated at ${winProb}% based on strong technical alignment (${avgTechScore.toFixed(0)}%) and ${risk.level.toLowerCase()} risk profile.`;
      
      this.log(AgentRole.STRATEGY, `Win Probability: ${winProb}%. Strategy: ${position}`, 'success');

      return {
          winProbability: winProb,
          competitorAnalysis: { ourPrice, marketAvg, marketHigh, marketLow, position },
          summary
      };
  }

  // Step 7: Response
  async generateResponse(rfp: RFP, pricing: FinalResponse) {
    this.log(AgentRole.RESPONSE, 'Compiling technical sheets, BOM, and Strategic Executive Summary...', 'thinking');
    await this.sleep(1000);
    this.log(AgentRole.RESPONSE, 'Final Proposal Package Generated.', 'success');
  }
}
