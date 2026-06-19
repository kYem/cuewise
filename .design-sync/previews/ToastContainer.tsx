import type { Toast } from '@cuewise/ui';
import { ToastContainer } from '@cuewise/ui';

const TOASTS: Toast[] = [
  { id: '1', type: 'success', message: 'Goal saved.' },
  { id: '2', type: 'info', message: 'Synced across your devices.' },
  { id: '3', type: 'warning', message: 'Session ends in 5 minutes.' },
  { id: '4', type: 'error', message: 'Could not reach the server.' },
];

// ToastContainer is position:fixed; a transformed ancestor scopes that to this
// box so the stack renders inside the card instead of escaping to the viewport.
export const Notifications = () => (
  <div style={{ position: 'relative', transform: 'translateZ(0)', width: 360, minHeight: 380 }}>
    <ToastContainer toasts={TOASTS} onClose={() => {}} position="top-left" />
  </div>
);
