import { Issue } from "@/lib/types";
import { categoryLabel } from "@/lib/labels";

type Props = {
  issues: Issue[];
  activeIssueId?: string;
  hasResult: boolean;
  hasError: boolean;
  onSelect: (id: string) => void;
};

export function IssueList({ issues, activeIssueId, hasResult, hasError, onSelect }: Props) {
  if (!issues.length) {
    if (hasError) {
      return <p className="text-sm text-warn">Analysis failed. Fix backend connection and re-run analysis.</p>;
    }
    if (!hasResult) {
      return <p className="text-sm text-black/45">Run analysis to see detected issues.</p>;
    }
    return <p className="text-sm text-black/45">No issues detected. Your writing looks clean.</p>;
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-auto pr-1">
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          onClick={() => onSelect(issue.id)}
          className={`w-full text-left rounded-xl border p-3 transition ${
            activeIssueId === issue.id ? "border-ink bg-white" : "border-black/10 bg-white/70 hover:bg-white"
          }`}
        >
          <p className="text-xs uppercase tracking-wide text-black/45">{categoryLabel(issue.category)}</p>
          <p className="font-medium text-sm mt-1">{issue.reason}</p>
          <p className="text-xs text-black/55 mt-1">Suggestion: {issue.replacements[0] ?? "No direct replacement"}</p>
        </button>
      ))}
    </div>
  );
}
