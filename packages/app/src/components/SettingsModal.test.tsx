import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeNotionHost } from '../notion/__fixtures__/notion-host.fixtures';
import { SettingsModal } from './SettingsModal';
import {
  createNotionSettingsSection,
  INTEGRATIONS_SECTION_ID,
} from './settings/NotionSettingsSection';

const integrations = createNotionSettingsSection(fakeNotionHost());

function activeHeading(name: string) {
  return screen.getByRole('heading', { level: 3, name });
}

describe('SettingsModal', () => {
  it('opens on the section it was asked for', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        extraSections={[integrations]}
        initialSection={INTEGRATIONS_SECTION_ID}
      />
    );

    expect(activeHeading('Integrations')).toBeInTheDocument();
  });

  it('opens on the Timer section when none is asked for', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} extraSections={[integrations]} />);

    expect(activeHeading('Timer')).toBeInTheDocument();
  });

  it('lands on the asked-for section again after a visit elsewhere', async () => {
    const user = userEvent.setup();
    const props = {
      onClose: vi.fn(),
      extraSections: [integrations],
      initialSection: INTEGRATIONS_SECTION_ID,
    };
    const { rerender } = render(<SettingsModal isOpen {...props} />);

    await user.click(screen.getByRole('button', { name: /Timer/ }));
    rerender(<SettingsModal isOpen={false} {...props} />);
    rerender(<SettingsModal isOpen {...props} />);

    expect(activeHeading('Integrations')).toBeInTheDocument();
  });
});
