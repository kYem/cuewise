import { Segmented } from '@cuewise/app/setting-controls';
import { describeCapturedPage, logger } from '@cuewise/shared';
import { Button, cn, Input, Label, Textarea } from '@cuewise/ui';
import { Check } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CaptureDraft,
  type CaptureFields,
  type CaptureKind,
  resolveCaptureFields,
} from '../capture/capture-draft';
import { type CapturePopupApi, chromeCapturePopupApi } from './capture-popup-api';

export const DRAFT_WRITE_DELAY_MS = 150;
export const CLOSE_AFTER_SAVE_MS = 1000;

const KIND_OPTIONS: { value: CaptureKind; label: string }[] = [
  { value: 'concept', label: 'Concept' },
  { value: 'quote', label: 'Quote' },
];

const FIELD_CLASS = 'px-3 py-2 text-sm';

type Status = 'loading' | 'ready' | 'saving' | 'saved';

function blankFieldMessage(kind: CaptureKind, fields: CaptureFields): string | null {
  if (kind === 'concept' && (!fields.term.trim() || !fields.definition.trim())) {
    return 'Add a term and a definition first.';
  }
  if (kind === 'quote' && !fields.quoteText.trim()) {
    return 'Add the quote text first.';
  }
  return null;
}

function describeOrigin(draft: CaptureDraft): string | null {
  const { host } = describeCapturedPage(draft.pageUrl, draft.pageTitle);
  const parts = [draft.pageTitle?.trim(), host].filter(Boolean);
  return parts.length > 0 ? `From: ${parts.join(' · ')}` : null;
}

function isPlainEnter(event: React.KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing;
}

function isModEnter(event: React.KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey);
}

interface CapturePopupProps {
  api?: CapturePopupApi;
}

export const CapturePopup: React.FC<CapturePopupProps> = ({ api = chromeCapturePopupApi }) => {
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [kind, setKind] = useState<CaptureKind>('concept');
  const [fields, setFields] = useState<CaptureFields>({
    term: '',
    definition: '',
    quoteText: '',
    author: '',
  });
  const [status, setStatus] = useState<Status>('loading');
  const loaded = status !== 'loading';
  const [error, setError] = useState<string | null>(null);
  const [termInferred, setTermInferred] = useState(false);

  const termRef = useRef<HTMLInputElement>(null);
  const authorRef = useRef<HTMLInputElement>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    api
      .loadDraft()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        const resolved = resolveCaptureFields(loaded);
        setDraft(loaded);
        setKind(loaded.kind);
        setFields(resolved);
        setTermInferred(loaded.term === undefined && resolved.term !== '');
        setStatus('ready');
      })
      .catch((loadError: unknown) => {
        logger.error('Could not load the capture draft', loadError);
        if (cancelled) {
          return;
        }
        setDraft({ kind: 'concept', text: '', pageUrl: '' });
        setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    if (kind === 'quote') {
      authorRef.current?.focus();
      return;
    }
    termRef.current?.focus();
    if (termInferred) {
      termRef.current?.select();
    }
  }, [kind, loaded, termInferred]);

  useEffect(
    () => () => {
      if (writeTimer.current !== null) {
        clearTimeout(writeTimer.current);
      }
    },
    []
  );

  const scheduleDraftWrite = useCallback(
    (next: CaptureDraft) => {
      if (writeTimer.current !== null) {
        clearTimeout(writeTimer.current);
      }
      writeTimer.current = setTimeout(() => {
        writeTimer.current = null;
        pendingWrite.current = api.persistDraft(next).catch((writeError: unknown) => {
          logger.error('Could not keep the capture draft', writeError);
        });
      }, DRAFT_WRITE_DELAY_MS);
    },
    [api]
  );

  const edit = (nextKind: CaptureKind, nextFields: CaptureFields) => {
    if (draft === null) {
      return;
    }
    setKind(nextKind);
    setFields(nextFields);
    setError(null);
    scheduleDraftWrite({ ...draft, kind: nextKind, ...nextFields });
  };

  const setField = (key: keyof CaptureFields, value: string) => {
    if (key === 'term') {
      setTermInferred(false);
    }
    edit(kind, { ...fields, [key]: value });
  };

  const save = async () => {
    if (draft === null || status !== 'ready') {
      return;
    }
    const blank = blankFieldMessage(kind, fields);
    if (blank !== null) {
      setError(blank);
      return;
    }
    // A draft write landing after the save would bring back the draft the save just cleared.
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    await pendingWrite.current;

    setStatus('saving');
    setError(null);
    const next: CaptureDraft = { ...draft, kind, ...fields };
    try {
      const response = await api.save(next);
      if (response.ok) {
        setStatus('saved');
        setTimeout(api.close, CLOSE_AFTER_SAVE_MS);
        return;
      }
      setError(response.reason);
    } catch (saveError) {
      logger.error('Could not send the capture to Cuewise', saveError);
      setError('Could not save. Please try again.');
    }
    setStatus('ready');
    scheduleDraftWrite(next);
  };

  const saveOnEnter = (event: React.KeyboardEvent) => {
    if (isPlainEnter(event)) {
      event.preventDefault();
      void save();
    }
  };

  const saveOnModEnter = (event: React.KeyboardEvent) => {
    if (isModEnter(event)) {
      event.preventDefault();
      void save();
    }
  };

  if (status === 'loading' || draft === null) {
    return <main className="w-[360px] p-4" aria-busy="true" />;
  }

  const origin = describeOrigin(draft);
  const busy = status !== 'ready';

  return (
    <main className="w-[360px] space-y-3 p-4 text-primary">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-sm font-semibold">Save to Cuewise</h1>
        <Segmented value={kind} options={KIND_OPTIONS} onChange={(next) => edit(next, fields)} />
      </div>

      {kind === 'concept' ? (
        <>
          <div>
            <Label htmlFor="capture-term" className="mb-1">
              Term
            </Label>
            <Input
              id="capture-term"
              ref={termRef}
              className={FIELD_CLASS}
              value={fields.term}
              placeholder="What is this called?"
              onChange={(event) => setField('term', event.target.value)}
              onKeyDown={saveOnEnter}
            />
          </div>
          <div>
            <Label htmlFor="capture-definition" className="mb-1">
              Definition
            </Label>
            <Textarea
              id="capture-definition"
              className={FIELD_CLASS}
              rows={5}
              value={fields.definition}
              onChange={(event) => setField('definition', event.target.value)}
              onKeyDown={saveOnModEnter}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="capture-quote" className="mb-1">
              Quote
            </Label>
            <Textarea
              id="capture-quote"
              className={FIELD_CLASS}
              rows={5}
              value={fields.quoteText}
              onChange={(event) => setField('quoteText', event.target.value)}
              onKeyDown={saveOnModEnter}
            />
          </div>
          <div>
            <Label htmlFor="capture-author" className="mb-1">
              Author
            </Label>
            <Input
              id="capture-author"
              ref={authorRef}
              className={FIELD_CLASS}
              value={fields.author}
              placeholder="Unknown"
              onChange={(event) => setField('author', event.target.value)}
              onKeyDown={saveOnEnter}
            />
          </div>
        </>
      )}

      {origin && <p className="truncate text-xs text-secondary">{origin}</p>}

      <Button
        type="button"
        size="sm"
        className={cn('w-full gap-1.5', status === 'saved' && 'bg-success hover:bg-success')}
        disabled={busy}
        onClick={() => void save()}
      >
        {status === 'saved' && <Check className="h-4 w-4" aria-hidden="true" />}
        {status === 'saved' ? 'Saved' : 'Save'}
      </Button>

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </main>
  );
};
