import { type ConceptStats, getConceptStats } from '@cuewise/shared';
import { AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';

const StatCard: React.FC<{ label: string; value: string | number; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
    <p className="text-sm text-secondary">{label}</p>
    <p className="mt-1 text-3xl font-bold text-primary tabular-nums">{value}</p>
    {hint ? <p className="mt-1 text-xs text-tertiary">{hint}</p> : null}
  </div>
);

const CompositionItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex-1 text-center">
    <p className="text-2xl font-semibold text-primary tabular-nums">{value}</p>
    <p className="text-xs text-secondary">{label}</p>
  </div>
);

export const ConceptInsights: React.FC = () => {
  // The store is initialized + gated (cards present) by InsightsPage before this
  // renders, so no init is needed here.
  const cards = useConceptCardsStore((state) => state.cards);
  const stats: ConceptStats = useMemo(() => getConceptStats(cards, new Date()), [cards]);

  if (stats.total === 0) {
    return <div className="text-secondary">No concept cards yet.</div>;
  }

  const maxForecast = Math.max(1, ...stats.dueForecast.map((day) => day.count));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard label="Due now" value={stats.due} />
        <StatCard label="Total cards" value={stats.total} />
        <StatCard
          label="Retention"
          value={stats.retentionPct === null ? '—' : `${stats.retentionPct}%`}
          hint="reviewed cards never forgotten"
        />
        <StatCard
          label="Avg ease"
          value={stats.avgEase === null ? '—' : stats.avgEase.toFixed(2)}
        />
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-secondary">Deck composition</h3>
        <div className="flex">
          <CompositionItem label="New" value={stats.newCount} />
          <CompositionItem label="Learning" value={stats.learning} />
          <CompositionItem label="Mastered" value={stats.mastered} />
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-secondary">Due next 7 days</h3>
        <div className="flex items-end gap-2 h-28">
          {stats.dueForecast.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs text-tertiary tabular-nums">{day.count}</span>
              <div
                className="w-full rounded-t bg-primary-600"
                style={{ height: `${(day.count / maxForecast) * 80}px` }}
              />
              <span className="text-[10px] text-tertiary">{day.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {stats.needsAttention.length > 0 ? (
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary">
            <AlertTriangle className="w-4 h-4 text-warning" /> Needs attention
          </h3>
          <ul className="space-y-2">
            {stats.needsAttention.slice(0, 5).map((concept) => (
              <li key={concept.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-primary">{concept.term}</span>
                <span className="flex-shrink-0 text-xs text-tertiary tabular-nums">
                  {concept.schedule.lapses} lapses
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
