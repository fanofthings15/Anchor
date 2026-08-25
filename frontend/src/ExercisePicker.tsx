import { useEffect, useRef, useState } from "react";

// A small custom combobox — not a native <input list=datalist>. iOS Safari has never
// rendered datalist suggestions at all, which silently broke the "pick from a library"
// flow on mobile (the input just behaved like plain free text there). This renders its
// own dropdown, so it works the same on every platform.
export default function ExercisePicker({
  value,
  onChange,
  options,
  placeholder,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const filtered = (query.length === 0 ? options : options.filter((o) => o.toLowerCase().includes(query))).slice(0, 8);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        style={{ width: "100%" }}
      />
      {open && filtered.length > 0 && (
        <div className="exercise-picker-dropdown">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              className="exercise-picker-option"
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
