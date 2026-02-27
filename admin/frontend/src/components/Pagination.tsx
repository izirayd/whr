import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-slate-500 font-mono">
        {((page - 1) * pageSize + 1).toLocaleString()}
        &ndash;
        {Math.min(page * pageSize, total).toLocaleString()}
        {' '}of{' '}
        {total.toLocaleString()}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dot-${i}`} className="px-1.5 text-slate-600 text-xs">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={clsx(
                'min-w-[32px] h-8 rounded-md text-xs font-medium transition-all',
                p === page
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function buildPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}
