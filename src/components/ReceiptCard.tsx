import { Receipt } from '@/lib/types';
import { Calendar, ChevronRight, ShoppingBag } from 'lucide-react';

interface Props {
  receipt: Receipt;
  onClick: () => void;
}

export default function ReceiptCard({ receipt, onClick }: Props) {
  const formattedDate = receipt.transaction_date;
  const formattedTotal = Number(receipt.total_amount).toFixed(2);

  // Dynamic category badge colors
  const getBadgeStyle = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'groceries':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'dining':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'transportation':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'electronics':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'utilities':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div
      onClick={onClick}
      className="group p-4 bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition cursor-pointer flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:border-emerald-200 transition flex-shrink-0">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition">
            {receipt.vendor_name}
          </h4>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formattedDate}
            </span>
            <span>•</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${getBadgeStyle(
                receipt.category
              )}`}
            >
              {receipt.category}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <span className="text-base font-bold text-slate-900">${formattedTotal}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition" />
      </div>
    </div>
  );
}
