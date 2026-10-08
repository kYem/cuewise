import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  './utils/image-preload-cache',
  async () => (await import('./__fixtures__/app-module-stubs')).imagePreloadCacheStub
);
vi.mock(
  './utils/unsplash',
  async () => (await import('./__fixtures__/app-module-stubs')).unsplashStub
);

import { installAppRenderStubs } from './__fixtures__/app-render.fixtures';
import App from './App';
import { useFocusModeStore } from './stores/focus-mode-store';

/** A fresh profile opens on the welcome modal, which holds every shortcut until it is closed. */
async function renderHome() {
  render(<App />);
  await screen.findByRole('dialog', { name: 'Welcome to Cuewise' });
  fireEvent.click(screen.getByRole('button', { name: 'Close welcome modal' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Welcome to Cuewise' })).not.toBeInTheDocument()
  );
}

describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    installAppRenderStubs();
    window.location.hash = '';
    useFocusModeStore.setState({ isActive: false });
  });

  it('s opens settings and closes the menu', async () => {
    await renderHome();
    fireEvent.click(screen.getAllByTitle('Menu')[0]);
    expect(screen.getAllByRole('menu').length).toBeGreaterThan(0);

    fireEvent.keyDown(document.body, { key: 's' });

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('f opens Pomodoro in focus mode', async () => {
    await renderHome();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'f' });
    });

    expect(useFocusModeStore.getState().isActive).toBe(true);
    expect(window.location.hash).toBe('#pomodoro');
  });

  it('leaves s and f alone off the home page', async () => {
    await renderHome();
    await act(async () => {
      window.location.hash = 'insights';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(document.body, { key: 'f' });

    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    expect(useFocusModeStore.getState().isActive).toBe(false);
    expect(window.location.hash).toBe('#insights');
  });

  it('the menu opens the cheat sheet', async () => {
    await renderHome();
    fireEvent.click(screen.getAllByTitle('Menu')[0]);

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Keyboard shortcuts' })[0]);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
