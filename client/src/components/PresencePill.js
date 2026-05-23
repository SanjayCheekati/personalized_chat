export default function PresencePill({ online, typing }) {
  const label = typing ? "typing..." : online ? "here" : "away";
  const dotClass = typing
    ? "bg-[var(--accent-warm)]"
    : online
    ? "bg-[var(--accent)]"
    : "bg-slate-400";

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs text-[var(--ink)] shadow-rose">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
}
