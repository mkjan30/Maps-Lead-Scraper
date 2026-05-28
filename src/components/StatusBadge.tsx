import type { ScrapeStatus } from '../types';

interface Props {
  status: ScrapeStatus;
}

const config: Record<ScrapeStatus, { label: string; color: string; dot: string }> = {
  idle: { label: 'Ready', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  running: { label: 'Scraping', color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', color: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  error: { label: 'Error', color: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
};

export function StatusBadge({ status }: Props) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
