
export enum AgentRole {
  SALES = 'Sales Agent',
  MAIN = 'Main Agent',
  TECHNICAL = 'Technical Agent',
  PRICING = 'Pricing Agent',
  RESPONSE = 'Response Agent',
}

export enum RFPStatus {
  DISCOVERED = 'Discovered',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
}

export interface User {
  name: string;
  email: string;
  role: string;
}

export interface RFP {
  id: string;
  title: string;
  client: string;
  dueDate: string;
  url: string;
  excerpt: string;
  status: RFPStatus;
  products: ProductRequirement[];
  tests: TestRequirement[];
  finalResponse?: FinalResponse;
}

export interface ProductRequirement {
  itemNo: string;
  description: string;
  qty: number;
  unit: string;
  params: Record<string, string | number>;
}

export interface TestRequirement {
  id: string;
  testName: string;
  scope: string;
  perUnit: boolean;
  perLot: boolean;
  remarks: string;
}

export interface SKU {
  id: string;
  modelName: string;
  manufacturer: string;
  specs: Record<string, string | number>;
  unitPrice: number;
  stockQty: number;
  minStockThreshold: number;
}

export interface SKUMatch {
  itemNo: string;
  rfpParams: Record<string, string | number>;
  matches: {
    sku: SKU;
    matchScore: number;
    details: Record<string, number>; // param -> score
  }[];
  selectedSkuId: string;
  isMTO?: boolean;
  requestedQty?: number;
}

export interface PricingLine {
  itemNo: string;
  skuModel: string;
  unitPrice: number;
  qty: number;
  productTotal: number;
  testCosts: number;
  lineTotal: number;
  notes: string;
}

export interface FinalResponse {
  pricingTable: PricingLine[];
  subtotal: number;
  logistics: number;
  contingency: number;
  taxes: number;
  grandTotal: number;
  generatedAt: string;
  currency: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  agent: AgentRole;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'thinking';
  metadata?: any;
}
