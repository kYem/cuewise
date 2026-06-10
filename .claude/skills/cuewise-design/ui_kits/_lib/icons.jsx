/* Cuewise UI-kit shared icon set — Lucide path data (2px outline).
   Renders an inline SVG so kits stay self-contained/offline.
   Usage: <Icon name="RefreshCw" size={20} /> ; exported to window.Icon */
(function () {
  const P = {
    RefreshCw: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
    Heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
    EyeOff: ['M10.73 5.07a10.7 10.7 0 0 1 11.2 6.58 1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.44 2.49', 'M14.08 14.16a3 3 0 0 1-4.24-4.24', 'M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14', 'm2 2 20 20'],
    ChevronLeft: ['m15 18-6-6 6-6'],
    ChevronRight: ['m9 18 6-6-6-6'],
    ChevronDown: ['m6 9 6 6 6-6'],
    Settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', '__circle:12,12,3'],
    Settings2: ['M20 7h-9', 'M14 17H5', '__circle:17,17,3', '__circle:7,7,3'],
    Timer: ['M10 2h4', 'M12 14l3-3', '__circle:12,14,8'],
    Flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    BookMarked: ['M10 2v8l3-3 3 3V2', 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'],
    BarChart3: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
    Target: ['__circle:12,12,10', '__circle:12,12,6', '__circle:12,12,2'],
    Plus: ['M5 12h14', 'M12 5v14'],
    Bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
    Check: ['M20 6 9 17l-5-5'],
    Circle: ['__circle:12,12,10'],
    CheckCircle: ['M21.8 10A10 10 0 1 1 17 3.34', 'm9 11 3 3L22 4'],
    Play: ['M6 3v18l14-9z'],
    Pause: ['__rect:6,4,4,16,1', '__rect:14,4,4,16,1'],
    RotateCcw: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    SkipForward: ['M6 4l10 8-10 8z', 'M20 4v16'],
    Sun: ['__circle:12,12,4', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
    Award: ['__circle:12,8,6', 'M15.48 12.89 17 22l-5-3-5 3 1.52-9.11'],
    TrendingUp: ['M16 7h6v6', 'm22 7-8.5 8.5-5-5L2 17'],
    Flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
    ArrowLeft: ['m12 19-7-7 7-7', 'M19 12H5'],
    ArrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
    Search: ['__circle:11,11,8', 'm21 21-4.3-4.3'],
    X: ['M18 6 6 18', 'M6 6l12 12'],
    Coffee: ['M10 2v2', 'M14 2v2', 'M6 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'],
    Filter: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
    Calendar: ['M8 2v4', 'M16 2v4', '__rect:3,4,18,18,2', 'M3 10h18'],
    Clock: ['__circle:12,12,10', 'M12 6v6l4 2'],
    Repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
    PanelRight: ['__rect:3,3,18,18,2', 'M15 3v18'],
    Maximize2: ['M15 3h6v6', 'M9 21H3v-6', 'm21 3-7 7', 'm3 21 7-7'],
    Pencil: ['M21.17 6.83a2.83 2.83 0 0 0-4-4L3 17v4h4z', 'm15 5 4 4'],
    Trash2: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    List: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    Quote: ['M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.24 0-2 .76-2 2v3c0 1.24.76 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.01V20c0 1 0 1 1 1z', 'M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.24 0-2 .76-2 2v3c0 1.24.76 2 2 2h.01c.99 0 .99 0 .99 1v1c0 1-1 2-2 2s-1 .01-1 1.01V20c0 1 0 1 1 1z'],
  };

  function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2, style, ...rest }) {
    const node = P[name] || [];
    const children = node.map((d, i) => {
      if (typeof d === 'string' && d.startsWith('__circle:')) {
        const [cx, cy, r] = d.slice(9).split(',');
        return React.createElement('circle', { key: i, cx, cy, r });
      }
      if (typeof d === 'string' && d.startsWith('__rect:')) {
        const [x, y, w, h, rx] = d.slice(7).split(',');
        return React.createElement('rect', { key: i, x, y, width: w, height: h, rx });
      }
      return React.createElement('path', { key: i, d });
    });
    return React.createElement(
      'svg',
      {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
        style, ...rest,
      },
      children
    );
  }
  window.Icon = Icon;
})();
