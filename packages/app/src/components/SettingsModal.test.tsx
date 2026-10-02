import { render, screen } from '@testing-library/react';
import { Blocks } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import type { SettingsSection } from './settings/SettingsSections';

const integrations: SettingsSection = {
  id: 'integrations',
  label: 'Integrations',
  icon: Blocks,
  component: () => <p>Integrations body</p>,
  terms: 'integrations',
};

describe('SettingsModal', () => {
  it('opens on the section it was asked for', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        extraSections={[integrations]}
        initialSection="integrations"
      />
    );

    expect(screen.getByText('Integrations body')).toBeInTheDocument();
  });

  it('opens on the first section when none is asked for', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} extraSections={[integrations]} />);

    expect(screen.queryByText('Integrations body')).toBeNull();
  });
});
