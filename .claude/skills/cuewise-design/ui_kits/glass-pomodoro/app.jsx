/* Cuewise — Pomodoro focus screen. Uses window.Icon. */
const { useState, useEffect, useRef } = React;
const I = window.Icon;

const QUOTES = [
  { text: 'Success is walking from failure to failure with no loss of enthusiasm.', author: 'Winston Churchill', category: 'leadership' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain', category: 'productivity' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela', category: 'resilience' },
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function TimerCard() {
  const TOTAL = 25 * 60;
  const [remaining, setRemaining] = useState(24 * 60 + 49);
  const [running, setRunning] = useState(true);
  const tick = useRef(null);

  useEffect(() => {
    if (running) {
      tick.current = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    }
    return () => clearInterval(tick.current);
  }, [running]);

  const progress = ((TOTAL - remaining) / TOTAL) * 100;
  const R = 120, C = 2 * Math.PI * R;

  return (
    <div className="timer-card">
      <div className="tc-head">
        <span className="head-chip"><I name="Timer" size={24} color="var(--color-primary-600)" /></span>
        <div>
          <h2 className="tc-title">Pomodoro Timer</h2>
          <p className="tc-sub">Focus Session</p>
        </div>
      </div>

      <div className="ring-wrap">
        <svg width="256" height="256" viewBox="0 0 256 256" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="128" cy="128" r={R} fill="none" stroke="var(--color-divider)" strokeWidth="8" />
          <circle cx="128" cy="128" r={R} fill="none" stroke="var(--color-primary-600)" strokeWidth="8"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress / 100)}
            style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="ring-center">
          <div className="ring-time">{fmt(remaining)}</div>
          <div className="ring-label">WORK</div>
        </div>
      </div>

      <div className="status-pill">In progress</div>

      <div className="tc-controls">
        <button className="ctrl-main" onClick={() => setRunning((r) => !r)}>
          <I name={running ? 'Pause' : 'Play'} size={20} color="#fff" />
          <span>{running ? 'Pause' : 'Resume'}</span>
        </button>
        <button className="ctrl-icon" onClick={() => { setRemaining(TOTAL); setRunning(false); }} title="Reset"><I name="RotateCcw" size={20} /></button>
        <button className="ctrl-icon" title="Skip"><I name="SkipForward" size={20} /></button>
      </div>

      <p className="tc-help">Focus for <b>25 minutes</b>, then take a <b>5-minute</b> break</p>
    </div>
  );
}

function QuoteBlock() {
  const [i, setI] = useState(0);
  const [fav, setFav] = useState(false);
  const q = QUOTES[i];
  const next = () => { setI((p) => (p + 1) % QUOTES.length); setFav(false); };
  const fontSize = q.text.length < 60 ? 44 : 34;
  return (
    <div className="quote-wrap">
      <div className="badge-row"><span className="cat-badge" style={{ background: `var(--category-${q.category})` }}>{cap(q.category)}</span></div>
      <p className="quote-text" style={{ fontSize }}>{q.text}</p>
      <p className="quote-author">— {q.author}</p>
      <div className="quote-actions">
        <button className={'qa' + (fav ? ' qa-fav' : '')} onClick={() => setFav((f) => !f)}><I name="Heart" size={16} {...(fav ? { fill: 'currentColor' } : {})} /></button>
        <button className="qa qa-pill" onClick={next}><I name="RefreshCw" size={18} /> New Quote</button>
        <button className="qa"><I name="EyeOff" size={16} /></button>
      </div>
      <p className="views">Viewed 596 times</p>
    </div>
  );
}

function Pomodoro() {
  return (
    <div className="pomo-page">
      <a className="back-link" href="../new-tab/index.html"><I name="ArrowLeft" size={20} /></a>
      <div className="pomo-grid">
        <TimerCard />
        <QuoteBlock />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Pomodoro />);
