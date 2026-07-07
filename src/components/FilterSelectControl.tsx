import { useEffect, useId, useMemo, useRef, useState } from "react";
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
};

export function FilterSelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  triggerClassName = "",
  menuClassName = "",
}: FilterSelectControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? value,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-9 w-full max-w-full items-center justify-between gap-2 rounded-[6px] border bg-white px-2.5 text-left text-[12px] font-bold text-[#303630] outline-none transition-colors ${
          open
            ? "border-blue-500 shadow-[0_0_0_3px_rgba(37,99,235,0.10)]"
            : "border-[#d9e0d9] hover:border-[#cbd5cc]"
        } ${triggerClassName}`}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#606861] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.2}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 overflow-y-auto rounded-[8px] border border-[#d9e0d9] bg-white p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.14)] ${menuClassName}`}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex h-8 w-full items-center justify-between gap-2 rounded-[7px] px-2.5 text-left text-[12px] font-extrabold transition ${
                  selected
                    ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
                    : "text-[#606861] hover:bg-[#f6f8f6] hover:text-[#171a17]"
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
        </div>
      ) : null}
    </div>
  );
}
