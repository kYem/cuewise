import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  createDefaultProps,
  createInvalidImportValidation,
  createValidationWithWarnings,
  createValidImportValidation,
  DEFAULT_IMPORT_OPTIONS,
} from './__fixtures__/import-controls.fixtures';
import { ImportControls } from './ImportControls';

describe('ImportControls', () => {
  it('should render file upload button when no validation', () => {
    render(<ImportControls {...createDefaultProps()} />);

    expect(screen.getByText('Import Data')).toBeInTheDocument();
    expect(screen.getByText('Select JSON file to import')).toBeInTheDocument();
  });

  it('should show validation success when valid file is selected', () => {
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    expect(screen.getByText('File validated successfully')).toBeInTheDocument();
    expect(screen.getByText(/Version 1.0.0/)).toBeInTheDocument();
  });

  it('should show validation error when invalid file is selected', () => {
    const props = createDefaultProps();
    props.importValidation = createInvalidImportValidation();

    render(<ImportControls {...props} />);

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText(/Invalid JSON format/)).toBeInTheDocument();
  });

  it('should show warnings when present', () => {
    const props = createDefaultProps();
    props.importValidation = createValidationWithWarnings(['This is a warning']);

    render(<ImportControls {...props} />);

    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('This is a warning')).toBeInTheDocument();
  });

  it('should display data counts in preview', () => {
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    expect(screen.getByText('Data to import:')).toBeInTheDocument();
    expect(screen.getByText('Goals')).toBeInTheDocument();
    expect(screen.getByText('Quotes')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(3);
  });

  it('should show import options when validation is successful', () => {
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    expect(screen.getByText('Import options:')).toBeInTheDocument();
    expect(screen.getByText(/Import goals/)).toBeInTheDocument();
    expect(screen.getByText(/Import custom quotes/)).toBeInTheDocument();
    expect(screen.getByText(/Import pomodoro sessions/)).toBeInTheDocument();
    expect(screen.getByText('Skip duplicates (recommended)')).toBeInTheDocument();
  });

  it('should call onClearValidation when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    await user.click(screen.getByText('Cancel'));

    expect(props.onClearValidation).toHaveBeenCalledTimes(1);
  });

  it('should call onExecuteImport with correct options when Import is clicked', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    await user.click(screen.getByText('Import Selected'));

    expect(props.onExecuteImport).toHaveBeenCalledWith(DEFAULT_IMPORT_OPTIONS);
  });

  it('should disable Import button when no options are selected', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();

    render(<ImportControls {...props} />);

    await user.click(screen.getByRole('checkbox', { name: /Import goals/ }));
    await user.click(screen.getByRole('checkbox', { name: /Import custom quotes/ }));
    await user.click(screen.getByRole('checkbox', { name: /Import pomodoro sessions/ }));

    expect(screen.getByText('Import Selected')).toBeDisabled();
  });

  it('should show "Importing..." text when import is in progress', () => {
    const props = createDefaultProps();
    props.importValidation = createValidImportValidation();
    props.isImporting = true;

    render(<ImportControls {...props} />);

    expect(screen.getByText('Importing...')).toBeInTheDocument();
  });

  it('should not show Import button when validation failed', () => {
    const props = createDefaultProps();
    props.importValidation = createInvalidImportValidation();

    render(<ImportControls {...props} />);

    expect(screen.queryByText('Import Selected')).not.toBeInTheDocument();
  });

  it('should show tip text', () => {
    render(<ImportControls {...createDefaultProps()} />);

    expect(screen.getByText(/Import data from previous exports/)).toBeInTheDocument();
  });
});
