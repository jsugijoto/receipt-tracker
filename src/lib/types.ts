export interface ReceiptItem {
  id?: string;
  receipt_id?: string;
  item_description: string;
  quantity: number;
  unit_price?: number | null;
  total_price: number;
  category?: string;
}

export interface Receipt {
  id: string;
  user_id: string;
  vendor_name: string;
  transaction_date: string;
  total_amount: number;
  tax_amount?: number | null;
  category: string;
  image_url?: string | null;
  raw_ocr_json?: any;
  notes?: string | null;
  created_at: string;
  items?: ReceiptItem[];
}

export interface OCRParsedResult {
  vendor_name: string;
  transaction_date: string; // YYYY-MM-DD
  total_amount: number;
  tax_amount?: number;
  category: string;
  notes?: string;
  items: {
    item_description: string;
    quantity: number;
    unit_price?: number;
    total_price: number;
    category?: string;
  }[];
}
