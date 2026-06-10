/* Cuewise — Glass New Tab (frosted surfaces over a photo). Uses window.Icon. */
const { useState, useEffect, useRef } = React;
const I = window.Icon;

// Self-contained mesh backdrops (ship in /assets). These read as the product's
// "minimal" gradient category. For live photo categories, the real app pulls
// curated Unsplash images (nature/forest/ocean/mountains) via unsplash.ts.
const BACKDROPS = {
  Aurora: '../../assets/bg-aurora.png',
  Dusk: '../../assets/bg-dusk.png',
  Mist: '../../assets/bg-mist.png',
};
const CATS = Object.keys(BACKDROPS);

const QUOTES = [
  { text: 'The worst enemy to creativity is self-doubt.', author: 'Sylvia Plath', category: 'creativity' },
  { text: 'Success is walking from failure to failure with no loss of enthusiasm.', author: 'Winston Churchill', category: 'leadership' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin', category: 'growth' },
  { text: 'Mindfulness is a way of befriending ourselves and our experience.', author: 'Jon Kabat-Zinn', category: 'mindfulness' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Loader() {
  return (
    <div className="loader">
      <div className="loader-chip"><I name="Coffee" size={52} color="rgba(255,255,255,0.92)" /></div>
      <div className="loader-text">Brewing your view
        <span className="dot d1">.</span><span className="dot d2">.</span><span className="dot d3">.</span>
      </div>
    </div>
  );
}

function FloatingNav({ cat, setCat }) {
  return (
    <nav className="g-nav">
      <div className="cat-switch">
        {CATS.map((c) => (
          <button key={c} className={'cat-pill' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <button className="g-pill" title="Pomodoro"><I name="Timer" size={20} color="#fff" /><span>Pomodoro</span></button>
      <button className="g-circle" title="Menu"><I name="Settings" size={20} color="#fff" /></button>
    </nav>
  );
}

function QuoteBlock() {
  const [i, setI] = useState(0);
  const [fav, setFav] = useState(false);
  const [fade, setFade] = useState(true);
  const q = QUOTES[i];
  const next = () => { setFade(false); setTimeout(() => { setI((p) => (p + 1) % QUOTES.length); setFav(false); setFade(true); }, 180); };
  const fs = q.text.length < 50 ? 50 : q.text.length < 85 ? 40 : 32;
  return (
    <div className="g-quote">
      <div className="badge-row"><span className="cat-badge" style={{ background: `var(--category-${q.category})` }}>{cap(q.category)}</span></div>
      <div className={'qbody' + (fade ? ' in' : '')}>
        <p className="qtext" style={{ fontSize: fs }}>{q.text}</p>
        <p className="qauthor">— {q.author}</p>
      </div>
      <div className="qactions">
        <button className={'qa' + (fav ? ' fav' : '')} onClick={() => setFav((f) => !f)}><I name="Heart" size={16} color="#fff" {...(fav ? { fill: '#fff' } : {})} /></button>
        <button className="qa pill" onClick={next}><I name="RefreshCw" size={18} color="#fff" /> New Quote</button>
        <button className="qa"><I name="EyeOff" size={16} color="#fff" /></button>
      </div>
    </div>
  );
}

const SEED = [
  { id: 1, text: 'Ship the Glass theme polish', done: false },
  { id: 2, text: 'Review focus-mode backgrounds', done: false },
  { id: 3, text: 'Morning meditation — 10 minutes', done: true },
];
function FocusCard() {
  const [tasks, setTasks] = useState(SEED);
  const [draft, setDraft] = useState('');
  const total = 5, completed = tasks.filter((t) => t.done).length;
  const add = () => { if (!draft.trim()) return; setTasks((t) => [...t, { id: Date.now(), text: draft.trim(), done: false }]); setDraft(''); };
  const toggle = (id) => setTasks((t) => t.map((x) => x.id === id ? { ...x, done: !x.done } : x));
  return (
    <div className="g-card">
      <div className="g-card-head">
        <span className="g-chip"><I name="Target" size={22} color="#fff" /></span>
        <div><h2 className="g-title">Today's Focus</h2><p className="g-sub">What matters most today?</p></div>
      </div>
      <div className="g-input-row">
        <input className="g-input" placeholder="What do you want to focus on today?" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="g-add" onClick={add}><I name="Plus" size={18} color="#fff" /> Add</button>
      </div>
      <div className="g-prog-meta"><span>Progress</span><span>{completed} of {total} completed</span></div>
      <div className="g-track"><div className="g-fill" style={{ width: (completed / total) * 100 + '%' }} /></div>
      <div className="g-tasks">
        {tasks.map((t) => (
          <button key={t.id} className={'g-task' + (t.done ? ' done' : '')} onClick={() => toggle(t.id)}>
            <I name={t.done ? 'CheckCircle' : 'Circle'} size={22} color={t.done ? '#fff' : 'rgba(255,255,255,0.55)'} />
            <span>{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Aurora');
  const photo = BACKDROPS[cat];

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 750);
    return () => clearTimeout(t);
  }, [photo]);

  const pickCat = (c) => setCat(c);

  return (
    <div className="glass-root" data-theme="glass">
      <img className="bg-photo" src={photo} alt="" />
      <div className="bg-scrim" />
      {loading && <Loader />}
      <div className="content">
        <FloatingNav cat={cat} setCat={pickCat} />
        <div className="g-center">
          <div className="clock-block">
            <div className="clock">09:24</div>
            <p className="greeting">Good Morning</p>
            <p className="date">Monday, June 9, 2026</p>
          </div>
          <QuoteBlock />
          <FocusCard />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Home />);
