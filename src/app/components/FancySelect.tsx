import React from "react";
import ReactDOM from "react-dom";

type FancyOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function FancySelect({
  value,
  options,
  onChange,
  placeholder = "Selecione...",
  disabled,
  className = "",
  menuClassName = "",
  triggerClassName = "",
  ariaLabel,
}: {
  value: string;
  options: FancyOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});

  const selected = React.useMemo(
    () => options.find((opt) => String(opt.value) === String(value)) || null,
    [options, value]
  );

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = Math.max(rect.width, 240);
    const maxHeight = Math.min(340, Math.max(180, vh * 0.46));
    const spaceBelow = vh - rect.bottom;
    const placeUp = spaceBelow < maxHeight + 12 && rect.top > spaceBelow;
    const left = clamp(rect.left, 8, vw - menuWidth - 8);
    const top = placeUp ? Math.max(8, rect.top - maxHeight - 8) : Math.min(vh - 8, rect.bottom + 8);

    setMenuStyle({
      position: "fixed",
      top,
      left,
      width: menuWidth,
      maxHeight,
      zIndex: 6000,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onResize = () => updateMenuPosition();
    const onScroll = () => updateMenuPosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, updateMenuPosition]);

  return (
    <div className={`fancy-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}>
      <button
        type="button"
        ref={triggerRef}
        className={`fancy-select__trigger ${triggerClassName}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="fancy-select__value">
          {selected ? (
            <>
              <span className="fancy-select__label">{selected.label}</span>
              {selected.hint ? <span className="fancy-select__hint">{selected.hint}</span> : null}
            </>
          ) : (
            <span className="fancy-select__placeholder">{placeholder}</span>
          )}
        </span>
        <span className="fancy-select__arrow" aria-hidden="true">▾</span>
      </button>

      {open
        ? ReactDOM.createPortal(
            <div ref={menuRef} className={`fancy-select__menu ${menuClassName}`.trim()} style={menuStyle} role="listbox">
              {options.length ? (
                options.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <button
                      key={`${opt.value}-${opt.label}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`fancy-select__option ${isSelected ? "is-selected" : ""}`.trim()}
                      disabled={opt.disabled}
                      onClick={() => {
                        if (opt.disabled) return;
                        onChange(String(opt.value));
                        setOpen(false);
                      }}
                    >
                      <span className="fancy-select__option-main">
                        <span className="fancy-select__option-label">{opt.label}</span>
                        {opt.hint ? <span className="fancy-select__option-hint">{opt.hint}</span> : null}
                      </span>
                      {isSelected ? <span className="fancy-select__check">✓</span> : null}
                    </button>
                  );
                })
              ) : (
                <div className="fancy-select__empty">Nenhuma opção disponível.</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
