'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Loader2,
  ShoppingBag,
  Sparkles,
  Tag,
  Store,
  Calendar,
  DollarSign,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  ChevronDown,
} from 'lucide-react';

interface PurchaseItem {
  id: string;
  receipt_id: string;
  item_description: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  category: string | null;
  created_at: string;
  // Joined from receipt
  vendor_name: string;
  transaction_date: string;
  receipt_category: string;
  ai_clarified_name: string | null;
  ai_sub_category: string | null;
  ai_explanation: string | null;
}

type SortKey = 'date' | 'price_high' | 'price_low' | 'name' | 'store';

const CATEGORY_COLORS: Record<string, string> = {
  Produce: 'bg-green-50 text-green-700 border-green-200',
  'Cooking & Baking': 'bg-amber-50 text-amber-700 border-amber-200',
  'Pantry': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Snacks & Drinks': 'bg-orange-50 text-orange-700 border-orange-200',
  'Meat & Poultry': 'bg-red-50 text-red-700 border-red-200',
  'Dairy & Eggs': 'bg-sky-50 text-sky-700 border-sky-200',
  'Household & Cleaning': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Hardware & Tools': 'bg-slate-100 text-slate-700 border-slate-300',
  'Automotive': 'bg-zinc-100 text-zinc-700 border-zinc-300',
  'Personal Care': 'bg-pink-50 text-pink-700 border-pink-200',
  Groceries: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Dining: 'bg-amber-50 text-amber-700 border-amber-200',
  Electronics: 'bg-purple-50 text-purple-700 border-purple-200',
  Transportation: 'bg-blue-50 text-blue-700 border-blue-200',
  Healthcare: 'bg-rose-50 text-rose-700 border-rose-200',
  Entertainment: 'bg-violet-50 text-violet-700 border-violet-200',
};

