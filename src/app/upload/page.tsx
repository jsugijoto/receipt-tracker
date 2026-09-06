'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';
import { OCRParsedResult } from '@/lib/types';
import {
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ArrowRight,
  Plus,
  Calendar,
  Building,
  DollarSign,
  Tag,
  FileText,
} from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);

  // Processing state
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted Result (Editable by user before saving)
  const [parsedData, setParsedData] = useState<OCRParsedResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Handle file selection (from camera or file picker)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setParsedData(null);
    setOriginalSize(file.size);

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    try {
      if (isPdf) {
        setProcessingStage('Reading PDF receipt with Gemini Flash AI...');
        setSelectedFile(file);
        setCompressedSize(file.size);
        setImagePreviewUrl(null);
        await processFileWithOCR(file, 'application/pdf');
      } else {
        setProcessingStage('Compressing image for fast upload...');

        // Auto-compress image in browser (reduces 4-8 MB camera photo down to ~150-250 KB)
        const options = {
          maxSizeMB: 0.35, // Target max size 350 KB
          maxWidthOrHeight: 1600, // Perfect crisp resolution for Gemini OCR
          useWebWorker: true,
          fileType: 'image/jpeg',
        };

        const compressed = await imageCompression(file, options);
        setCompressedSize(compressed.size);
        setSelectedFile(compressed);

        // Create preview
        const previewUrl = URL.createObjectURL(compressed);
        setImagePreviewUrl(previewUrl);

        // Trigger OCR automatically
        await processFileWithOCR(compressed, compressed.type || 'image/jpeg');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Failed to process file: ' + err.message);
      setProcessingStage(null);
    }
  };

  // Run Gemini Flash OCR (Images and PDFs)
  const processFileWithOCR = async (file: File, mimeType: string) => {
    try {
      setProcessingStage('Analyzing document with Gemini Flash AI...');

      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call Next.js /api/ocr route
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: mimeType || file.type || 'image/jpeg',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(result.error || 'Failed to extract receipt data.');
      }

      setParsedData(result.data);
      setProcessingStage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'OCR processing failed.');
      setProcessingStage(null);
    }
  };

  // Helper to update item fields and auto-recalculate totals
  const updateItemField = (
    index: number,
    field: 'item_description' | 'quantity' | 'total_price',
    value: string
  ) => {
    if (!parsedData) return;
    const newItems = [...parsedData.items];
    const item = { ...newItems[index] };

    if (field === 'quantity') {
      const qty = parseFloat(value) || 1;
      const unit = item.unit_price || (item.total_price && item.quantity ? item.total_price / item.quantity : 0);
      item.quantity = qty;
      if (unit > 0) {
        item.unit_price = unit;
        item.total_price = Number((qty * unit).toFixed(2));
      }
    } else if (field === 'total_price') {
      const total = parseFloat(value) || 0;
      item.total_price = total;
      if (item.quantity > 0) {
        item.unit_price = Number((total / item.quantity).toFixed(2));
      }
    } else {
      item.item_description = value;
    }

    newItems[index] = item;

    // Recalculate receipt total (sum of items + tax)
    const newItemsSum = newItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
    const tax = Number(parsedData.tax_amount) || 0;

    setParsedData({
      ...parsedData,
      items: newItems,
      total_amount: Number((newItemsSum + tax).toFixed(2)),
    });
  };

  const addItem = () => {
    if (!parsedData) return;
    const newItems = [
      ...parsedData.items,
      { item_description: 'New Item', quantity: 1, total_price: 0 },
    ];
    setParsedData({ ...parsedData, items: newItems });
  };

  const removeItem = (index: number) => {
    if (!parsedData) return;
    const newItems = parsedData.items.filter((_, i) => i !== index);
    const newItemsSum = newItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
    const tax = Number(parsedData.tax_amount) || 0;
    setParsedData({
      ...parsedData,
      items: newItems,
      total_amount: Number((newItemsSum + tax).toFixed(2)),
    });
  };

  // Save parsed receipt and line items to Supabase
  const handleSaveReceipt = async () => {
    if (!parsedData || !selectedFile) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
      const fileExt = isPdf ? 'pdf' : 'jpg';

      // 1. Upload compressed image or PDF to Supabase Storage: receipts/{userId}/{timestamp}_receipt.{ext}
      const fileName = `${user.id}/${Date.now()}_receipt.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, selectedFile, {
          contentType: isPdf ? 'application/pdf' : (selectedFile.type || 'image/jpeg'),
          upsert: false,
        });

      if (uploadError) {
        console.warn('Image upload error:', uploadError.message);
        // Continue even if image bucket fails, but record error if needed
      }

      // 2. Insert into receipts table
      const { data: receiptRow, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          vendor_name: parsedData.vendor_name || 'Unknown Vendor',
          transaction_date: parsedData.transaction_date || new Date().toISOString().split('T')[0],
          total_amount: Number(parsedData.total_amount) || 0,
          tax_amount: Number(parsedData.tax_amount) || 0,
          category: parsedData.category || 'General',
          notes: parsedData.notes || null,
          image_url: fileName,
          raw_ocr_json: parsedData,
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      // 3. Insert line items if any were extracted
      if (parsedData.items && parsedData.items.length > 0) {
        const lineItemsPayload = parsedData.items.map((item) => ({
          receipt_id: receiptRow.id,
          item_description: item.item_description,
          quantity: Number(item.quantity) || 1,
          unit_price: item.unit_price ? Number(item.unit_price) : null,
          total_price: Number(item.total_price) || 0,
          category: item.category || parsedData.category,
        }));

        const { error: itemsError } = await supabase
          .from('receipt_items')
          .insert(lineItemsPayload);

        if (itemsError) throw itemsError;
      }

      // Redirect back to dashboard
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save receipt to database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Snap & Process Receipt</h1>
        <p className="text-sm text-slate-500 mt-1">
          Take a photo or upload an image. Gemini Flash will extract the items, vendor, and total instantly.
        </p>
      </div>

      {/* Native File Inputs (using sr-only so mobile Safari and Android can trigger them reliably) */}
      <input
        id="receipt-camera-input"
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="sr-only"
      />
      <input
        id="receipt-file-input"
        type="file"
        onChange={handleFileChange}
        accept="image/*,application/pdf,.pdf"
        className="sr-only"
      />

      {/* Upload / Camera Box */}
      {!parsedData && !processingStage && (
        <div className="p-6 sm:p-12 bg-white rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
          <label
            htmlFor="receipt-file-input"
            className="cursor-pointer block group"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition shadow-inner">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Take Photo or Upload Receipt / PDF</h3>
            <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
              Supports photos (JPEG, PNG) and PDF documents. Gemini Flash extracts the items and total in ~1s.
            </p>
          </label>

          {/* Dual Action Buttons for Mobile */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <label
              htmlFor="receipt-camera-input"
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md transition active:scale-95"
            >
              <Camera className="w-4 h-4" />
              <span>Take Photo (Camera)</span>
            </label>

            <label
              htmlFor="receipt-file-input"
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl border border-slate-200 transition active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>Photo Library / PDF</span>
            </label>
          </div>
        </div>
      )}

      {/* Processing Animation */}
      {processingStage && (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 shadow-sm text-center">
          <div className="relative inline-flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <Loader2 className="w-20 h-20 text-emerald-500 animate-spin absolute -inset-2" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">{processingStage}</h3>
          <p className="text-xs text-slate-500">Gemini 2.5 Flash is reading itemized lines and totals...</p>

          {originalSize && compressedSize && (
            <div className="mt-6 inline-block px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-600 font-medium">
              Compressed {(originalSize / 1024 / 1024).toFixed(1)} MB ➔{' '}
              {(compressedSize / 1024).toFixed(0)} KB (
              {Math.round((1 - compressedSize / originalSize) * 100)}% saved)
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error Processing Receipt</p>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Parsed Result & Review Screen */}
      {parsedData && (
        <div className="space-y-6 animate-fade-in">
          {/* Success Banner */}
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold">Extraction Complete!</p>
                <p className="text-xs text-emerald-600">Review and tweak the parsed details below before saving.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setParsedData(null);
                setSelectedFile(null);
                setImagePreviewUrl(null);
              }}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              Re-scan
            </button>
          </div>

          {/* Receipt File Preview (Image or PDF) */}
          {selectedFile && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center gap-4">
              {imagePreviewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imagePreviewUrl}
                  alt="Receipt Preview"
                  className="w-16 h-20 object-cover rounded-lg border border-slate-200 shadow-sm"
                />
              ) : (
                <div className="w-16 h-20 rounded-lg bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 shadow-sm flex-shrink-0">
                  <FileText className="w-8 h-8" />
                  <span className="text-[10px] font-bold mt-1">PDF</span>
                </div>
              )}
              <div className="text-xs text-slate-500 space-y-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">
                  {selectedFile.name || 'Receipt Document'}
                </p>
                {originalSize && compressedSize && (
                  <p>
                    {selectedFile.type === 'application/pdf'
                      ? `${(originalSize / 1024).toFixed(0)} KB PDF document`
                      : `${(originalSize / 1024 / 1024).toFixed(1)} MB ➔ ${(compressedSize / 1024).toFixed(0)} KB (${Math.round((1 - compressedSize / originalSize) * 100)}% smaller)`}
                  </p>
                )}
                <p className="text-emerald-600 font-medium">Ready for cloud storage</p>
              </div>
            </div>
          )}

          {/* Primary Receipt Fields */}
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              Receipt Overview
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Vendor / Store
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={parsedData.vendor_name}
                    onChange={(e) =>
                      setParsedData({ ...parsedData, vendor_name: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Transaction Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="date"
                    value={parsedData.transaction_date}
                    onChange={(e) =>
                      setParsedData({ ...parsedData, transaction_date: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Total Amount ($)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={parsedData.total_amount}
                    onChange={(e) =>
                      setParsedData({
                        ...parsedData,
                        total_amount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm font-bold text-emerald-600 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Tax Amount ($)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={parsedData.tax_amount ?? ''}
                    onChange={(e) => {
                      const newTax = parseFloat(e.target.value) || 0;
                      const itemsSubtotal = parsedData.items.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
                      setParsedData({
                        ...parsedData,
                        tax_amount: newTax,
                        total_amount: Number((itemsSubtotal + newTax).toFixed(2)),
                      });
                    }}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Category
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select
                    value={parsedData.category}
                    onChange={(e) =>
                      setParsedData({ ...parsedData, category: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Dining">Dining / Food</option>
                    <option value="Transportation">Transportation / Gas</option>
                    <option value="Home & Hardware">Home & Hardware</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Utilities">Utilities</option>
                    <option value="General">General / Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table & Editor */}
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Itemized Lines ({parsedData.items.length})
              </h3>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <div className="space-y-2">
              {parsedData.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <input
                    type="text"
                    value={item.item_description}
                    onChange={(e) => updateItemField(index, 'item_description', e.target.value)}
                    placeholder="Description"
                    className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium focus:outline-none"
                  />

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-slate-400">Qty</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItemField(index, 'quantity', e.target.value)}
                      className="w-12 px-1.5 py-1 text-xs text-center bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.total_price}
                      onChange={(e) => updateItemField(index, 'total_price', e.target.value)}
                      className="w-20 px-1.5 py-1 text-xs text-right font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Live Subtotal & Sync Total Row */}
            <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">
                  Items Subtotal:
                </span>
                <span className="font-bold text-slate-900 text-base">
                  ${parsedData.items.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0).toFixed(2)}
                </span>
                {parsedData.tax_amount ? (
                  <span className="text-xs text-slate-400">
                    (+ ${Number(parsedData.tax_amount).toFixed(2)} tax)
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  const subtotal = parsedData.items.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
                  const tax = Number(parsedData.tax_amount) || 0;
                  setParsedData({
                    ...parsedData,
                    total_amount: Number((subtotal + tax).toFixed(2)),
                  });
                }}
                className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-200 transition"
              >
                Sync Total to Items ($
                {(
                  parsedData.items.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0) +
                  (Number(parsedData.tax_amount) || 0)
                ).toFixed(2)}
                )
              </button>
            </div>
          </div>

          {/* Confirm & Save Button */}
          <button
            type="button"
            onClick={handleSaveReceipt}
            disabled={isSaving}
            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-base disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving to Database...</span>
              </>
            ) : (
              <>
                <span>Confirm & Save Receipt</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
