import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  LiveIds,
  RegisterAction,
  RunButton,
  renderWithShortcuts,
} from './__fixtures__/shortcuts.fixtures';
import { ShortcutProvider } from './ShortcutProvider';

describe('ShortcutProvider registry', () => {
  it('lists an action only while a component has registered it', () => {
    const { rerender } = renderWithShortcuts(
      <>
        <RegisterAction id="settings" run={vi.fn()} />
        <LiveIds />
      </>
    );
    expect(screen.getByTestId('live')).toHaveTextContent('settings');

    rerender(
      <ShortcutProvider>
        <LiveIds />
      </ShortcutProvider>
    );
    expect(screen.getByTestId('live')).not.toHaveTextContent('settings');
  });

  it('treats a null handler as not live', () => {
    renderWithShortcuts(
      <>
        <RegisterAction id="goal.add" run={null} />
        <LiveIds />
      </>
    );

    expect(screen.getByTestId('live')).not.toHaveTextContent('goal.add');
  });

  it('runs the latest handler a component passed', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderWithShortcuts(
      <>
        <RegisterAction id="settings" run={first} />
        <RunButton id="settings" />
      </>
    );
    rerender(
      <ShortcutProvider>
        <RegisterAction id="settings" run={second} />
        <RunButton id="settings" />
      </ShortcutProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'run settings' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('keeps the newer handler when an older one unmounts after it', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const { rerender } = renderWithShortcuts(
      <>
        <RegisterAction id="settings" run={older} />
        <RegisterAction key="newer" id="settings" run={newer} />
        <LiveIds />
        <RunButton id="settings" />
      </>
    );
    rerender(
      <ShortcutProvider>
        <RegisterAction key="newer" id="settings" run={newer} />
        <LiveIds />
        <RunButton id="settings" />
      </ShortcutProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'run settings' }));

    expect(screen.getByTestId('live')).toHaveTextContent('settings');
    expect(newer).toHaveBeenCalledOnce();
    expect(older).not.toHaveBeenCalled();
  });

  it('always offers navigation and help', () => {
    renderWithShortcuts(<LiveIds />);

    expect(screen.getByTestId('live')).toHaveTextContent('go.pomodoro');
    expect(screen.getByTestId('live')).toHaveTextContent('help');
  });

  it('navigates by hash', () => {
    window.location.hash = '';
    renderWithShortcuts(<RunButton id="go.insights" />);

    fireEvent.click(screen.getByRole('button', { name: 'run go.insights' }));

    expect(window.location.hash).toBe('#insights');
  });

  it('does nothing outside the provider', () => {
    const run = vi.fn();
    render(<RegisterAction id="settings" run={run} />);

    expect(run).not.toHaveBeenCalled();
  });
});