function getCategoryStyle(cat: string | null) {
  if (!cat) return 'bg-slate-100 text-slate-600 border-slate-200';
  return CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

export default function PurchasesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'clarified' | 'raw'>('clarified');
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Fetch all receipt_items joined with their receipts
      const { data: receiptItems, error: itemsErr } = await supabase
        .from('receipt_items')
        .select(`
          id,
          receipt_id,
          item_description,
          quantity,
          unit_price,
          total_price,
          category,
          created_at,
          receipts!inner (
            vendor_name,
            transaction_date,
            category,
            raw_ocr_json,
            user_id
          )
        `)
        .eq('receipts.user_id', user.id)
        .order('created_at', { ascending: false });

      if (itemsErr) {
        console.error(itemsErr);
        setLoading(false);
        return;
      }

      const mapped: PurchaseItem[] = (receiptItems || []).map((row: any) => {
        const receipt = Array.isArray(row.receipts) ? row.receipts[0] : row.receipts;
        const aiDecoded = receipt?.raw_ocr_json?.ai_decoded;
        // Try to find the matching decoded item by original description
        let aiClarifiedName: string | null = null;
        let aiSubCategory: string | null = null;
        let aiExplanation: string | null = null;

        if (aiDecoded?.decoded_items && Array.isArray(aiDecoded.decoded_items)) {
          const match = aiDecoded.decoded_items.find(
            (d: any) =>
              d.original_description?.toLowerCase().trim() ===
              row.item_description?.toLowerCase().trim()
          );
          if (match) {
            aiClarifiedName = match.clarified_name ?? null;
            aiSubCategory = match.sub_category ?? null;
            aiExplanation = match.explanation ?? null;
          }
        }

        return {
          id: row.id,
          receipt_id: row.receipt_id,
          item_description: row.item_description,
          quantity: row.quantity,
          unit_price: row.unit_price,
          total_price: row.total_price,
          category: row.category,
          created_at: row.created_at,
          vendor_name: receipt?.vendor_name ?? 'Unknown Store',
          transaction_date: receipt?.transaction_date ?? '',
          receipt_category: receipt?.category ?? 'Other',
          ai_clarified_name: aiClarifiedName,
          ai_sub_category: aiSubCategory,
          ai_explanation: aiExplanation,
        };
      });

      setItems(mapped);
      setLoading(false);
    };

    load();
  }, []);

  // Unique categories from subcats + receipt cats
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.ai_sub_category) set.add(it.ai_sub_category);
      else if (it.category) set.add(it.category);
      else if (it.receipt_category) set.add(it.receipt_category);
    });
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items.filter((it) => {
      const displayName =
        viewMode === 'clarified' && it.ai_clarified_name
          ? it.ai_clarified_name
          : it.item_description;

      const matchesSearch =
        search === '' ||
        displayName.toLowerCase().includes(search.toLowerCase()) ||
        it.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
        (it.ai_sub_category ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (it.category ?? '').toLowerCase().includes(search.toLowerCase());

      const itemCat =
        it.ai_sub_category || it.category || it.receipt_category;
      const matchesCat =
        selectedCategory === 'ALL' || itemCat === selectedCategory;

      const price = Number(it.total_price) || 0;
      const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
      const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);

      return matchesSearch && matchesCat && matchesMin && matchesMax;
    });

    switch (sortKey) {
      case 'price_high':
        result = result.sort((a, b) => b.total_price - a.total_price);
        break;
      case 'price_low':
        result = result.sort((a, b) => a.total_price - b.total_price);
        break;
      case 'name':
        result = result.sort((a, b) => {
          const aName = a.ai_clarified_name || a.item_description;
          const bName = b.ai_clarified_name || b.item_description;
          return aName.localeCompare(bName);
        });
        break;
      case 'store':
        result = result.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
        break;
      case 'date':
      default:
        result = result.sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        );
        break;
    }

    return result;
  }, [items, search, selectedCategory, sortKey, minPrice, maxPrice, viewMode]);

  const totalSpent = useMemo(
    () => filteredItems.reduce((sum, it) => sum + (Number(it.total_price) || 0), 0),
    [filteredItems]
  );

  const hasAiData = items.some((it) => it.ai_clarified_name);

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-600" />
            What I Bought
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every item across all your receipts — searchable and sorted
          </p>
        </div>

        {hasAiData && (
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('clarified')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === 'clarified'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ✨ Plain English
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === 'raw'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Raw Names
            </button>
          </div>
        )}
      </div>

      {/* Search + Sort + Filter Row */}
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search items, stores, categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-xs transition"
            />
          </div>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none shadow-xs"
          >
            <option value="date">Latest First</option>
            <option value="price_high">Price: High → Low</option>
            <option value="price_low">Price: Low → High</option>
            <option value="name">Name A–Z</option>
            <option value="store">Store A–Z</option>
          </select>

          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-xs transition ${
              showFilters
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Price Range ($)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setMinPrice('');
                  setMaxPrice('');
                  setSelectedCategory('ALL');
                  setSearch('');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-slate-200 transition flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition border ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition border ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {!loading && filteredItems.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            <span className="font-semibold text-slate-800">{filteredItems.length}</span>{' '}
            item{filteredItems.length !== 1 ? 's' : ''}
          </span>
          <span>
            Total:{' '}
            <span className="font-bold text-emerald-600">${totalSpent.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <p className="text-sm">Loading all your purchases…</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No items found</p>
          <p className="text-xs text-slate-400 mt-1">
            {search || selectedCategory !== 'ALL'
              ? 'Try adjusting your search or filters.'
              : 'Upload some receipts to see your items here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const displayName =
              viewMode === 'clarified' && item.ai_clarified_name
                ? item.ai_clarified_name
                : item.item_description;
            const showAiBadge =
              viewMode === 'clarified' && !!item.ai_clarified_name;
            const catLabel = item.ai_sub_category || item.category || item.receipt_category;

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Item name */}
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm leading-snug">
                        {displayName}
                      </p>
                      {showAiBadge && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          <Sparkles className="w-2.5 h-2.5" />
                          AI
                        </span>
                      )}
                    </div>

                    {/* If showing clarified, show original underneath */}
                    {showAiBadge && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        Receipt: &ldquo;{item.item_description}&rdquo;
                      </p>
                    )}

                    {/* Explanation if available */}
                    {viewMode === 'clarified' && item.ai_explanation && (
                      <p className="text-[11px] text-slate-500 italic mt-0.5 line-clamp-1">
                        {item.ai_explanation}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {catLabel && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getCategoryStyle(
                            catLabel
                          )}`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {catLabel}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Store className="w-3 h-3" />
                        {item.vendor_name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        {item.transaction_date}
                      </span>
                      {item.quantity > 1 && (
                        <span className="text-[11px] text-slate-400">
                          qty {item.quantity}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-slate-900">
                      ${Number(item.total_price).toFixed(2)}
                    </p>
                    {item.unit_price && item.quantity > 1 && (
                      <p className="text-[11px] text-slate-400">
                        ${Number(item.unit_price).toFixed(2)} ea
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
