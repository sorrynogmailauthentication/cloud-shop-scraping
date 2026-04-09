import { useEffect, useMemo, useRef, useState } from 'react';

export type DropdownOption = { value: string; label: string };

export function SingleSelectDropdown({
  options,
  value,
  placeholder,
  disabled,
  onChange,
  ariaLabel,
  /** When list data is loading after a selection, force-close the menu (backup for click handler). */
  listLoading,
}: {
  options: DropdownOption[];
  value: string | null;
  placeholder: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  ariaLabel: string;
  listLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  useEffect(() => {
    if (listLoading) setOpen(false);
  }, [listLoading]);

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    return options.find((o) => o.value === value)?.label ?? placeholder;
  }, [options, value, placeholder]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="search-dropdown-wrap table-toolbar-dropdown-wrap" ref={wrapRef}>
      <button
        type="button"
        className="search-dropdown-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        title={selectedLabel}
      >
        {selectedLabel}
      </button>
      {open && (
        <div className="search-dropdown-panel" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <div
              key={o.value}
              className="search-dropdown-option"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              title={o.label}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

