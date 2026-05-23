export default function ChatShell({ header, children, footer }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-[36px] border border-white/60 bg-[var(--panel)] shadow-glow backdrop-blur">
      <header className="border-b border-white/60 bg-white/40 px-6 py-5">{header}</header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        {children}
      </main>
      <footer className="border-t border-white/60 bg-white/40 px-6 py-5">{footer}</footer>
    </div>
  );
}
