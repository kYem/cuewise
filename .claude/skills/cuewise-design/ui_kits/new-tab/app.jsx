/* Cuewise — New Tab home (flagship view). Uses window.Icon. */
const { useState, useEffect, useRef } = React;
const I = window.Icon;

const QUOTES = [
  { text: 'The worst enemy to creativity is self-doubt.', author: 'Sylvia Plath', category: 'creativity' },
  { text: 'Success is walking from failure to failure with no loss of enthusiasm.', author: 'Winston Churchill', category: 'leadership' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin', category: 'growth' },
  { text: 'Mindfulness is a way of befriending ourselves and our experience.', author: 'Jon Kabat-Zinn', category: 'mindfulness' },
  { text: 'Your mind is for having ideas, not holding them.', author: 'David Allen', category: 'productivity' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Floating chrome ---------- */
function FloatingNav() {
  return (
    <nav className="floating-nav">
      <button className="pill-btn" title="Pomodoro">
        <I name="Timer" size={20} color="var(--color-primary-600)" />
        <span>Pomodoro</span>
      </button>
      <button className="icon-circle" title="Menu"><I name="Settings" size={20} /></button>
    </nav>
  );
}

function ObjectivesButton() {
  return (
    <button className="obj-btn" title="Objectives">
      <I name="Flag" size={18} color="var(--color-primary-600)" />
      <span>Objectives</span>
      <span className="obj-count">3</span>
    </button>
  );
}

/* ---------- Quote ---------- */
function QuoteBlock() {
  const [i, setI] = useState(0);
  const [fav, setFav] = useState(false);
  const [views, setViews] = useState(588);
  const [fade, setFade] = useState(true);
  const q = QUOTES[i];

  const next = () => {
    setFade(false);
    setTimeout(() => {
      setI((p) => (p + 1) % QUOTES.length);
      setViews((v) => v + Math.floor(2 + Math.random() * 9));
      setFav(false);
      setFade(true);
    }, 180);
  };
  const prev = () => { setI((p) => (p - 1 + QUOTES.length) % QUOTES.length); setFav(false); };

  const fontSize = q.text.length < 50 ? 48 : q.text.length < 80 ? 40 : 32;

  return (
    <div className="quote-wrap">
      <div className="badge-row">
        <span className="cat-badge" style={{ background: `var(--category-${q.category})` }}>{cap(q.category)}</span>
      </div>
      <div className={'quote-body' + (fade ? ' in' : '')}>
        <p className="quote-text" style={{ fontSize }}>{q.text}</p>
        <p className="quote-author">— {q.author}</p>
      </div>
      <div className="quote-actions">
        <button className="qa" onClick={prev} title="Previous"><I name="ChevronLeft" size={16} /></button>
        <button className="qa qa-main" onClick={next} title="New quote"><I name="RefreshCw" size={20} /></button>
        <button className="qa" onClick={next} title="Next"><I name="ChevronRight" size={16} /></button>
        <span className="qa-sep" />
        <button className={'qa' + (fav ? ' qa-fav' : '')} onClick={() => setFav((f) => !f)} title="Favorite">
          <I name="Heart" size={16} {...(fav ? { fill: 'currentColor' } : {})} />
        </button>
        <button className="qa" title="Filter"><I name="Filter" size={16} /></button>
        <button className="qa" title="Hide"><I name="EyeOff" size={16} /></button>
      </div>
      <p className="views">Viewed {views} times</p>
    </div>
  );
}

/* ---------- Goals ---------- */
const SEED = [
  { id: 1, text: 'Complete MVP version of chrome extension', done: false },
  { id: 2, text: 'Reply to customer email about next project', done: false },
  { id: 3, text: 'Outline Q3 production roadmap', done: false },
  { id: 4, text: 'Morning meditation — 10 minutes', done: true },
  { id: 5, text: 'Review pull requests', done: true },
];

function GoalsCard() {
  const [tasks, setTasks] = useState(SEED);
  const [draft, setDraft] = useState('');
  const total = 8;
  const completed = tasks.filter((t) => t.done).length;
  const pct = (completed / total) * 100;

  const add = () => {
    if (!draft.trim()) return;
    setTasks((t) => [...t, { id: Date.now(), text: draft.trim(), done: false }]);
    setDraft('');
  };
  const toggle = (id) => setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));

  return (
    <div className="card focus-card">
      <div className="card-head">
        <span className="head-chip"><I name="Target" size={22} color="var(--color-primary-600)" /></span>
        <div>
          <h2 className="card-title">Today's Focus</h2>
          <p className="card-sub">What matters most today?</p>
        </div>
      </div>
      <div className="goal-input-row">
        <input className="goal-input" placeholder="What do you want to focus on today?"
          value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="add-btn" onClick={add}><I name="Plus" size={18} /> Add</button>
      </div>
      <div className="progress-meta">
        <span>Progress</span>
        <span className="progress-count">{completed} of {total} completed</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: pct + '%' }} /></div>
      <div className="task-list">
        {tasks.map((t) => (
          <button key={t.id} className={'task' + (t.done ? ' done' : '')} onClick={() => toggle(t.id)}>
            {t.done
              ? <I name="CheckCircle" size={22} color="var(--color-primary-600)" />
              : <I name="Circle" size={22} color="var(--color-text-tertiary)" />}
            <span className="task-text">{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Reminders ---------- */
function RemindersCard() {
  return (
    <div className="card">
      <div className="card-head">
        <span className="head-chip"><I name="Bell" size={22} color="var(--color-primary-600)" /></span>
        <div className="grow">
          <h2 className="card-title">Reminders</h2>
          <p className="card-sub">Stay on top of what matters</p>
        </div>
        <button className="add-fab-sm"><I name="Plus" size={18} color="#fff" /></button>
      </div>
      <p className="rem-group overdue">OVERDUE (1)</p>
      <div className="reminder">
        <span className="rem-circle" />
        <div>
          <p className="rem-text">Send out confirmation email</p>
          <p className="rem-meta"><I name="Clock" size={13} /> Today at 7:25 PM</p>
        </div>
      </div>
      <p className="rem-group">UPCOMING (1)</p>
      <div className="reminder">
        <span className="rem-circle" />
        <div>
          <p className="rem-text">Review next day priority list</p>
          <p className="rem-meta"><I name="Clock" size={13} /> Tomorrow at 8:00 PM
            <span className="daily"><I name="Repeat" size={11} /> Daily</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Home() {
  const now = new Date();
  now.setHours(9, 24);
  const time = '09:24';
  return (
    <div className="home">
      <ObjectivesButton />
      <FloatingNav />
      <div className="center-col">
        <div className="clock-block">
          <div className="clock">{time}</div>
          <p className="greeting">Good Morning</p>
          <p className="date">Monday, June 9, 2026</p>
        </div>
        <QuoteBlock />
        <div className="two-col">
          <GoalsCard />
          <RemindersCard />
        </div>
      </div>
      <button className="add-fab" title="Quick add"><I name="Plus" size={26} color="#fff" /></button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Home />);
