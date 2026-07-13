import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronDown } from "lucide-react";

type FilterSelectOption = {
  value: string;
  label: string;
};

type FilterSelectControlProps = {
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  leadingIcon?: ReactNode;
  onOpen?: () => void;
};

export function FilterSelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  leadingIcon,
  onOpen,
}: FilterSelectControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const [menuLayout, setMenuLayout] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    placement: "up" | "down";
  } | null>(null);
  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? value,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    optionRefs.current[selectedIndex]?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, options, value]);

  const menuReady = menuLayout !== null;
  useEffect(() => {
    if (!open || !menuReady) return;
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const frame = window.requestAnimationFrame(() =>
      optionRefs.current[selectedIndex]?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [menuReady, open, options, value]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;

    const updateMenuLayout = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const triggerBounds = triggerRef.current.getBoundingClientRect();
      const menuBounds = menuRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const menuGap = 8;
      const spaceBelow = Math.max(
        0,
        window.innerHeight - triggerBounds.bottom - menuGap - viewportPadding,
      );
      const spaceAbove = Math.max(
        0,
        triggerBounds.top - menuGap - viewportPadding,
      );
      const naturalHeight = Math.min(224, menuRef.current.scrollHeight);
      const placement =
        naturalHeight > spaceBelow && spaceAbove > spaceBelow ? "up" : "down";
      const availableHeight = placement === "up" ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(80, Math.min(224, availableHeight));
      const renderedHeight = Math.min(naturalHeight, maxHeight);
      const renderedWidth = Math.max(triggerBounds.width, menuBounds.width);
      const left = Math.min(
        Math.max(viewportPadding, triggerBounds.left),
        Math.max(viewportPadding, window.innerWidth - renderedWidth - viewportPadding),
      );
      const top =
        placement === "up"
          ? Math.max(viewportPadding, triggerBounds.top - renderedHeight - menuGap)
          : Math.min(
              window.innerHeight - renderedHeight - viewportPadding,
              triggerBounds.bottom + menuGap,
            );

      setMenuLayout({
        left,
        top,
        width: triggerBounds.width,
        maxHeight,
        placement,
      });
    };

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
    };
  }, [open, options.length]);

  const openAt = (index: number) => {
    if (options.length === 0) return;
    const normalizedIndex = (index + options.length) % options.length;
    setMenuLayout(null);
    onOpen?.();
    setOpen(true);
    window.requestAnimationFrame(() =>
      optionRefs.current[normalizedIndex]?.focus(),
    );
  };

  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveOptionFocus = (nextIndex: number) => {
    if (options.length === 0) return;
    const normalizedIndex = (nextIndex + options.length) % options.length;
    optionRefs.current[normalizedIndex]?.focus();
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() =>
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              setMenuLayout(null);
              onOpen?.();
            }
            return nextOpen;
          })
        }
        onKeyDown={(event) => {
          if (options.length === 0) return;
          const selectedIndex = Math.max(
            0,
            options.findIndex((option) => option.value === value),
          );
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAt(open ? selectedIndex + 1 : selectedIndex);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAt(open ? selectedIndex - 1 : selectedIndex);
          } else if (event.key === "Home") {
            event.preventDefault();
            openAt(0);
          } else if (event.key === "End") {
            event.preventDefault();
            openAt(options.length - 1);
          } else if ((event.key === "Enter" || event.key === " ") && !open) {
            event.preventDefault();
            openAt(selectedIndex);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closeAndRestoreFocus();
          }
        }}
        className={`inline-flex h-9 w-full max-w-full items-center justify-between gap-2 rounded-[9px] border bg-white px-3 text-left text-[12px] font-extrabold text-[#303630] outline-none transition ${
          open
            ? "border-neutral-300 shadow-[0_0_0_3px_rgba(15,23,42,0.08)]"
            : "border-neutral-200 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-neutral-300 hover:bg-neutral-50"
        } ${triggerClassName}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
          <span className="min-w-0 truncate">{selectedLabel}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#606861] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.2}
        />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              data-filter-select-portal="true"
              data-placement={menuLayout?.placement ?? "down"}
              style={{
                left: menuLayout?.left ?? 0,
                top: menuLayout?.top ?? 0,
                width: menuLayout?.width,
                maxHeight: menuLayout?.maxHeight ?? 224,
                visibility: menuLayout ? "visible" : "hidden",
              }}
              className={`fixed z-[120] overflow-y-auto rounded-[12px] border border-neutral-200 bg-white p-1.5 text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)] ${menuClassName}`}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.value);
                      closeAndRestoreFocus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveOptionFocus(index + 1);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveOptionFocus(index - 1);
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        moveOptionFocus(0);
                      } else if (event.key === "End") {
                        event.preventDefault();
                        moveOptionFocus(options.length - 1);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeAndRestoreFocus();
                      } else if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onChange(option.value);
                        closeAndRestoreFocus();
                      }
                    }}
                    className={`flex h-9 w-full items-center justify-between gap-2 rounded-[9px] px-2.5 text-left text-[12px] font-extrabold transition ${
                      selected
                        ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
                        : "text-[#606861] hover:bg-neutral-50 hover:text-[#171a17]"
                    }`}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {selected ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 shrink-0 text-blue-600"
                        strokeWidth={2.4}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
