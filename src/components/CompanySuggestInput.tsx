import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterCompanySuggestions } from "../utils/contactDuplicates";

export function CompanySuggestInput({
  value,
  onChange,
  suggestions,
  className = "input-base py-2",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(
    () => filterCompanySuggestions(suggestions, value),
    [suggestions, value]
  );

  const showList = open && matches.length > 0;

  function clearBlurTimer() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleFocus() {
    clearBlurTimer();
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleBlur() {
    clearBlurTimer();
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, 120);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === "ArrowDown" && matches.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const name = matches[activeIndex];
      if (name) pick(name);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={showList ? "company-suggest-list" : undefined}
        className={className}
        placeholder={placeholder}
      />
      {showList && (
        <ul
          id="company-suggest-list"
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((name, i) => (
            <li key={name} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(name)}
                className={`w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 ${
                  i === activeIndex ? "bg-indigo-50 text-indigo-950" : ""
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
