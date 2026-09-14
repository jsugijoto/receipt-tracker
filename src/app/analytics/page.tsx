'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Receipt } from '@/lib/types';
import ReceiptDetailModal from '@/components/ReceiptDetailModal';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  Tag,
  Loader2,
  ReceiptText,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  CalendarDays,
  SlidersHorizontal,
  RotateCcw,
  PieChart as PieChartIcon,
  Percent,
} from 'lucide-react';

const CATEGORY_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#a855f7',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDateDisplay(dStr: string): string {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length !== 3) return dStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthLabel(ym: string): string {
  // ym: "2026-09"
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOfMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth(date = new Date()): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

type DatePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'last30'
  | 'last3'
  | 'last6'
  | 'thisYear'
  | 'lastYear'
  | 'all'
  | 'custom';

type ChartViewMode = 'spend' | 'volume' | 'cumulative';

export default function AnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Range state
  const [activePreset, setActivePreset] = useState<DatePreset>('thisMonth');
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // View state
  const [chartView, setChartView] = useState<ChartViewMode>('spend');
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (!error && data) setReceipts(data);
      setLoading(false);
    };
    init();
  }, [router, supabase]);

  // Set Preset Date Ranges
  const handlePresetSelect = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = now.getMonth();

    if (preset === 'thisMonth') {
      setDateFrom(firstOfMonth(now));
      setDateTo(todayStr());
    } else if (preset === 'lastMonth') {
      const lastMonthDate = new Date(yyyy, mm - 1, 1);
      setDateFrom(firstOfMonth(lastMonthDate));
      setDateTo(lastOfMonth(lastMonthDate));
    } else if (preset === 'last30') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateFrom(thirtyDaysAgo.toISOString().slice(0, 10));
      setDateTo(todayStr());
    } else if (preset === 'last3') {
      const threeMonthsAgo = new Date(yyyy, mm - 2, 1);
      setDateFrom(firstOfMonth(threeMonthsAgo));
      setDateTo(todayStr());
    } else if (preset === 'last6') {
      const sixMonthsAgo = new Date(yyyy, mm - 5, 1);
      setDateFrom(firstOfMonth(sixMonthsAgo));
      setDateTo(todayStr());
    } else if (preset === 'thisYear') {
      setDateFrom(`${yyyy}-01-01`);
      setDateTo(todayStr());
    } else if (preset === 'lastYear') {
      setDateFrom(`${yyyy - 1}-01-01`);
      setDateTo(`${yyyy - 1}-12-31`);
    } else if (preset === 'all') {
      setDateFrom('2020-01-01');
      setDateTo(todayStr());
    }
  };

  // Month navigation step (< and >)
  const stepMonth = (direction: -1 | 1) => {
    setActivePreset('custom');
    const curParts = dateFrom.split('-');
    const curYear = Number(curParts[0]) || new Date().getFullYear();
    const curMonth = (Number(curParts[1]) || 1) - 1;
    const targetDate = new Date(curYear, curMonth + direction, 1);
    setDateFrom(firstOfMonth(targetDate));
    setDateTo(lastOfMonth(targetDate));
  };

  // Unique categories, vendors, and tags across all receipts
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    receipts.forEach((r) => {
      if (r.category) set.add(r.category.trim());
    });
    return Array.from(set).sort();
  }, [receipts]);

  const availableVendors = useMemo(() => {
    const set = new Set<string>();
    receipts.forEach((r) => {
      if (r.vendor_name) set.add(r.vendor_name.trim());
    });
    return Array.from(set).sort();
  }, [receipts]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    receipts.forEach((r) => {
      (r.tags || []).forEach((t) => {
        if (t) set.add(t.trim());
      });
    });
    return Array.from(set).sort();
  }, [receipts]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'ALL') count++;
    if (selectedVendor !== 'ALL') count++;
    if (selectedTag !== 'ALL') count++;
    if (searchQuery.trim() !== '') count++;
    if (minAmount.trim() !== '') count++;
    if (maxAmount.trim() !== '') count++;
    return count;
  }, [selectedCategory, selectedVendor, selectedTag, searchQuery, minAmount, maxAmount]);

  const resetAllFilters = () => {
    setSelectedCategory('ALL');
    setSelectedVendor('ALL');
    setSelectedTag('ALL');
    setSearchQuery('');
    setMinAmount('');
    setMaxAmount('');
  };

  // Filtered Receipts based on Date Range + Multi-Filters
  const filteredReceipts = useMemo(() => {
    const minVal = minAmount !== '' ? parseFloat(minAmount) : null;
    const maxVal = maxAmount !== '' ? parseFloat(maxAmount) : null;
    const query = searchQuery.trim().toLowerCase();

    return receipts.filter((r) => {
      // Date filter
      if (r.transaction_date < dateFrom || r.transaction_date > dateTo) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'ALL' && (r.category || 'General').toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      // Vendor filter
      if (selectedVendor !== 'ALL' && r.vendor_name.toLowerCase() !== selectedVendor.toLowerCase()) {
        return false;
      }
      // Tag filter
      if (selectedTag !== 'ALL' && !(r.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())) {
        return false;
      }
      // Amount min/max
      const amt = Number(r.total_amount || 0);
      if (minVal !== null && !isNaN(minVal) && amt < minVal) {
        return false;
      }
      if (maxVal !== null && !isNaN(maxVal) && amt > maxVal) {
        return false;
      }
      // Search query (vendor name, notes, category)
      if (query) {
        const matchesVendor = r.vendor_name?.toLowerCase().includes(query);
        const matchesNotes = r.notes?.toLowerCase().includes(query);
        const matchesCat = r.category?.toLowerCase().includes(query);
        if (!matchesVendor && !matchesNotes && !matchesCat) {
          return false;
        }
      }
      return true;
    });
  }, [receipts, dateFrom, dateTo, selectedCategory, selectedVendor, selectedTag, minAmount, maxAmount, searchQuery]);

  // Overall KPI Statistics
  const stats = useMemo(() => {
    const total = filteredReceipts.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const totalTax = filteredReceipts.reduce((s, r) => s + Number(r.tax_amount || 0), 0);
    const count = filteredReceipts.length;
    const avg = count > 0 ? total / count : 0;
    const effectiveTaxRate = total > 0 ? (totalTax / total) * 100 : 0;

    // Days spanned
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const dailyAvg = total / diffDays;

    const biggest = filteredReceipts.reduce<Receipt | null>(
      (max, r) => (!max || Number(r.total_amount) > Number(max.total_amount) ? r : max),
      null
    );

    return {
      total,
      totalTax,
      effectiveTaxRate,
      count,
      avg,
      diffDays,
      dailyAvg,
      biggest,
    };
  }, [filteredReceipts, dateFrom, dateTo]);

  // Monthly Analytics calculation (Aggregated across all months or filtered range)
  const monthlyData = useMemo(() => {
    // Collect all unique months in filtered receipts
    const map: Record<
      string,
      {
        monthKey: string; // "2026-09"
        label: string; // "Sep 2026"
        spend: number;
        tax: number;
        count: number;
      }
    > = {};

    filteredReceipts.forEach((r) => {
      const ym = (r.transaction_date || '').slice(0, 7);
      if (!ym || ym.length !== 7) return;

      if (!map[ym]) {
        map[ym] = {
          monthKey: ym,
          label: formatMonthLabel(ym),
          spend: 0,
          tax: 0,
          count: 0,
        };
      }
      map[ym].spend += Number(r.total_amount || 0);
      map[ym].tax += Number(r.tax_amount || 0);
      map[ym].count += 1;
    });

    const sorted = Object.values(map).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    // Calculate cumulative spend and MoM changes
    let runningCumulative = 0;
    return sorted.map((item, idx) => {
      runningCumulative += item.spend;
      const prev = idx > 0 ? sorted[idx - 1] : null;
      let momPercent: number | null = null;
      if (prev && prev.spend > 0) {
        momPercent = ((item.spend - prev.spend) / prev.spend) * 100;
      }

      return {
        ...item,
        spend: Number(item.spend.toFixed(2)),
        tax: Number(item.tax.toFixed(2)),
        avgTicket: item.count > 0 ? Number((item.spend / item.count).toFixed(2)) : 0,
        cumulative: Number(runningCumulative.toFixed(2)),
        momPercent: momPercent !== null ? Number(momPercent.toFixed(1)) : null,
      };
    });
  }, [filteredReceipts]);

  // Category Breakdown
  const byCategory = useMemo(() => {
    const map: Record<string, { spend: number; count: number }> = {};
    filteredReceipts.forEach((r) => {
      const cat = (r.category || 'General').trim();
      if (!map[cat]) map[cat] = { spend: 0, count: 0 };
      map[cat].spend += Number(r.total_amount || 0);
      map[cat].count += 1;
    });

    const total = Object.values(map).reduce((a, b) => a + b.spend, 0);
    return Object.entries(map)
      .sort((a, b) => b[1].spend - a[1].spend)
      .map(([name, data], idx) => ({
        name,
        value: Number(data.spend.toFixed(2)),
        count: data.count,
        pct: total > 0 ? Math.round((data.spend / total) * 100) : 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }));
  }, [filteredReceipts]);

  // Top Merchants / Vendors Leaderboard
  const topVendors = useMemo(() => {
    const map: Record<string, { spend: number; count: number }> = {};
    filteredReceipts.forEach((r) => {
      const v = (r.vendor_name || 'Unknown').trim();
      if (!map[v]) map[v] = { spend: 0, count: 0 };
      map[v].spend += Number(r.total_amount || 0);
      map[v].count += 1;
    });

    const total = stats.total;
    return Object.entries(map)
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 7)
      .map(([vendor, data]) => ({
        vendor,
        spend: Number(data.spend.toFixed(2)),
        count: data.count,
        avgTicket: data.count > 0 ? Number((data.spend / data.count).toFixed(2)) : 0,
        pct: total > 0 ? Math.round((data.spend / total) * 100) : 0,
      }));
  }, [filteredReceipts, stats.total]);

  // Day-of-week spending distribution
  const dayOfWeekData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const amounts = [0, 0, 0, 0, 0, 0, 0];

    filteredReceipts.forEach((r) => {
      const parts = r.transaction_date.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const dayIdx = d.getDay();
        amounts[dayIdx] += Number(r.total_amount || 0);
        counts[dayIdx] += 1;
      }
    });

    return DAY_NAMES.map((name, i) => ({
      day: name,
      spend: Number(amounts[i].toFixed(2)),
      count: counts[i],
    }));
  }, [filteredReceipts]);

  // Tag Spending Breakdown
  const byTag = useMemo(() => {
    const map: Record<string, { spend: number; count: number }> = {};
    filteredReceipts.forEach((r) => {
      (r.tags || []).forEach((t) => {
        if (!t) return;
        const tag = t.trim();
        if (!map[tag]) map[tag] = { spend: 0, count: 0 };
        map[tag].spend += Number(r.total_amount || 0);
        map[tag].count += 1;
      });
    });

    return Object.entries(map)
      .sort((a, b) => b[1].spend - a[1].spend)
      .map(([tag, data]) => ({
        tag,
        amount: Number(data.spend.toFixed(2)),
        count: data.count,
        pct: stats.total > 0 ? Math.round((data.spend / stats.total) * 100) : 0,
      }));
  }, [filteredReceipts, stats.total]);

  // Export Filtered Receipts to CSV
  const handleExportCSV = () => {
    if (filteredReceipts.length === 0) return;

    const headers = ['Date', 'Vendor', 'Category', 'Total Amount', 'Tax Amount', 'Tags', 'Notes'];
    const rows = filteredReceipts.map((r) => [
      `"${r.transaction_date || ''}"`,
      `"${(r.vendor_name || '').replace(/"/g, '""')}"`,
      `"${(r.category || '').replace(/"/g, '""')}"`,
      Number(r.total_amount || 0).toFixed(2),
      Number(r.tax_amount || 0).toFixed(2),
      `"${(r.tags || []).join(', ').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `receipts_analytics_${dateFrom}_to_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Set drill-down to a specific month
  const drillDownMonth = (monthKey: string) => {
    const parts = monthKey.split('-');
    if (parts.length !== 2) return;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    setDateFrom(firstOfMonth(d));
    setDateTo(lastOfMonth(d));
    setActivePreset('custom');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium">Crunching your numbers and receipts…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Financial & Spending Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Deep dive into monthly trends, category allocations, vendor frequency, and tax insights.
          </p>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
              showFilters || activeFiltersCount > 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredReceipts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            title="Download CSV export of currently filtered data"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Date Range Period</p>
              <p className="text-[11px] text-slate-500">
                {formatDateDisplay(dateFrom)} – {formatDateDisplay(dateTo)} ({stats.diffDays} days)
              </p>
            </div>
          </div>

          {/* Month Stepper */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={() => stepMonth(-1)}
              className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-xs flex items-center gap-1"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[11px] pr-1">Prev Month</span>
            </button>
            <button
              onClick={() => stepMonth(1)}
              className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition text-xs flex items-center gap-1"
              title="Next Month"
            >
              <span className="text-[11px] pl-1">Next Month</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 uppercase">Presets:</span>
          {[
            { id: 'thisMonth', label: 'This Month' },
            { id: 'lastMonth', label: 'Last Month' },
            { id: 'last30', label: 'Last 30 Days' },
            { id: 'last3', label: 'Last 3 Months' },
            { id: 'last6', label: 'Last 6 Months' },
            { id: 'thisYear', label: 'This Year' },
            { id: 'lastYear', label: 'Last Year' },
            { id: 'all', label: 'All Time' },
          ].map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id as DatePreset)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              End Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Multi-Filter Panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-600" /> Granular Filters
            </h3>
            {activeFiltersCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 hover:underline"
              >
                <RotateCcw className="w-3 h-3" /> Reset all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Category Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-700"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Merchant / Store
              </label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-700"
              >
                <option value="ALL">All Merchants</option>
                {availableVendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Custom Tag
              </label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-700"
              >
                <option value="ALL">All Tags</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </div>

            {/* Search query */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Keyword / Notes
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search receipt notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Amount range filters */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Amount Range:</span>
            <div className="flex items-center gap-2">
              <div className="relative w-28">
                <span className="absolute left-2.5 top-2 text-xs text-slate-400">$</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
              <span className="text-slate-400 text-xs">to</span>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-2 text-xs text-slate-400">$</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Quick Filter Badges */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {selectedCategory !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Category: {selectedCategory}
                    <X className="w-3 h-3 cursor-pointer hover:text-rose-600" onClick={() => setSelectedCategory('ALL')} />
                  </span>
                )}
                {selectedVendor !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Vendor: {selectedVendor}
                    <X className="w-3 h-3 cursor-pointer hover:text-rose-600" onClick={() => setSelectedVendor('ALL')} />
                  </span>
                )}
                {selectedTag !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Tag: #{selectedTag}
                    <X className="w-3 h-3 cursor-pointer hover:text-rose-600" onClick={() => setSelectedTag('ALL')} />
                  </span>
                )}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Query: "{searchQuery}"
                    <X className="w-3 h-3 cursor-pointer hover:text-rose-600" onClick={() => setSearchQuery('')} />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Total Spent
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {stats.count} receipts
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-2">{fmt(stats.total)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Avg {fmt(stats.dailyAvg)} / day</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Average Ticket
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
              Per receipt
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">{fmt(stats.avg)}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.count > 0 ? `Across ${stats.count} purchases` : 'No transactions'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-amber-600" /> Sales Tax Paid
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
              {stats.effectiveTaxRate.toFixed(1)}% rate
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">{fmt(stats.totalTax)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Total recorded tax liability</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-purple-600" /> Largest Expense
            </span>
            {stats.biggest && (
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full truncate max-w-[90px]">
                {stats.biggest.vendor_name}
              </span>
            )}
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            {stats.biggest ? fmt(Number(stats.biggest.total_amount)) : '$0.00'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {stats.biggest ? `${stats.biggest.vendor_name} (${stats.biggest.transaction_date})` : 'None recorded'}
          </p>
        </div>
      </div>

      {filteredReceipts.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 p-8">
          <ReceiptText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-base">No Receipts Match This Filter</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            We couldn't find any receipts within the selected date range ({dateFrom} to {dateTo}) and active filters.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={resetAllFilters}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow transition"
            >
              Reset Filters
            </button>
            <button
              onClick={() => handlePresetSelect('all')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              View All Time
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* MONTHLY ANALYTICS & TRENDS SECTION */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" /> Monthly Spending Trends & Analytics
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Month-over-month trajectory, cumulative volume, and seasonal patterns
                </p>
              </div>

              {/* Toggle Chart View Mode */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                <button
                  onClick={() => setChartView('spend')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    chartView === 'spend' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Spend & Tax
                </button>
                <button
                  onClick={() => setChartView('volume')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    chartView === 'volume' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Spend vs Volume
                </button>
                <button
                  onClick={() => setChartView('cumulative')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    chartView === 'cumulative' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cumulative
                </button>
              </div>
            </div>

            {/* Monthly Chart */}
            <div className="w-full h-72 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'cumulative' ? (
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-3 text-xs">
                              <p className="font-bold text-slate-900 mb-1">{d.label}</p>
                              <p className="text-emerald-600 font-semibold">Cumulative: {fmt(d.cumulative)}</p>
                              <p className="text-slate-500">Month Spend: {fmt(d.spend)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative Spend"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorCumulative)"
                    />
                  </AreaChart>
                ) : chartView === 'volume' ? (
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis
                      yAxisId="left"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-3 text-xs">
                              <p className="font-bold text-slate-900 mb-1">{d.label}</p>
                              <p className="text-emerald-600 font-semibold">Spend: {fmt(d.spend)}</p>
                              <p className="text-blue-600 font-semibold">Receipts: {d.count}</p>
                              <p className="text-slate-500">Avg ticket: {fmt(d.avgTicket)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar yAxisId="left" dataKey="spend" name="Monthly Spend ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="count" name="Receipt Count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-3 text-xs">
                              <p className="font-bold text-slate-900 mb-1">{d.label}</p>
                              <p className="text-emerald-600 font-semibold">Spend: {fmt(d.spend)}</p>
                              <p className="text-slate-500">Tax: {fmt(d.tax)}</p>
                              {d.momPercent !== null && (
                                <p
                                  className={`mt-1 font-semibold flex items-center gap-0.5 ${
                                    d.momPercent > 0 ? 'text-rose-600' : 'text-emerald-600'
                                  }`}
                                >
                                  {d.momPercent > 0 ? '+' : ''}
                                  {d.momPercent}% vs prior month
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="spend" name="Total Spend" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tax" name="Sales Tax" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Monthly Analytics Cards / Drill-down Table */}
            {monthlyData.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Month-over-Month Breakdown ({monthlyData.length} months)
                  </h3>
                  <span className="text-[11px] text-slate-400">Click any month to inspect</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {monthlyData.map((m) => (
                    <div
                      key={m.monthKey}
                      onClick={() => drillDownMonth(m.monthKey)}
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-emerald-50/60 hover:border-emerald-200 cursor-pointer transition flex flex-col justify-between group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                          {m.label}
                        </span>
                        {m.momPercent !== null ? (
                          <span
                            className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              m.momPercent > 0
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {m.momPercent > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(m.momPercent)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Base</span>
                        )}
                      </div>

                      <div className="mt-2 flex items-baseline justify-between">
                        <p className="text-lg font-bold text-slate-900">{fmt(m.spend)}</p>
                        <p className="text-[11px] text-slate-500">{m.count} receipts</p>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Avg: {fmt(m.avgTicket)}</span>
                        <span>Tax: {fmt(m.tax)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* TWO COLUMN GRID: CATEGORY BREAKDOWN & TOP MERCHANTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Category Donut & Breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-emerald-600" /> Spending by Category
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">{byCategory.length} categories</span>
                </div>

                {/* Donut Chart */}
                <div className="w-full h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {byCategory.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border border-slate-200 shadow-lg rounded-xl p-3 text-xs">
                                <p className="font-bold text-slate-900">{d.name}</p>
                                <p className="text-emerald-600 font-semibold">{fmt(d.value)}</p>
                                <p className="text-slate-500">
                                  {d.pct}% of total ({d.count} receipts)
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Progress List */}
              <div className="space-y-2.5 mt-3 pt-3 border-t border-slate-100 max-h-56 overflow-y-auto pr-1">
                {byCategory.map((cat) => (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        <span>{cat.name}</span>
                        <span className="text-slate-400 text-[10px]">({cat.count})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{fmt(cat.value)}</span>
                        <span className="text-[10px] text-slate-400 w-7 text-right">{cat.pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${cat.pct}%`, background: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Merchants Leaderboard */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-600" /> Top Merchants & Stores
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">Ranked by spend</span>
                </div>

                <div className="space-y-3 mt-2">
                  {topVendors.length === 0 ? (
                    <p className="text-xs text-slate-400 py-10 text-center">No merchant data available</p>
                  ) : (
                    topVendors.map((v, i) => (
                      <div
                        key={v.vendor}
                        onClick={() => {
                          setSelectedVendor(v.vendor);
                          setShowFilters(true);
                        }}
                        className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 font-bold text-xs text-slate-600 flex items-center justify-center">
                            #{i + 1}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                              {v.vendor}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {v.count} visits • Avg {fmt(v.avgTicket)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">{fmt(v.spend)}</p>
                          <p className="text-[10px] text-slate-400">{v.pct}% of period</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Day of Week Spend Pattern */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Day of Week Spending Heatmap
                </p>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {dayOfWeekData.map((d) => (
                    <div key={d.day} className="p-2 bg-slate-50 rounded-lg">
                      <p className="text-[10px] font-bold text-slate-500">{d.day}</p>
                      <p className="text-xs font-semibold text-slate-900 mt-1">{fmt(d.spend)}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{d.count} rcpts</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECONDARY ROW: TAGS BREAKDOWN & RECENT FILTERED RECEIPTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Custom Tag Breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" /> Spending by Custom Tag
              </h2>
              {byTag.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs">No receipts with tags in this selection</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Tag receipts with #business, #dining, etc.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {byTag.map(({ tag, amount, count, pct }) => (
                    <div
                      key={tag}
                      onClick={() => {
                        setSelectedTag(tag);
                        setShowFilters(true);
                      }}
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 cursor-pointer transition"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <span className="text-emerald-600">#</span>
                          {tag}
                          <span className="text-[10px] text-slate-400 font-normal">({count})</span>
                        </span>
                        <span className="font-bold text-slate-900">{fmt(amount)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filtered Receipts Inspector / Top Transactions */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-emerald-600" /> Transactions in Period ({filteredReceipts.length})
                </h2>
                <span className="text-xs text-slate-400">Click to view or edit</span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {filteredReceipts.slice(0, 15).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setActiveReceipt(r)}
                    className="p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        {r.vendor_name ? r.vendor_name.charAt(0).toUpperCase() : 'R'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{r.vendor_name}</p>
                        <p className="text-[10px] text-slate-400">
                          {r.transaction_date} • {r.category || 'General'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-900">{fmt(Number(r.total_amount))}</p>
                      {r.tax_amount ? (
                        <p className="text-[10px] text-slate-400">Tax: {fmt(Number(r.tax_amount))}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
                {filteredReceipts.length > 15 && (
                  <p className="text-center text-[11px] text-slate-400 pt-2">
                    Showing top 15 of {filteredReceipts.length} receipts • Use CSV export for full data
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Receipt Detail Modal */}
      {activeReceipt && (
        <ReceiptDetailModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
          onDeleted={(deletedId) => {
            setReceipts((prev) => prev.filter((r) => r.id !== deletedId));
            setActiveReceipt(null);
          }}
          onUpdated={(updated) => {
            setReceipts((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setActiveReceipt(updated);
          }}
        />
      )}
    </div>
  );
}
