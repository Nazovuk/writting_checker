import type { ReactNode } from "react";
import { Issue } from "@/lib/types";

type Props = {
  text: string;
  issues: Issue[];
  activeIssueId?: string;
  onPickIssue?: (id: string) => void;
};

export function HighlightedText({ text, issues, activeIssueId, onPickIssue }: Props) {
  if (!text) {
    return <p className="text-sm text-black/45">Write text directly, paste content, or upload any supported file to see highlights.</p>;
  }

  const sorted = [...issues].sort((a, b) => a.start - b.start);
  const chunks: ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((issue) => {
    if (issue.start > cursor) {
      chunks.push(<span key={`plain-${cursor}`}>{text.slice(cursor, issue.start)}</span>);
    }

    const cls = issue.severity === "critical" ? "issue-critical" : issue.severity === "major" ? "issue-major" : "issue-minor";
    const active = activeIssueId === issue.id ? "ring-2 ring-ink/35 rounded-md -mx-[2px]" : "";

    chunks.push(
      <button
        key={issue.id}
        type="button"
        className={`${cls} ${active} cursor-pointer px-0.5 py-0.5 rounded-md`}
        onClick={() => onPickIssue?.(issue.id)}
        title={issue.reason}
      >
        {text.slice(issue.start, issue.end)}
      </button>
    );
    cursor = issue.end;
  });

  if (cursor < text.length) {
    chunks.push(<span key={`plain-end`}>{text.slice(cursor)}</span>);
  }

  return <p className="leading-8 text-[15px] whitespace-pre-wrap break-words">{chunks}</p>;
}
