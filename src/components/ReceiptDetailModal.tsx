'use client';

import { useEffect, useState } from 'react';
import { Receipt, ReceiptItem } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { X, Calendar, DollarSign, Tag, Trash2, ExternalLink, Image as ImageIcon } from 'lucide-react';

interface Props {
  receipt: Receipt | null;
  onClose: () => void;
  onDeleted: (receiptId: string) => void;
}

export default function ReceiptDetailModal({ receipt, onClose, onDeleted }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [imageSignedUrl, setImageSignedUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!receipt) return;

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
      }
      setLoadingItems(false);
    };

    // Load signed URL for private receipt image in Supabase Storage
    const fetchSignedUrl = async () => {
      if (receipt.image_url) {
        // If it's already a full signed URL or http URL, use it directly
        if (receipt.image_url.startsWith('http')) {
          setImageSignedUrl(receipt.image_url);
          return;
        }
        // Otherwise generate signed URL for bucket path
        const { data } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipt.image_url, 3600); // 1 hour validity

        if (data?.signedUrl) {
          setImageSignedUrl(data.signedUrl);
        }
      }
    };

    fetchItems();
    fetchSignedUrl();
  }, [receipt, supabase]);

  if (!receipt) return null;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this receipt?')) return;
    setDeleting(true);

    try {
      // Delete image from storage if path exists
      if (receipt.image_url && !receipt.image_url.startsWith('http')) {
        await supabase.storage.from('receipts').remove([receipt.image_url]);
      }

      // Delete receipt from DB (cascades to receipt_items)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
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
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Summary Stats Card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Amount</span>
              <p className="text-2xl font-bold text-emerald-600">${Number(receipt.total_amount).toFixed(2)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Tax Paid</span>
              <p className="text-lg font-semibold text-slate-700">${Number(receipt.tax_amount || 0).toFixed(2)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Category</span>
              <p className="text-sm font-medium text-slate-800 mt-1">{receipt.category}</p>
            </div>
          </div>

          {/* Line Items Section */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
              <span>Itemized Breakdown</span>
              <span className="text-xs font-normal text-slate-500">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </h3>

            {loadingItems ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading line items...</div>
            ) : items.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No individual line items parsed for this receipt.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-center">Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Price</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-800">{item.item_description}</p>
                          {item.category && (
                            <span className="text-[11px] text-slate-400">{item.category}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                          ${Number(item.total_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Receipt Image Preview */}
          {imageSignedUrl && (
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                Original Receipt Photo
              </h3>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950/5 flex items-center justify-center max-h-72">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSignedUrl}
                  alt={receipt.vendor_name}
                  className="max-h-72 w-auto object-contain rounded-lg"
                />
              </div>
              <div className="mt-2 text-right">
                <a
                  href={imageSignedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Open full resolution <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
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
        </div>
      </div>
    </div>
  );
}
