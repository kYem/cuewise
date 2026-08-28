import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { installAppRenderStubs } from './__fixtures__/app-render.fixtures';
import App from './App';

describe('App home widget discovery', () => {
  beforeEach(() => {
    installAppRenderStubs();
  });

  // The picker and the chip are covered in isolation; this is the only check that the
  // entry point is actually mounted on the page it exists to serve.
  it('puts the add-widget entry point on the new tab', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Add a widget' })).toBeInTheDocument();
  });
});
