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

    // 2. Parse Request Body
    const body = await request.json();
    const { receiptId, vendor_name, category, items, saveToDatabase = false } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required to decode.' },
        { status: 400 }
      );
    }

    // 3. Initialize Gemini
    const ai = new GoogleGenAI({ apiKey });

    // 4. Craft Prompt for decoding cryptic POS receipt items
    const prompt = `You are an expert retail POS (Point of Sale), grocery receipt, and SKU decoding specialist.
Receipts frequently print cryptic, truncated, or abbreviated register text (e.g. "KS ORG EVOO 2L", "AVO HASS 4CT", "TP ULTRA 30PK", "XYZ 123", "CHK BRST BNLS SKNLS", "BANANA 4011", "04122029384", "HDW HEX BLT 1/4", "MCD DBL CHSBRG").

Store / Vendor: "${vendor_name || 'Retail Store'}"
Primary Category: "${category || 'General'}"

Items to decode:
${JSON.stringify(
  items.map((it: any) => ({
    original_description: it.item_description || it.description || 'Unknown item',
    quantity: it.quantity || 1,
    price: it.total_price || it.price || 0,
    category: it.category,
  })),
  null,
  2
)}

TASKS:
1. Decode each item into a clear, natural English name that a consumer would immediately understand:
   - Expand brand abbreviations (e.g., KS -> Kirkland Signature, GV -> Great Value, TJ -> Trader Joe's, 365 -> Whole Foods 365).
   - Expand food cuts, sizes, weights, and packaging (e.g., "BNLS SKNLS" -> "Boneless Skinless", "2L" -> "2 Liters", "4CT" -> "4-Pack", "HEX BLT" -> "Hex Bolt").
   - If an item is an opaque POS SKU/code (e.g. "XYZ 123", barcode, or random number), use the store context, price, and other items to deduce what it most likely is (e.g. "Hardware Fasteners / Store Item #123" or "Store SKU Item #123"). Do NOT just repeat the raw cryptic code.
   - Provide a brief "explanation" of any acronyms or decoded codes.
   - Assign a clean "sub_category" (e.g. "Cooking & Baking", "Produce", "Snacks & Drinks", "Meat & Poultry", "Dairy & Eggs", "Household & Cleaning", "Hardware & Tools", "Automotive", "Personal Care").
   - Mark confidence as "high", "medium", or "low".

2. Provide an overarching "summary":
   - Write a friendly 1-2 sentence overview answering "What did I buy here?" (e.g., "You purchased grocery cooking staples and fresh produce including organic olive oil and avocados at Costco.").

3. Provide "key_highlights":
   - 2 to 4 concise bullet points summarizing the main items bought.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'A friendly 1-2 sentence overview of what was bought on this receipt',
            },
            key_highlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 4 bullet highlight names of the main items bought',
            },
            decoded_items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original_description: { type: Type.STRING },
                  clarified_name: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  sub_category: { type: Type.STRING },
                  confidence: {
                    type: Type.STRING,
                    enum: ['high', 'medium', 'low'],
                  },
                },
                required: ['original_description', 'clarified_name'],
              },
            },
          },
          required: ['summary', 'decoded_items'],
        },
      },
    });

    const outputText = response.text?.trim() || '{}';
    const decodedResult = JSON.parse(outputText);

    // 5. If saveToDatabase requested and receiptId provided, persist to Supabase
    if (saveToDatabase && receiptId) {
      // Verify receipt ownership
      const { data: receiptRecord } = await supabase
        .from('receipts')
        .select('id, raw_ocr_json, notes')
        .eq('id', receiptId)
        .eq('user_id', user.id)
        .single();

      if (receiptRecord) {
        // Update line items in receipt_items table
        if (Array.isArray(decodedResult.decoded_items)) {
          for (let i = 0; i < decodedResult.decoded_items.length; i++) {
            const dec = decodedResult.decoded_items[i];
            const originalItem = items[i];

            if (originalItem?.id) {
              await supabase
                .from('receipt_items')
                .update({
                  item_description: dec.clarified_name || originalItem.item_description,
                  category: dec.sub_category || originalItem.category,
                })
                .eq('id', originalItem.id)
                .eq('receipt_id', receiptId);
            }
          }
        }

        // Update receipt notes/metadata with AI purchase summary
        const updatedNotes = receiptRecord.notes
          ? `${receiptRecord.notes}\n[AI Decoded]: ${decodedResult.summary}`
          : decodedResult.summary;

        const updatedRawOcr = {
          ...(receiptRecord.raw_ocr_json || {}),
          ai_decoded: decodedResult,
        };

        await supabase
          .from('receipts')
          .update({
            notes: updatedNotes,
            raw_ocr_json: updatedRawOcr,
          })
          .eq('id', receiptId)
          .eq('user_id', user.id);
      }
    }

    return NextResponse.json({
      success: true,
      data: decodedResult,
    });
  } catch (error: any) {
    console.error('AI Decode Items Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to decode receipt items with AI.' },
      { status: 500 }
    );
  }
}
