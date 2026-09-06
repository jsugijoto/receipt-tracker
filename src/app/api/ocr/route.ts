import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' },
        { status: 500 }
      );
    }

    // 2. Parse Request Body (Expects base64 image or data URL)
    const body = await request.json();
    const { imageBase64, mimeType = 'image/jpeg' } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image data is required.' }, { status: 400 });
    }

    // Strip data URL prefix if present (supports image/* and application/pdf)
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    // 3. Initialize Gemini Client
    const ai = new GoogleGenAI({ apiKey });

    // 4. Request Structured Extraction from Gemini Flash
    const prompt = `You are an expert receipt and invoice parsing assistant.
Analyze this receipt or invoice document (image or PDF) and extract:
1. The vendor/merchant name (clean and normalized, e.g. "Target", "Costco", "Shell").
2. The transaction date in strictly YYYY-MM-DD format. If year is ambiguous or missing, assume recent current year (2026).
3. The total amount paid as a positive floating number.
4. The sales tax amount as a floating number:
   - Carefully check for lines labeled "Tax", "Sales Tax", "HST", "GST", "VAT", "State Tax", etc.
   - If tax is explicitly listed, extract that exact number.
   - If not explicitly labeled, but the Total Amount is greater than the sum of the line items, calculate tax_amount as: Total Amount minus Items Subtotal.
   - If zero tax was charged, return 0.00.
5. The overarching primary spending category: "Groceries", "Dining", "Electronics", "Transportation", "Utilities", "Home & Hardware", "Healthcare", "Entertainment", or "Other".
6. An itemized list of all purchased products/services with description, quantity, unit price, total price, and item category.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor_name: { type: Type.STRING },
            transaction_date: { type: Type.STRING, description: 'YYYY-MM-DD' },
            total_amount: { type: Type.NUMBER },
            tax_amount: { type: Type.NUMBER, description: 'Sales tax, GST/HST, VAT, or calculated tax' },
            category: { type: Type.STRING },
            notes: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item_description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit_price: { type: Type.NUMBER },
                  total_price: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                },
                required: ['item_description', 'total_price'],
              },
            },
          },
          required: ['vendor_name', 'transaction_date', 'total_amount', 'tax_amount', 'category', 'items'],
        },
      },
    });

    const outputText = response.text?.trim() || '{}';
    const parsedData = JSON.parse(outputText);

    // If tax_amount is 0 or missing, but total_amount > sum(items), auto-calculate tax
    const itemsSum = Array.isArray(parsedData.items)
      ? parsedData.items.reduce((acc: number, it: any) => acc + (Number(it.total_price) || 0), 0)
      : 0;
    const total = Number(parsedData.total_amount) || 0;

    if (!parsedData.tax_amount || parsedData.tax_amount === 0) {
      const diff = Number((total - itemsSum).toFixed(2));
      // If difference is positive and plausible for sales tax (< 35% of total)
      if (diff > 0 && diff < total * 0.35) {
        parsedData.tax_amount = diff;
      } else {
        parsedData.tax_amount = 0.0;
      }
    } else {
      parsedData.tax_amount = Number(Number(parsedData.tax_amount).toFixed(2));
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Gemini OCR Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process receipt with Gemini OCR.' },
      { status: 500 }
    );
  }
}
