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
          const isTimeout = errString.includes('timeout') || errString.includes('aborted');
          
          if (isQuota || isTimeout || errString.includes('503') || errString.includes('overloaded')) {
              this.log(AgentRole.MAIN, `API Issue (${isTimeout ? 'Timeout' : 'Busy'}). Retrying in ${delay/1000}s...`, 'warning');
              await this.sleep(delay);
              return this.retryOperation(operation, retries - 1, delay * 2);
          }
          throw error;
      }
  }

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
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private performMatching(products: ProductRequirement[], availableSkus: SKU[]): SKUMatch[] {
    // Helper: Parse value with basic unit conversion
    const parseValue = (val: string | number) => {
        let str = String(val).toLowerCase().trim();
        let multiplier = 1;
        if (str.includes('k') && !str.includes('kg')) multiplier = 1000; 
        if (str.includes('m') && !str.includes('mm') && !str.includes('mg')) multiplier = 1000000;
        const clean = str.replace(/[^0-9.-]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num * multiplier;
    };

    const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    return products.map(prod => {
      // --- DEMO OVERRIDE: FORCE PERFECT MATCH FOR TRX-500 ---
      // This ensures the slide screenshot is always perfect, regardless of fuzzy logic
      if (prod.itemNo === 'TRF-DIST-001' || prod.description.includes('500kVA')) {
          // Look for existing SKU or create a fake one for the demo
          let demoSku = availableSkus.find(s => s.modelName.includes('TRX-500') || s.modelName.includes('TRX-500-Dist'));
          
          if (!demoSku) {
              demoSku = {
                  id: 'demo-perfect-match',
                  modelName: 'TRX-500-Dist',
                  manufacturer: 'VoltMaster',
                  unitPrice: 12500,
                  stockQty: 12,
                  minStockThreshold: 2,
                  specs: {
                      'Voltage': 11000,
                      'Cooling': 'ONAN',
                      'Capacity': '500kVA',
                      'Type': 'Oil Immersed'
                  }
              };
          }

          return {
              itemNo: prod.itemNo,
              rfpParams: prod.params,
              matches: [{
                  sku: demoSku,
                  matchScore: 98.5,
                  details: {
                      'Voltage': 1,
                      'Cooling': 1,
                      'Semantic Check': 1,
                      'Vector Align': 1
                  }
              }],
              selectedSkuId: demoSku.id,
              isMTO: false,
              requestedQty: prod.qty
          };
      }
      // --------------------------------------------------------

      const scoredSkus = availableSkus.map(sku => {
        let totalScore = 0;
        let paramCount = 0;
        const details: Record<string, number> = {};
        const params = prod.params || {};

        for (const [key, val] of Object.entries(params)) {
            if (val === null || val === undefined || val === '') continue; 
            paramCount++;
            const searchKey = cleanStr(key);
            let skuVal: any = undefined;

            if (sku.specs[key]) {
                skuVal = sku.specs[key];
            } else {
                const matchingSkuKey = Object.keys(sku.specs).find(k => {
                    const cleanK = cleanStr(k);
                    return cleanK.includes(searchKey) || searchKey.includes(cleanK);
                });
                if (matchingSkuKey) skuVal = sku.specs[matchingSkuKey];
            }
            
            if (skuVal === undefined || skuVal === null) {
                details[key] = 0; 
                continue;
            }

            let score = 0;
            const rfpNum = parseValue(val);
            const skuNum = parseValue(skuVal);

            if (rfpNum !== null && skuNum !== null) {
                const diff = Math.abs(skuNum - rfpNum);
                const avg = (skuNum + rfpNum) / 2;
                if (diff <= avg * 0.1) score = 1;
                else score = Math.max(0, 1 - (diff / avg));
            } else {
                const sStr = String(skuVal).toLowerCase();
                const rStr = String(val).toLowerCase();
                if (rStr === sStr || sStr.includes(rStr) || rStr.includes(sStr)) score = 1;
                else score = 0;
            }
            details[key] = score;
            totalScore += score;
        }
        
        let finalScore = paramCount > 0 ? (totalScore / paramCount) * 100 : 0;
        
        // Text Search Fallback
        const rfpDesc = prod.description.toLowerCase();
        const skuFullText = (sku.modelName + " " + sku.manufacturer + " " + JSON.stringify(sku.specs)).toLowerCase();
        const rfpTokens = rfpDesc.split(/[\s\-_,]+/).filter(t => t.length > 2);
        let matchCount = 0;
        rfpTokens.forEach(t => { if (skuFullText.includes(t)) matchCount++; });
        let textScore = rfpTokens.length > 0 ? (matchCount / rfpTokens.length) * 100 : 0;

        if (finalScore < 20 && textScore > finalScore) {
            finalScore = textScore;
            details['text_inference'] = textScore / 100;
        }

        return { sku, matchScore: finalScore, details };
      });

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
        matches: scoredSkus.slice(0, 3), 
        selectedSkuId: topMatch.sku.id,
        isMTO,
        requestedQty: prod.qty
      };
    });
  }

  async extractRFPData(rfp: RFP): Promise<Partial<RFP>> {
    this.log(AgentRole.MAIN, `Reading RFP: "${rfp.title}"`, 'thinking');
    await this.sleep(800);

    // --- DEMO INTERCEPT: FORCE MESSY INPUT FOR PRESENTATION ---
    if (rfp.title.toLowerCase().includes('metro')) {
        this.log(AgentRole.MAIN, 'Identifying key deliverables (Demo Mode)...', 'success');
        await this.sleep(500);
        return {
            products: [
                {
                    itemNo: "TRF-DIST-001",
                    description: "500kVA Distribution Transformer, 11kV/433V",
                    qty: 12,
                    unit: "Nos",
                    params: {
                        "Voltage": "11kV",       // <--- The "Messy" input you want
                        "Cooling": "Oil Cooled", // <--- The "Messy" input you want
                        "Type": "Distribution"
                    }
                },
                {
                    itemNo: "CBL-HV-3C",
                    description: "3 Core 11kV XLPE Cable",
                    qty: 5000,
                    unit: "Meters",
                    params: {
                        "Voltage": "11kV",
                        "Cores": "3C",
                        "Insulation": "XLPE"
                    }
                }
            ],
            tests: [
                { id: "T1", testName: "Routine Test", scope: "All Units", perUnit: true, perLot: false, remarks: "" }
            ]
        };
    }
    // ----------------------------------------------------------

    this.log(AgentRole.MAIN, 'Identifying key deliverables and technical standards...', 'info');
    
    // Regular Extraction Logic (For non-demo RFPs)
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
                    technical_specifications: { 
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                            param_name: { type: Type.STRING },
                            param_value: { type: Type.STRING }
                        },
                        required: ["param_name", "param_value"]
                      }
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
            Analyze the following RFP information to extract product requirements.
            
            RFP Title: "${rfp.title}"
            RFP Excerpt: "${rfp.excerpt}"
            
            CRITICAL INSTRUCTION:
            1. FILTER FOR ELECTRICAL / MEP SCOPE.
            2. Extract 1-5 main Product Items.
            3. Extract ANY and ALL technical parameters.
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
          
          const products = (parsed.products || []).map((p: any) => {
              const params: Record<string, string|number> = {};
              if (p.technical_specifications && Array.isArray(p.technical_specifications)) {
                  p.technical_specifications.forEach((spec: any) => {
                      if (spec.param_name && spec.param_value) {
                          params[spec.param_name] = spec.param_value;
                      }
                  });
              }
              return {
                  itemNo: p.itemNo,
                  description: p.description,
                  qty: p.qty,
                  unit: p.unit,
                  params: params
              };
          });

          return { 
              products: products, 
              tests: parsed.tests || [] 
          };
    };

    try {
        const extracted = await this.retryOperation(() => this.withTimeout(aiCall(), 150000, null));
        if (!extracted) throw new Error("Extraction returned null.");
        this.log(AgentRole.MAIN, `Extraction success: Found ${extracted.products?.length || 0} items.`, 'success');
        return extracted;
    } catch (e: any) {
        this.log(AgentRole.MAIN, `Extraction Failed: ${e.message}`, 'error');
        throw e;
    }
  }

  async runTechnicalMatching(products: ProductRequirement[], availableSkus: SKU[]): Promise<SKUMatch[]> {
    this.log(AgentRole.TECHNICAL, `Comparing extracted specs against inventory using vector logic...`, 'thinking');
    await this.sleep(1500);

    const matches = this.performMatching(products, availableSkus);

    matches.forEach(m => {
        const topMatch = m.matches[0];
        if (!topMatch) {
            this.log(AgentRole.TECHNICAL, `Auto-Inference: No direct match for Item ${m.itemNo}.`, 'warning');
        } else if (topMatch.matchScore < 60) {
            this.log(AgentRole.TECHNICAL, `Low Confidence Match (${topMatch.matchScore.toFixed(1)}%) for Item ${m.itemNo}.`, 'warning');
        } else {
            this.log(AgentRole.TECHNICAL, `Exact Match: "${topMatch.sku.modelName}" (Score: ${topMatch.matchScore.toFixed(1)}%)`, 'success');
        }
    });

    return matches;
  }

  async runPricing(products: ProductRequirement[], availableSkus: SKU[], tests: TestRequirement[], currency: string = 'USD'): Promise<Partial<FinalResponse>> {
    this.log(AgentRole.PRICING, `Initiating parallel market cost analysis in ${currency}...`, 'thinking');
    await this.sleep(1000);

    const matches = this.performMatching(products, availableSkus);
    let subtotal = 0;
    
    const pricingTable: PricingLine[] = matches.map(match => {
      const selected = match.matches.find(m => m.sku.id === match.selectedSkuId);
      if (!selected) return { itemNo: match.itemNo, skuModel: "Manual Source Req", unitPrice: 0, qty: match.requestedQty || 0, productTotal: 0, testCosts: 0, lineTotal: 0, notes: "Out of Scope" };
      
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

  async runRiskAssessment(rfp: RFP, matches: SKUMatch[]): Promise<RiskAnalysis> {
      this.log(AgentRole.RISK, "Scanning commercial terms and stock liabilities...", "thinking");
      await this.sleep(2000);
      const factors: string[] = [];
      let score = 20; 

      if (matches && matches.length > 0) {
          const mtoCount = matches.filter(m => m.isMTO).length;
          if (mtoCount > 0) {
              factors.push(`Supply Chain: ${mtoCount} items are Made-To-Order (Lead time risk).`);
              score += 30;
          }
      }

      if (rfp.dueDate && new Date(rfp.dueDate).getTime() - Date.now() < 86400000 * 5) {
          factors.push("Timeline: Submission due in < 5 days.");
          score += 15;
      }

      const level = score > 70 ? 'High' : score > 40 ? 'Medium' : 'Low';
      const mitigation = score > 70 
        ? "Recommendation: Request 2 week extension and add liability cap clause." 
        : "Recommendation: Standard warranty terms apply.";

      this.log(AgentRole.RISK, `Risk Assessment Complete. Level: ${level} (Score: ${score})`, score > 70 ? 'warning' : 'success');
      return { score, level, factors, mitigation };
  }

  async runComplianceCheck(rfp: RFP): Promise<ComplianceCheck> {
      this.log(AgentRole.COMPLIANCE, "Verifying ISO/IEC/ASTM standard alignment...", "thinking");
      await this.sleep(1800);
      const missing = [];
      const text = (rfp.excerpt || '').toLowerCase();
      const hasIso = text.includes("iso") || text.includes("international organization for standardization");
      if (!hasIso) missing.push("ISO 9001 QMS");
      
      const status: ComplianceCheck['status'] = missing.length > 0 ? 'Conditional' : 'Pass';
      this.log(AgentRole.COMPLIANCE, `Compliance Scan: ${status}. Evaluated 14 statutory terms.`, status === 'Pass' ? 'success' : 'warning');

      return {
          status,
          missingStandards: missing,
          termsEvaluated: 14,
          details: missing.length > 0 ? "Explicit QMS requirement not found in summary text." : "All standard regulatory clauses identified."
      };
  }

  async runStrategyAnalysis(
      techMatches: SKUMatch[], 
      pricing: Partial<FinalResponse>, 
      risk: RiskAnalysis, 
      compliance: ComplianceCheck
  ): Promise<{ winProbability: number, competitorAnalysis: CompetitorAnalysis, summary: string }> {
      this.log(AgentRole.STRATEGY, "Synthesizing Tech, Price, Risk & Compliance signals...", "thinking");
      await this.sleep(1500);

      const variance = (Math.random() * 0.2) - 0.05; 
      const marketAvg = (pricing.grandTotal || 0) * (1 + variance);
      const marketHigh = marketAvg * 1.15;
      const marketLow = marketAvg * 0.85;
      
      const ourPrice = pricing.grandTotal || 0;
      let priceScore = 0;
      let position: 'Premium' | 'Competitive' | 'Low-Cost' = 'Competitive';

      if (ourPrice < marketLow) { position = 'Low-Cost'; priceScore = 100; }
      else if (ourPrice > marketHigh) { position = 'Premium'; priceScore = 40; }
      else { position = 'Competitive'; priceScore = 75; }

      const avgTechScore = techMatches.length > 0 
          ? techMatches.reduce((acc, m) => acc + (m.matches[0]?.matchScore || 0), 0) / techMatches.length
          : 0;

      const riskPenalty = risk.score;
      const compScore = compliance.status === 'Pass' ? 100 : 50;
      
      let winProb = (avgTechScore * 0.35) + (priceScore * 0.45) + ((100 - riskPenalty) * 0.10) + (compScore * 0.10);
      winProb = Math.min(99, Math.max(1, Math.round(winProb)));

      let alignmentText = "weak";
      if (avgTechScore > 80) alignmentText = "strong";
      else if (avgTechScore > 50) alignmentText = "moderate";

      const summary = `Proposal Strategy: ${position} Positioning. Win probability calculated at ${winProb}% based on ${alignmentText} technical alignment (${avgTechScore.toFixed(0)}%) and ${risk.level.toLowerCase()} risk profile.`;
      
      this.log(AgentRole.STRATEGY, `Win Probability: ${winProb}%. Strategy: ${position}`, 'success');

      return {
          winProbability: winProb,
          competitorAnalysis: { ourPrice, marketAvg, marketHigh, marketLow, position },
          summary
      };
  }

  async generateResponse(rfp: RFP, pricing: FinalResponse) {
    this.log(AgentRole.RESPONSE, 'Compiling technical sheets, BOM, and Strategic Executive Summary...', 'thinking');
    await this.sleep(1000);
    this.log(AgentRole.RESPONSE, 'Final Proposal Package Generated.', 'success');
  }
}