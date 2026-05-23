export default function ChatShell({ header, children, footer }) {
  return (
    <div className="chat-shell mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl shadow-glow min-h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)]">
      <header className="border-b border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
        {header}
      </header>
      <main className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {children}
      </main>
      <footer className="border-t border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
        {footer}
      </footer>
    </div>
  );
}
