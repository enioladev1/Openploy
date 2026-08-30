"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface HighlightedEnvTextareaProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}

// Shared between the textarea and its highlight overlay - any difference
// here (padding, font, line-height) throws the two out of alignment, since
// the overlay is just a same-text <pre> rendered behind a transparent-text
// textarea (the standard "highlighted textarea" trick: no rich-text editing,
// just a read-only colored twin synced to the real textarea's scroll position).
const SHARED_CLASSES = "block w-full whitespace-pre-wrap break-all px-3 py-3 font-mono text-xs leading-5";

function HighlightedLine({ line }: { line: string }) {
  if (line.length === 0) return <>{" "}</>;
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) return <span className="text-foreground">{line}</span>;
  return (
    <>
      <span className="font-semibold text-foreground">{line.slice(0, eqIndex)}</span>
      <span className="text-muted-foreground">=</span>
      <span className="text-emerald-700 dark:text-emerald-400">{line.slice(eqIndex + 1)}</span>
    </>
  );
}

/**
 * A KEY=value textarea capped to a fixed height (scrolls instead of growing
 * to fit pasted content) with KEY/value syntax coloring - a plain <textarea>
 * can't render mixed colors itself, so this layers one behind a
 * transparent-text real textarea, kept in sync on every scroll.
 */
export function HighlightedEnvTextarea({ value, onChange, readOnly, rows = 8, placeholder, className }: HighlightedEnvTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  function syncScroll() {
    if (!preRef.current || !textareaRef.current) return;
    preRef.current.scrollTop = textareaRef.current.scrollTop;
    preRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  const lines = value.split("\n");

  return (
    <div
      className={cn(
        "relative max-h-64 overflow-hidden rounded-2xl border border-transparent bg-input/50 transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        className,
      )}
    >
      <pre ref={preRef} aria-hidden className={cn(SHARED_CLASSES, "pointer-events-none absolute inset-0 overflow-hidden text-transparent")}>
        {lines.map((line, index) => (
          // Index is fine here - lines are re-derived from `value` on every render, never reordered independently.
          <div key={index}>
            <HighlightedLine line={line} />
          </div>
        ))}
      </pre>
      <textarea
        ref={textareaRef}
        rows={rows}
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          SHARED_CLASSES,
          "relative max-h-64 resize-none overflow-y-auto bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground",
        )}
      />
    </div>
  );
}
