import { getStorageUsage } from '@cuewise/storage';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageIndicator } from './StorageIndicator';

vi.mock('@cuewise/storage', () => ({
  getStorageUsage: vi.fn(),
  formatBytes: (bytes: number) => `${bytes} Bytes`,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StorageIndicator', () => {
  it('reports that usage is unavailable rather than an all-clear against a guessed quota', async () => {
    vi.mocked(getStorageUsage).mockResolvedValue({ available: false });

    render(<StorageIndicator />);

    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
  });

  it('shows the used share when usage is known', async () => {
    vi.mocked(getStorageUsage).mockResolvedValue({
      available: true,
      bytesInUse: 8_000_000,
      quota: 10_000_000,
      percentageUsed: 80,
      isWarning: true,
      isCritical: false,
    });

    render(<StorageIndicator />);

    expect(await screen.findByText('80.00% used')).toBeInTheDocument();
  });
});
