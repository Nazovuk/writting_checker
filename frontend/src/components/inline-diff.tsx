function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((x) => x.length > 0);
}

type Props = {
  original: string;
  corrected: string;
};

export function InlineDiff({ original, corrected }: Props) {
  if (!original && !corrected) {
    return <p className="text-sm text-black/45">No diff available.</p>;
  }

  const a = tokenize(original);
  const b = tokenize(corrected);
  const maxLen = Math.max(a.length, b.length);

  return (
    <p className="leading-8 text-[15px] whitespace-pre-wrap break-words">
      {Array.from({ length: maxLen }).map((_, i) => {
        const left = a[i] ?? "";
        const right = b[i] ?? "";

        if (left === right) {
          return <span key={`eq-${i}`}>{right}</span>;
        }

        return (
          <span key={`chg-${i}`}>
            {left ? <span className="rounded-sm bg-warn/20 px-1 line-through">{left}</span> : null}
            {right ? <span className="rounded-sm bg-cool/20 px-1 ml-1">{right}</span> : null}
          </span>
        );
      })}
    </p>
  );
}
