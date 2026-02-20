"use client";

type Props = {
  onInsert: (value: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
};

const ROWS = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю"]
];

export function BgVirtualKeyboard({ onInsert, onBackspace, onSpace }: Props) {
  return (
    <div className="mt-3 rounded-xl border border-black/10 bg-white p-2">
      <p className="text-xs text-black/55 mb-2">Bulgarian virtual keyboard</p>
      <div className="space-y-1">
        {ROWS.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="flex flex-wrap gap-1">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onInsert(key)}
                className="min-w-8 rounded-md border border-black/10 bg-panel px-2 py-1 text-sm hover:bg-cool/15"
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onSpace} className="flex-1 rounded-md border border-black/10 bg-panel px-2 py-1 text-xs">Space</button>
        <button type="button" onClick={onBackspace} className="rounded-md border border-black/10 bg-panel px-2 py-1 text-xs">Backspace</button>
      </div>
    </div>
  );
}
