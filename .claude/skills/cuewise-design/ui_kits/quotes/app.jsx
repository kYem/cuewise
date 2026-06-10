/* Cuewise — Quote Management library. Uses window.Icon. */
const { useState } = React;
const I = window.Icon;

const QUOTES = [
  { text: 'Mindfulness is a way of befriending ourselves and our experience.', author: 'Jon Kabat-Zinn', category: 'mindfulness', views: 631, fav: true },
  { text: 'Your mind is for having ideas, not holding them.', author: 'David Allen', category: 'productivity', views: 624, fav: true },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin', category: 'growth', views: 586, fav: true },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James', category: 'inspiration', views: 580, fav: true },
  { text: 'I find that the harder I work, the more luck I seem to have.', author: 'Thomas Jefferson', category: 'leadership', views: 571, fav: true },
  { text: 'A business is a repeatable process that makes money. Everything else is a hobby.', author: 'Paul Freet', category: 'success', views: 2, fav: true, custom: true },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TABS = ['All', 'Custom', 'Default', 'Favorites', 'Hidden'];
const STATS = [
  { n: 101, l: 'Total Quotes', tint: 'var(--color-primary-600)', bg: 'var(--color-primary-50)' },
  { n: 1, l: 'Custom Quotes', tint: 'var(--category-learning)', bg: 'color-mix(in srgb, var(--category-learning) 10%, transparent)' },
  { n: 6, l: 'Favorites', tint: 'var(--color-error)', bg: 'color-mix(in srgb, var(--color-error) 9%, transparent)' },
  { n: 1, l: 'Hidden', tint: 'var(--color-text-secondary)', bg: 'var(--color-surface-variant)' },
];

function QuoteCard({ q }) {
  const [fav, setFav] = useState(q.fav);
  return (
    <div className="qcard">
      <div className="qcard-top">
        <span className="cat-badge" style={{ background: `var(--category-${q.category})` }}>{cap(q.category)}</span>
        {q.custom && <span className="custom-tag">Custom</span>}
      </div>
      <p className="qcard-text">"{q.text}"</p>
      <p className="qcard-author">— {q.author}</p>
      <p className="qcard-meta">Views: {q.views}　Last: 09/06/2026</p>
      <div className="qcard-actions">
        <button className={'qact' + (fav ? ' on' : '')} onClick={() => setFav((f) => !f)}>
          <I name="Heart" size={16} {...(fav ? { fill: 'currentColor' } : {})} />
        </button>
        <button className="qact"><I name="EyeOff" size={16} /></button>
        {q.custom && <span className="qact-spacer" />}
        {q.custom && <button className="qact edit"><I name="Pencil" size={15} /></button>}
        {q.custom && <button className="qact del"><I name="Trash2" size={15} /></button>}
      </div>
    </div>
  );
}

function QuoteManagement() {
  const [tab, setTab] = useState('All');
  return (
    <div className="qm">
      <header className="qm-head">
        <a className="back-link" href="../new-tab/index.html"><I name="ArrowLeft" size={22} /></a>
        <div className="grow">
          <h1 className="qm-title">Quote Management</h1>
          <p className="qm-sub">Manage your collection of 101 quotes</p>
        </div>
        <button className="add-quote"><I name="Plus" size={18} color="#fff" /> Add Quote</button>
      </header>

      <div className="qm-stats">
        {STATS.map((s) => (
          <div className="qm-stat" key={s.l} style={{ background: s.bg }}>
            <div className="qm-stat-n" style={{ color: s.tint }}>{s.n}</div>
            <div className="qm-stat-l" style={{ color: s.tint }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="search">
        <I name="Search" size={18} color="var(--color-text-tertiary)" />
        <input placeholder="Search quotes by text, author, source, or notes..." />
      </div>

      <div className="filter-row">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={'tab' + (t === tab ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="cat-select">All Categories <I name="ChevronDown" size={16} /></div>
      </div>
      <p className="showing">Showing 100 quotes</p>

      <div className="qcard-grid">
        {QUOTES.map((q, i) => <QuoteCard key={i} q={q} />)}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<QuoteManagement />);
