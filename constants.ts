
import { RFP, SKU, RFPStatus } from './types';

export const SAMPLE_SKUS: SKU[] = [
  {
    id: 'sku-101',
    modelName: 'Transformer X1000',
    manufacturer: 'VoltMaster',
    specs: { kVA: 1000, voltage: 11000, cooling: 'ONAN', efficiency: 99.5 },
    unitPrice: 15000,
    stockQty: 12,
    minStockThreshold: 5
  },
  {
    id: 'sku-102',
    modelName: 'Transformer X2000',
    manufacturer: 'VoltMaster',
    specs: { kVA: 2000, voltage: 33000, cooling: 'ONAF', efficiency: 99.2 },
    unitPrice: 28000,
    stockQty: 3,
    minStockThreshold: 4
  },
  {
    id: 'sku-201',
    modelName: 'EcoPower 500',
    manufacturer: 'GreenGrid',
    specs: { kVA: 500, voltage: 11000, cooling: 'ONAN', efficiency: 98.9 },
    unitPrice: 8500,
    stockQty: 45,
    minStockThreshold: 10
  },
  {
    id: 'sku-301',
    modelName: 'IndusT 1500',
    manufacturer: 'HeavyDuty Corp',
    specs: { kVA: 1500, voltage: 11000, cooling: 'ONAN', efficiency: 99.1 },
    unitPrice: 22000,
    stockQty: 1,
    minStockThreshold: 3
  }
];

export const INITIAL_RFPS: RFP[] = [
  {
    id: 'rfp-001',
    title: 'Supply of 11kV Distribution Transformers',
    client: 'City Power & Light',
    dueDate: '2024-05-15',
    url: 'https://citypower.gov/tenders/2024/rfp-001.pdf',
    excerpt: 'Request for proposal for supply, testing and commissioning of 50 units of 11kV/433V distribution transformers.',
    status: RFPStatus.DISCOVERED,
    products: [],
    tests: []
  },
  {
    id: 'rfp-002',
    title: 'Substation Upgrade Project - Phase 2',
    client: 'Metro Rail Corp',
    dueDate: '2024-06-01',
    url: 'https://metrorail.org/procurement/tender-772.pdf',
    excerpt: 'Turnkey upgrade of 33kV substations including switchgear and control panels.',
    status: RFPStatus.DISCOVERED,
    products: [],
    tests: []
  }
];

export const MOCK_PRODUCT_EXTRACTION = [
  {
    itemNo: '1.01',
    description: '1000 kVA Distribution Transformer, 11kV/433V',
    qty: 10,
    unit: 'Nos',
    params: { kVA: 1000, voltage: 11000, cooling: 'ONAN', efficiency: 99.0 }
  },
  {
    itemNo: '1.02',
    description: '500 kVA Distribution Transformer',
    qty: 5,
    unit: 'Nos',
    params: { kVA: 500, voltage: 11000, cooling: 'ONAN', efficiency: 98.5 }
  }
];

export const MOCK_TEST_EXTRACTION = [
  {
    id: 't-1',
    testName: 'Temperature Rise Test',
    scope: 'IEC 60076-2',
    perUnit: false,
    perLot: true,
    remarks: 'Type test to be conducted on one unit from the lot.'
  },
  {
    id: 't-2',
    testName: 'Dielectric Routine Tests',
    scope: 'IEC 60076-3',
    perUnit: true,
    perLot: false,
    remarks: 'Routine test on all units.'
  }
];
