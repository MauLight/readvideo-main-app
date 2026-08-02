import { CircleCheck } from "lucide-react";
import { YouTubeKind } from "../lib/youtube";

export type Status = "idle" | "loading" | "success" | "error";

interface StatusComponentProps {
  status: Status;
  kind?: YouTubeKind;
}

export default function StatusComponent({
  status,
  kind,
}: StatusComponentProps) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-dark2 dark:text-text2">
        <span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
        Loading
      </div>
    );
  }

  if (status === "success") {
    // One step darker than the input's fill, so text stays legible on black.
    const accentClass =
      kind === "playlist" ? "text-amber-600" : "text-green-600";

    return (
      <div className={`flex items-center gap-2 ${accentClass}`}>
        <CircleCheck className="w-4 h-4" />
        Success
      </div>
    );
  }

  return null;
}
