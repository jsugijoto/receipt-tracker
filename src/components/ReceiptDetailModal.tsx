'use client';

import { useEffect, useState } from 'react';
import { Receipt, ReceiptItem, DecodedReceiptAI } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import TagInput from '@/components/TagInput';
import {
  X,
  Calendar,
  DollarSign,
  Tag,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  FileText,
  Pencil,
  Check,
  Plus,
  Loader2,
  Building,
  Sparkles,
  CheckCheck,
  HelpCircle,
  Eye,
  ListFilter,
} from 'lucide-react';

interface Props {
  receipt: Receipt | null;
  onClose: () => void;
  onDeleted: (receiptId: string) => void;
  onUpdated?: (updatedReceipt: Receipt) => void;
}

export default function ReceiptDetailModal({ receipt, onClose, onDeleted, onUpdated }: Props) {
  const supabase = createClient();

  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [imageSignedUrl, setImageSignedUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editVendor, setEditVendor] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTotal, setEditTotal] = useState<number>(0);
  const [editTax, setEditTax] = useState<number>(0);
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editItems, setEditItems] = useState<ReceiptItem[]>([]);

  // AI Item Decoding States
  const [aiDecoded, setAiDecoded] = useState<DecodedReceiptAI | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'clarified' | 'raw'>('clarified');
  const [isSavingDecoded, setIsSavingDecoded] = useState(false);
  const [savedDecodedSuccess, setSavedDecodedSuccess] = useState(false);
  const [isAutoClarifyingEdit, setIsAutoClarifyingEdit] = useState(false);

  // Initialize data on receipt open
  useEffect(() => {
    if (!receipt) return;

    setIsEditing(false);
    setEditVendor(receipt.vendor_name);
    setEditDate(receipt.transaction_date);
    setEditTotal(Number(receipt.total_amount) || 0);
    setEditTax(Number(receipt.tax_amount) || 0);
    setEditCategory(receipt.category || 'General');
    setEditTags(receipt.tags || []);
    setSavedDecodedSuccess(false);
    setDecodeError(null);

    // If receipt already has cached AI decoded data, initialize it
    if (receipt.raw_ocr_json?.ai_decoded) {
      setAiDecoded(receipt.raw_ocr_json.ai_decoded);
      setViewMode('clarified');
    } else {
      setAiDecoded(null);
      setViewMode('clarified');
    }

    // Load line items
    const fetchItems = async () => {
      setLoadingItems(true);
      const { data, error } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setItems(data);
        setEditItems(data);
      }
      setLoadingItems(false);
    };

    // Load signed URL for private receipt image in Supabase Storage
    const fetchSignedUrl = async () => {
      if (receipt.image_url) {
        if (receipt.image_url.startsWith('http')) {
          setImageSignedUrl(receipt.image_url);
          return;
        }
        const { data } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipt.image_url, 3600);

        if (data?.signedUrl) {
          setImageSignedUrl(data.signedUrl);
        }
      }
    };

    fetchItems();
    fetchSignedUrl();
  }, [receipt, supabase]);

  if (!receipt) return null;

  // Start Editing
  const handleStartEdit = () => {
    setEditVendor(receipt.vendor_name);
    setEditDate(receipt.transaction_date);
    setEditTotal(Number(receipt.total_amount) || 0);
    setEditTax(Number(receipt.tax_amount) || 0);
    setEditCategory(receipt.category || 'General');
    setEditTags(receipt.tags || []);
    setEditItems([...items]);
    setIsEditing(true);
  };

  // Decode cryptic receipt items with Gemini Flash
  const handleDecodeItems = async () => {
    if (!receipt || items.length === 0) return;
    setIsDecoding(true);
    setDecodeError(null);
    setSavedDecodedSuccess(false);

    try {
      const res = await fetch('/api/ai/decode-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: receipt.id,
          vendor_name: receipt.vendor_name,
          category: receipt.category,
          items: items.map((it) => ({
            id: it.id,
            item_description: it.item_description,
            quantity: it.quantity,
            total_price: it.total_price,
            category: it.category,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to decode items.');
      }

      setAiDecoded(json.data);
      setViewMode('clarified');
    } catch (err: any) {
      setDecodeError(err.message || 'Error decoding items');
    } finally {
      setIsDecoding(false);
    }
  };

  // Permanently save AI decoded names to Supabase
  const handleApplyAndSaveDecoded = async () => {
    if (!aiDecoded || !receipt || items.length === 0) return;
    setIsSavingDecoded(true);
    try {
      const updatedItems = items.map((item, idx) => {
        const dec = aiDecoded.decoded_items[idx];
        return {
          ...item,
          item_description: dec?.clarified_name || item.item_description,
          category: dec?.sub_category || item.category,
        };
      });

      for (let i = 0; i < updatedItems.length; i++) {
        const it = updatedItems[i];
        if (it.id) {
          await supabase
            .from('receipt_items')
            .update({
              item_description: it.item_description,
              category: it.category,
            })
            .eq('id', it.id);
        }
      }

      const updatedRawOcr = {
        ...(receipt.raw_ocr_json || {}),
        ai_decoded: aiDecoded,
      };

      const updatedNotes = receipt.notes
        ? receipt.notes.includes(aiDecoded.summary)
          ? receipt.notes
          : `${receipt.notes}\n[AI Decoded]: ${aiDecoded.summary}`
        : aiDecoded.summary;

      await supabase
        .from('receipts')
        .update({
          notes: updatedNotes,
          raw_ocr_json: updatedRawOcr,
        })
        .eq('id', receipt.id);

      setItems(updatedItems);
      setEditItems(updatedItems);
      setSavedDecodedSuccess(true);

      const updatedReceipt: Receipt = {
        ...receipt,
        notes: updatedNotes,
        raw_ocr_json: updatedRawOcr,
        items: updatedItems,
      };
      onUpdated?.(updatedReceipt);
    } catch (err: any) {
      alert('Failed to save clarified names: ' + err.message);
    } finally {
      setIsSavingDecoded(false);
    }
  };

  // In edit mode: auto-clarify line item descriptions
  const handleAutoClarifyEdit = async () => {
    if (editItems.length === 0) return;
    setIsAutoClarifyingEdit(true);
    try {
      const res = await fetch('/api/ai/decode-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_name: editVendor,
          category: editCategory,
          items: editItems.map((it) => ({
            item_description: it.item_description,
            quantity: it.quantity,
            total_price: it.total_price,
            category: it.category,
          })),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data.decoded_items)) {
        const clarified = editItems.map((it, idx) => {
          const dec = json.data.decoded_items[idx];
          return {
            ...it,
            item_description: dec?.clarified_name || it.item_description,
            category: dec?.sub_category || it.category,
          };
        });
        setEditItems(clarified);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAutoClarifyingEdit(false);
    }
  };

  // Update item in edit mode
  const handleUpdateItem = (
    index: number,
    field: 'item_description' | 'quantity' | 'total_price',
    val: any
  ) => {
    const updated = [...editItems];
    const item = { ...updated[index] };

    if (field === 'quantity') {
      const q = parseFloat(val) || 1;
      const unit = item.unit_price || (item.total_price && item.quantity ? item.total_price / item.quantity : 0);
      item.quantity = q;
      if (unit > 0) {
        item.unit_price = unit;
        item.total_price = Number((q * unit).toFixed(2));
      }
    } else if (field === 'total_price') {
      const t = parseFloat(val) || 0;
      item.total_price = t;
      if (item.quantity > 0) {
        item.unit_price = Number((t / item.quantity).toFixed(2));
      }
    } else {
      item.item_description = val;
    }

    updated[index] = item;
    setEditItems(updated);

    // Auto-recalculate total
    const itemsSum = updated.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
    setEditTotal(Number((itemsSum + Number(editTax)).toFixed(2)));
  };

  const handleAddItem = () => {
    setEditItems([
      ...editItems,
      { item_description: 'New Item', quantity: 1, total_price: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    const updated = editItems.filter((_, i) => i !== index);
    setEditItems(updated);
    const itemsSum = updated.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
    setEditTotal(Number((itemsSum + Number(editTax)).toFixed(2)));
  };

  // Save changes to Supabase
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // 1. Update receipts table
      const { error: receiptErr } = await supabase
        .from('receipts')
        .update({
          vendor_name: editVendor,
          transaction_date: editDate,
          total_amount: Number(editTotal) || 0,
          tax_amount: Number(editTax) || 0,
          category: editCategory,
          tags: editTags.length > 0 ? editTags : null,
        })
        .eq('id', receipt.id);

      if (receiptErr) throw receiptErr;

      // 2. Re-sync line items (delete old, insert updated)
      await supabase.from('receipt_items').delete().eq('receipt_id', receipt.id);

      if (editItems.length > 0) {
        const { error: itemsErr } = await supabase.from('receipt_items').insert(
          editItems.map((it) => ({
            receipt_id: receipt.id,
            item_description: it.item_description,
            quantity: Number(it.quantity) || 1,
            unit_price: it.unit_price ? Number(it.unit_price) : null,
            total_price: Number(it.total_price) || 0,
            category: it.category || editCategory,
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      const updatedReceipt: Receipt = {
        ...receipt,
        vendor_name: editVendor,
        transaction_date: editDate,
        total_amount: Number(editTotal) || 0,
        tax_amount: Number(editTax) || 0,
        category: editCategory,
        tags: editTags.length > 0 ? editTags : null,
      };

      setItems(editItems);
      setIsEditing(false);
      onUpdated?.(updatedReceipt);
    } catch (err: any) {
      alert('Failed to save changes: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this receipt?')) return;
    setDeleting(true);

    try {
      if (receipt.image_url && !receipt.image_url.startsWith('http')) {
        await supabase.storage.from('receipts').remove([receipt.image_url]);
      }

      const { error } = await supabase.from('receipts').delete().eq('id', receipt.id);
      if (error) throw error;

      onDeleted(receipt.id);
      onClose();
    } catch (err: any) {
      alert('Failed to delete receipt: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const isPdf = receipt.image_url?.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          {!isEditing ? (
            <div>
              <h2 className="text-xl font-bold text-slate-900">{receipt.vendor_name}</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {receipt.transaction_date}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 font-medium text-slate-700">
                  <Tag className="w-3 h-3" />
                  {receipt.category}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <span className="text-xs uppercase font-bold text-emerald-600 tracking-wider">
                Editing Receipt
              </span>
              <h2 className="text-lg font-bold text-slate-900">Make Corrections</h2>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* READ-ONLY VIEW */}
          {!isEditing ? (
            <>
              {/* Summary Stats Card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Total Amount
                  </span>
                  <p className="text-2xl font-bold text-emerald-600">
                    ${Number(receipt.total_amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Tax Paid
                  </span>
                  <p className="text-lg font-semibold text-slate-700">
                    ${Number(receipt.tax_amount || 0).toFixed(2)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Category
                  </span>
                  <p className="text-sm font-medium text-slate-800 mt-1">{receipt.category}</p>
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-3">
                {/* Header with AI controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Itemized Breakdown</span>
                      <span className="text-xs font-normal text-slate-500">
                        ({items.length} {items.length === 1 ? 'item' : 'items'})
                      </span>
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* If not decoded yet, show the "What Did I Buy?" AI button */}
                    {!aiDecoded && (
                      <button
                        type="button"
                        onClick={handleDecodeItems}
                        disabled={isDecoding || items.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 shadow-xs transition disabled:opacity-50"
                      >
                        {isDecoding ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                            <span>Decoding items...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>✨ What Did I Buy?</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* If decoded, show toggle and save option */}
                    {aiDecoded && (
                      <>
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setViewMode('clarified')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                              viewMode === 'clarified'
                                ? 'bg-white text-purple-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ✨ Plain English
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('raw')}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                              viewMode === 'raw'
                                ? 'bg-white text-slate-800 shadow-xs'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            Raw Receipt
                          </button>
                        </div>

                        {!savedDecodedSuccess ? (
                          <button
                            type="button"
                            onClick={handleApplyAndSaveDecoded}
                            disabled={isSavingDecoded}
                            title="Permanently save clarified names to receipt"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                          >
                            {isSavingDecoded ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCheck className="w-3 h-3" />
                            )}
                            <span>Save to Receipt</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span>Saved</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* AI Purchase Summary Card */}
                {aiDecoded && (
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-slate-50 border border-purple-200/80 shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                            AI Purchase Summary
                          </h4>
                          <button
                            type="button"
                            onClick={handleDecodeItems}
                            disabled={isDecoding}
                            className="text-[11px] text-purple-600 hover:text-purple-800 font-medium transition"
                          >
                            {isDecoding ? 'Refreshing...' : 'Re-decode'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                          {aiDecoded.summary}
                        </p>
                        {aiDecoded.key_highlights && aiDecoded.key_highlights.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-purple-100">
                            <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider">
                              Highlights:
                            </span>
                            {aiDecoded.key_highlights.map((h, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white border border-purple-200 text-purple-800 shadow-2xs"
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Decode Error Alert */}
                {decodeError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                    <span>{decodeError}</span>
                    <button
                      type="button"
                      onClick={handleDecodeItems}
                      className="font-semibold underline ml-2 hover:text-rose-800"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {loadingItems ? (
                  <div className="py-8 text-center text-sm text-slate-400">Loading line items...</div>
                ) : items.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No individual line items parsed for this receipt.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">
                            {viewMode === 'clarified' && aiDecoded ? 'Decoded Product' : 'Item'}
                          </th>
                          <th className="px-3 py-2.5 text-center">Qty</th>
                          <th className="px-3 py-2.5 text-right">Unit Price</th>
                          <th className="px-4 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((item, idx) => {
                          const decoded = aiDecoded?.decoded_items?.[idx];
                          const showClarified = viewMode === 'clarified' && decoded;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition">
                              <td className="px-4 py-2.5">
                                {showClarified ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-slate-900">
                                        {decoded.clarified_name}
                                      </p>
                                      {decoded.sub_category && (
                                        <span className="text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded-full">
                                          {decoded.sub_category}
                                        </span>
                                      )}
                                      {decoded.confidence === 'low' && (
                                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                                          Estimated
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-mono">
                                      Receipt: &ldquo;{item.item_description}&rdquo;
                                    </p>
                                    {decoded.explanation && (
                                      <p className="text-[11px] text-slate-500 italic flex items-center gap-1 pt-0.5">
                                        <HelpCircle className="w-2.5 h-2.5 text-purple-500 flex-shrink-0" />
                                        <span>{decoded.explanation}</span>
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-medium text-slate-800">{item.item_description}</p>
                                    {item.category && (
                                      <span className="text-[11px] text-slate-400">{item.category}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-600 align-top">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600 align-top">
                                {item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium text-slate-900 align-top">
                                ${Number(item.total_price).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* EDIT MODE FORM */
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Store / Merchant
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
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
                      value={editTotal}
                      onChange={(e) => setEditTotal(parseFloat(e.target.value) || 0)}
                      className="w-full pl-9 pr-3 py-2 text-sm font-bold text-emerald-600 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
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
                      value={editTax}
                      onChange={(e) => {
                        const newTax = parseFloat(e.target.value) || 0;
                        setEditTax(newTax);
                        const sub = editItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
                        setEditTotal(Number((sub + newTax).toFixed(2)));
                      }}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <div className="relative">
                    <Tag className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
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

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Custom Tags
                  </label>
                  <TagInput
                    tags={editTags}
                    onChange={setEditTags}
                    placeholder="e.g. work, reimbursable..."
                  />
                </div>
              </div>

              {/* Editable Line Items */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Edit Line Items ({editItems.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAutoClarifyEdit}
                      disabled={isAutoClarifyingEdit || editItems.length === 0}
                      title="Convert cryptic abbreviations to clear English names"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 transition disabled:opacity-50"
                    >
                      {isAutoClarifyingEdit ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      )}
                      <span>Auto-Clarify Names</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Item
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {editItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <input
                        type="text"
                        value={item.item_description}
                        onChange={(e) => handleUpdateItem(idx, 'item_description', e.target.value)}
                        className="flex-1 min-w-0 bg-transparent text-xs font-medium focus:outline-none"
                        placeholder="Description"
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[11px] text-slate-400">Qty</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                          className="w-12 px-1 py-0.5 text-xs text-center bg-white border border-slate-200 rounded"
                        />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[11px] text-slate-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.total_price}
                          onChange={(e) => handleUpdateItem(idx, 'total_price', e.target.value)}
                          className="w-16 px-1 py-0.5 text-xs text-right font-semibold bg-white border border-slate-200 rounded"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Subtotal & Sync Row in Edit Mode */}
                <div className="pt-2 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Items Subtotal: $
                    {editItems
                      .reduce((acc, it) => acc + (Number(it.total_price) || 0), 0)
                      .toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const sub = editItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
                      setEditTotal(Number((sub + Number(editTax)).toFixed(2)));
                    }}
                    className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 transition font-medium"
                  >
                    Sync Total to Items ($
                    {(
                      editItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0) +
                      Number(editTax)
                    ).toFixed(2)}
                    )
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Receipt Original Image / PDF Preview (Always Available) */}
          {imageSignedUrl && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                {isPdf ? (
                  <FileText className="w-4 h-4 text-slate-500" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-slate-500" />
                )}
                Original Receipt {isPdf ? 'PDF Document' : 'Photo'}
              </h3>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950/5 flex items-center justify-center max-h-80">
                {isPdf ? (
                  <iframe
                    src={`${imageSignedUrl}#toolbar=0`}
                    className="w-full h-72 border-none rounded-lg"
                    title="PDF Receipt Preview"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageSignedUrl}
                    alt={receipt.vendor_name}
                    className="max-h-72 w-auto object-contain rounded-lg"
                  />
                )}
              </div>
              <div className="mt-2 text-right">
                <a
                  href={imageSignedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Open {isPdf ? 'PDF' : 'full resolution'} in new tab <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {!isEditing ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Delete Receipt'}</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Close
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Save Changes</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
