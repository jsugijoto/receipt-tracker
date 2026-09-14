import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    const body = await request.json().catch(() => ({}));
    const { receiptIds, limit = 20, forceAll = false } = body;

    // 2. Query target receipts
    let query = supabase
      .from('receipts')
      .select('id, vendor_name, category, notes, raw_ocr_json')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (Array.isArray(receiptIds) && receiptIds.length > 0) {
      query = query.in('id', receiptIds);
    } else if (!forceAll) {
      // Find receipts whose raw_ocr_json has no ai_decoded key yet
      query = query.limit(limit);
    }

    const { data: receipts, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    // Filter to those that truly need decoding unless forceAll is specified
    const toProcess = forceAll
      ? receipts || []
      : (receipts || []).filter((r) => !r.raw_ocr_json?.ai_decoded);

    if (toProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All past receipts are already decoded with AI.',
        processedCount: 0,
        totalItemsUpdated: 0,
      });
    }

    // 3. For each receipt, fetch its items and run decoding
    const ai = new GoogleGenAI({ apiKey });
    let totalItemsUpdated = 0;
    const processedIds: string[] = [];

    // Process receipts sequentially to avoid rate limits and ensure clean updates
    for (const receipt of toProcess) {
      const { data: items, error: itemsErr } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id)
        .order('created_at', { ascending: true });

      if (itemsErr || !items || items.length === 0) {
        continue;
      }

      const prompt = `You are an expert retail POS (Point of Sale), grocery receipt, and SKU decoding specialist.
Receipts frequently print cryptic, truncated, or abbreviated register text (e.g. "KS ORG EVOO 2L", "AVO HASS 4CT", "TP ULTRA 30PK", "XYZ 123", "CHK BRST BNLS SKNLS", "BANANA 4011", "HDW HEX BLT 1/4").

Store / Vendor: "${receipt.vendor_name || 'Retail Store'}"
Category: "${receipt.category || 'General'}"

Items to decode:
${JSON.stringify(
  items.map((it) => ({
    original_description: it.item_description,
    quantity: it.quantity || 1,
    price: it.total_price || 0,
    category: it.category,
  })),
  null,
  2
)}

TASKS:
1. Decode each item into a clear, natural English name that a consumer would immediately understand:
   - Expand brand abbreviations (e.g. KS -> Kirkland Signature, GV -> Great Value, TJ -> Trader Joe's).
   - Expand food cuts, sizes, weights, and packaging (e.g. "BNLS SKNLS" -> "Boneless Skinless", "2L" -> "2 Liters", "4CT" -> "4-Pack").
   - If an item is an opaque POS SKU/code (e.g. "XYZ 123" or barcode), deduce what it likely represents in this store's context or label cleanly (e.g. "Store SKU Item #123").
   - Provide a brief "explanation" of acronyms.
   - Assign a clean "sub_category" (e.g. "Produce", "Pantry", "Household", "Snacks", "Meat", "Hardware").
   - Confidence: "high", "medium", or "low".

2. Provide an overarching "summary":
   - A friendly 1-2 sentence overview answering "What did I buy here?".

3. Provide "key_highlights":
   - 2 to 4 bullet highlight names of the main items.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                key_highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                decoded_items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original_description: { type: Type.STRING },
                      clarified_name: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      sub_category: { type: Type.STRING },
                      confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
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

        // Update items in database
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
                .eq('receipt_id', receipt.id);
              totalItemsUpdated++;
            }
          }
        }

        // Update receipt notes and raw_ocr_json
        const updatedNotes = receipt.notes
          ? receipt.notes.includes(decodedResult.summary)
            ? receipt.notes
            : `${receipt.notes}\n[AI Decoded]: ${decodedResult.summary}`
          : decodedResult.summary;

        const updatedRawOcr = {
          ...(receipt.raw_ocr_json || {}),
          ai_decoded: decodedResult,
        };

        await supabase
          .from('receipts')
          .update({
            notes: updatedNotes,
            raw_ocr_json: updatedRawOcr,
          })
          .eq('id', receipt.id)
          .eq('user_id', user.id);

        processedIds.push(receipt.id);
      } catch (geminiErr) {
        console.error(`Error decoding receipt ${receipt.id}:`, geminiErr);
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: processedIds.length,
      totalItemsUpdated,
      processedIds,
    });
  } catch (error: any) {
    console.error('Batch Decode Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to batch decode past receipts.' },
      { status: 500 }
    );
  }
}
