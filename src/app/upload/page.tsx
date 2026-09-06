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

    try {
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
      await processImageWithOCR(compressed);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Failed to process image: ' + err.message);
      setProcessingStage(null);
    }
  };

  // Run Gemini Flash OCR
  const processImageWithOCR = async (file: File) => {
    try {
      setProcessingStage('Analyzing receipt with Gemini Flash AI...');

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
          mimeType: file.type || 'image/jpeg',
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

      // 1. Upload compressed image to Supabase Storage: receipts/{userId}/{timestamp}.jpg
      const fileName = `${user.id}/${Date.now()}_receipt.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, selectedFile, {
          contentType: selectedFile.type || 'image/jpeg',
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
        accept="image/*"
        className="sr-only"
      />

      {/* Upload / Camera Box */}
      {!parsedData && !processingStage && (
        <div className="p-6 sm:p-12 bg-white rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
          <label
            htmlFor="receipt-camera-input"
            className="cursor-pointer block group"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition shadow-inner">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Take Photo or Upload Receipt</h3>
            <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
              Auto-compressed in browser. Gemini Flash extracts the items and total in ~1s.
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
              <span>Photo Library / Files</span>
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

          {/* Receipt Image Thumbnail & Compression Stats */}
          {imagePreviewUrl && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Receipt Preview"
                className="w-16 h-20 object-cover rounded-lg border border-slate-200 shadow-sm"
              />
              <div className="text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-800">Receipt Photo Optimized</p>
                {originalSize && compressedSize && (
                  <p>
                    {(originalSize / 1024 / 1024).toFixed(1)} MB ➔{' '}
                    {(compressedSize / 1024).toFixed(0)} KB (
                    {Math.round((1 - compressedSize / originalSize) * 100)}% smaller)
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
                onClick={() =>
                  setParsedData({
                    ...parsedData,
                    items: [
                      ...parsedData.items,
                      { item_description: 'New Item', quantity: 1, total_price: 0 },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
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
                    onChange={(e) => {
                      const newItems = [...parsedData.items];
                      newItems[index].item_description = e.target.value;
                      setParsedData({ ...parsedData, items: newItems });
                    }}
                    placeholder="Description"
                    className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium focus:outline-none"
                  />

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-slate-400">Qty</span>
                    <input
                      type="number"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...parsedData.items];
                        newItems[index].quantity = parseFloat(e.target.value) || 1;
                        setParsedData({ ...parsedData, items: newItems });
                      }}
                      className="w-12 px-1.5 py-1 text-xs text-center bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.total_price}
                      onChange={(e) => {
                        const newItems = [...parsedData.items];
                        newItems[index].total_price = parseFloat(e.target.value) || 0;
                        setParsedData({ ...parsedData, items: newItems });
                      }}
                      className="w-20 px-1.5 py-1 text-xs text-right font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newItems = parsedData.items.filter((_, i) => i !== index);
                      setParsedData({ ...parsedData, items: newItems });
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
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
