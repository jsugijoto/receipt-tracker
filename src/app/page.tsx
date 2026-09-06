'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Receipt } from '@/lib/types';
import ReceiptCard from '@/components/ReceiptCard';
import ReceiptDetailModal from '@/components/ReceiptDetailModal';
import {
  Camera,
  DollarSign,
  TrendingUp,
  Receipt as ReceiptIcon,
  Search,
  Filter,
  Loader2,
  Calendar,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

  // Fetch receipts for authenticated user
  const fetchReceipts = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (!error && data) {
      setReceipts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReceipts();
  }, []);

  // Filtered receipts based on search and category
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      const matchesSearch =
        r.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.transaction_date.includes(searchQuery);
      const matchesCategory =
        selectedCategory === 'ALL' || r.category?.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [receipts, searchQuery, selectedCategory]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const totalSpent = receipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const count = receipts.length;
    const avg = count > 0 ? totalSpent / count : 0;

    // Current month filter
    const currentYearMonth = new Date().toISOString().slice(0, 7); // "2026-09"
    const thisMonthSpent = receipts
      .filter((r) => r.transaction_date.startsWith(currentYearMonth))
      .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

    return {
      totalSpent,
      thisMonthSpent,
      count,
      avg,
    };
  }, [receipts]);

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    receipts.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [receipts]);

  const handleReceiptDeleted = (deletedId: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== deletedId));
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expense Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track and analyze your household receipts with instant AI line-item extraction
          </p>
        </div>

        <Link
          href="/upload"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md transition text-sm"
        >
          <Camera className="w-4 h-4" />
          <span>Snap Receipt</span>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This Month</span>
            <p className="text-2xl font-bold text-slate-900">${stats.thisMonthSpent.toFixed(2)}</p>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <ReceiptIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Receipts</span>
            <p className="text-2xl font-bold text-slate-900">{stats.count}</p>
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Average Receipt</span>
            <p className="text-2xl font-bold text-slate-900">${stats.avg.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by store or date (e.g. Costco, 2026-09)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-sm transition"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Receipts List */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-sm">Loading your receipts...</p>
          </div>
        ) : filteredReceipts.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-8">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ReceiptIcon className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">No Receipts Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'ALL'
                ? 'No receipts match your search criteria. Try resetting the filters.'
                : 'You have not uploaded any receipts yet. Snap a photo of your first receipt to see the magic!'}
            </p>
            <div className="mt-5">
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow transition"
              >
                <Camera className="w-4 h-4" />
                <span>Snap First Receipt</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredReceipts.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                onClick={() => setActiveReceipt(receipt)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <ReceiptDetailModal
        receipt={activeReceipt}
        onClose={() => setActiveReceipt(null)}
        onDeleted={handleReceiptDeleted}
        onUpdated={(updated) => {
          setReceipts((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setActiveReceipt(updated);
        }}
      />
    </div>
  );
}
