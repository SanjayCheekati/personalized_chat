export default function ChatShell({ header, children, footer }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/70 bg-[var(--panel)] shadow-glow backdrop-blur">
      <header className="border-b border-white/60 px-6 py-5">{header}</header>
      <main className="flex-1 space-y-4 overflow-y-auto px-6 py-6">{children}</main>
      <footer className="border-t border-white/60 px-6 py-5">{footer}</footer>
    </div>
  );
}
