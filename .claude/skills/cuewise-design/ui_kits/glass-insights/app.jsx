/* Cuewise — Insights dashboard. Uses window.Icon. */
const I = window.Icon;

const STATS = [
  { icon: 'Flame', value: 1, label: 'Current Streak', sub: 'Longest: 1 days', tint: 'warning' },
  { icon: 'Target', value: 2, label: 'Goals Today', sub: 'This week: 2 | Month: 2', tint: 'success' },
  { icon: 'Calendar', value: 0, label: 'Pomodoros Today', sub: 'Focus sessions completed', tint: 'error' },
  { icon: 'TrendingUp', value: '57,365', label: 'Quotes Viewed', sub: 'This week: 101', tint: 'primary' },
];
const TINT = {
  warning: { bg: 'color-mix(in srgb, var(--color-warning) 20%, transparent)', fg: 'var(--color-warning)' },
  success: { bg: 'color-mix(in srgb, var(--color-success) 18%, transparent)', fg: 'var(--color-success)' },
  error: { bg: 'color-mix(in srgb, var(--color-error) 16%, transparent)', fg: 'var(--color-error)' },
  primary: { bg: 'var(--color-primary-100)', fg: 'var(--color-primary-600)' },
};
const CATS = [
  ['Inspiration', 'inspiration', 5756], ['Learning', 'learning', 5640],
  ['Productivity', 'productivity', 5789], ['Mindfulness', 'mindfulness', 5716],
  ['Success', 'success', 5654], ['Creativity', 'creativity', 5869],
  ['Resilience', 'resilience', 5606], ['Leadership', 'leadership', 5752],
  ['Health', 'health', 5781], ['Growth', 'growth', 5802],
];
const MAX = Math.max(...CATS.map((c) => c[2]));

function StatTile({ icon, value, label, sub, tint }) {
  const t = TINT[tint];
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-chip" style={{ background: t.bg }}><I name={icon} size={22} color={t.fg} /></span>
        <span className="stat-val" style={{ color: t.fg }}>{value}</span>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function Insights() {
  return (
    <div className="insights">
      <header className="ins-head">
        <span className="ins-chip"><I name="BarChart3" size={26} color="var(--color-primary-600)" /></span>
        <div>
          <h1 className="ins-title">Your Insights</h1>
          <p className="ins-sub">Track your productivity journey and celebrate your progress</p>
        </div>
      </header>

      <div className="stat-grid">
        {STATS.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <div className="panel">
        <div className="panel-head">
          <I name="Award" size={24} color="var(--color-primary-600)" />
          <h2 className="panel-title">Category Insights</h2>
        </div>
        <div className="callout">
          Your most viewed category is <b>Creativity</b> with 5,869 views
        </div>
        <div className="cat-grid">
          {CATS.map(([label, key, count]) => (
            <div className="cat-row" key={key}>
              <span className="cat-name">{label}</span>
              <div className="cat-track">
                <div className="cat-fill" style={{ width: (count / MAX) * 100 + '%', background: `var(--category-${key})` }} />
                <span className="cat-count">{count.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="achieve">
        <h2 className="achieve-title">Your Achievement Summary</h2>
        <div className="achieve-grid">
          <div><div className="ach-num">1</div><div className="ach-lbl">Longest Streak</div></div>
          <div><div className="ach-num">2</div><div className="ach-lbl">Goals This Month</div></div>
          <div><div className="ach-num">57,365</div><div className="ach-lbl">Total Inspiration</div></div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Insights />);
