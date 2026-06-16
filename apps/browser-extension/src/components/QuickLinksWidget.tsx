import {
  QUICK_LINKS_MAX,
  QUICK_LINKS_VISIBLE,
  type QuickLink,
  quickLinkMonogram,
} from '@cuewise/shared';
import { Check, MoreHorizontal, Pencil, Plus, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuickLinksStore } from '../stores/quick-links-store';

/** Build a local favicon URL via Chrome's `_favicon` API (needs the `favicon` permission). */
function faviconUrl(url: string): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    return null;
  }
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
}

const TILE_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 backdrop-blur-sm shadow-md hover:shadow-lg hover:scale-110 transition-all';

/** Favicon image with a theme-colored monogram fallback (dev / load failure). */
const Favicon: React.FC<{ link: QuickLink }> = ({ link }) => {
  const src = faviconUrl(link.url);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-600/15 text-[11px] font-semibold text-primary-600">
        {quickLinkMonogram(link)}
      </span>
    );
  }

  return <img src={src} alt="" className="h-5 w-5 rounded-sm" onError={() => setFailed(true)} />;
};

interface QuickLinkFormProps {
  initialTitle?: string;
  initialUrl?: string;
  submitLabel: string;
  onSubmit: (title: string, url: string) => Promise<boolean>;
  onCancel: () => void;
}

/** Inline title + URL form used for both adding and editing a quick link. */
const QuickLinkForm: React.FC<QuickLinkFormProps> = ({
  initialTitle = '',
  initialUrl = '',
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(title, url);
    setSubmitting(false);
    if (ok) {
      onCancel();
    }
  };

  const inputClass =
    'w-full px-2.5 py-1.5 text-sm bg-surface-variant border border-border rounded-lg text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500/40';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 px-3 py-2.5">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="example.com"
        // biome-ignore lint/a11y/noAutofocus: form opens on explicit user action
        autoFocus
        className={inputClass}
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name (optional)"
        className={inputClass}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1 text-sm text-secondary hover:text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1 px-2.5 py-1 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

export const QuickLinksWidget: React.FC = () => {
  const quickLinks = useQuickLinksStore((state) => state.quickLinks);
  const isLoading = useQuickLinksStore((state) => state.isLoading);
  const initialize = useQuickLinksStore((state) => state.initialize);
  const addQuickLink = useQuickLinksStore((state) => state.addQuickLink);
  const updateQuickLink = useQuickLinksStore((state) => state.updateQuickLink);
  const removeQuickLink = useQuickLinksStore((state) => state.removeQuickLink);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedDropdown = dropdownRef.current?.contains(target);
      if (!clickedTrigger && !clickedDropdown) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (isLoading) {
    return null;
  }

  const visibleLinks = quickLinks.slice(0, QUICK_LINKS_VISIBLE);
  const canAdd = quickLinks.length < QUICK_LINKS_MAX;
  const hasLinks = quickLinks.length > 0;

  return (
    <div className="flex items-center gap-density-sm">
      {/* Inline favicon tiles */}
      {visibleLinks.map((link) => (
        <a
          key={link.id}
          href={link.url}
          title={link.title}
          aria-label={link.title}
          className={TILE_CLASS}
        >
          <Favicon link={link} />
        </a>
      ))}

      {/* "More" / add tile + manager dropdown */}
      <div className="relative">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className={TILE_CLASS}
          title={hasLinks ? 'More quick links' : 'Add a quick link'}
        >
          {hasLinks ? (
            <MoreHorizontal className="h-5 w-5 text-primary" />
          ) : (
            <Plus className="h-5 w-5 text-primary" />
          )}
        </button>

        {isOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              role="menu"
              className="fixed z-[100] w-64 bg-surface rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
              style={{
                top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                left: triggerRef.current?.getBoundingClientRect().left ?? 0,
              }}
            >
              <div className="px-3 py-2.5 border-b border-border">
                <span className="text-sm font-medium text-primary">Quick links</span>
              </div>

              <div className="py-1 max-h-[320px] overflow-y-auto">
                {!hasLinks && !adding && (
                  <p className="px-3 py-3 text-center text-sm text-secondary">No quick links yet</p>
                )}

                {quickLinks.map((link) =>
                  editingId === link.id ? (
                    <QuickLinkForm
                      key={link.id}
                      initialTitle={link.title}
                      initialUrl={link.url}
                      submitLabel="Save"
                      onSubmit={(title, url) => updateQuickLink(link.id, { title, url })}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div
                      key={link.id}
                      className="group flex items-center gap-2 px-3 py-2 hover:bg-surface-variant transition-colors"
                    >
                      <a
                        href={link.url}
                        className="flex flex-1 items-center gap-2 min-w-0"
                        title={link.title}
                      >
                        <Favicon link={link} />
                        <span className="flex-1 text-sm text-primary truncate">{link.title}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setEditingId(link.id);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface transition-all"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5 text-secondary hover:text-primary" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuickLink(link.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface transition-all"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5 text-secondary hover:text-error" />
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* Footer: add control */}
              {adding ? (
                <div className="border-t border-border">
                  <QuickLinkForm
                    submitLabel="Add"
                    onSubmit={(title, url) => addQuickLink(title, url)}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              ) : (
                canAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setAdding(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 border-t border-border text-sm font-medium text-primary hover:bg-surface-variant transition-colors"
                  >
                    <Plus className="h-4 w-4 text-primary-600" />
                    Add link
                  </button>
                )
              )}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};
