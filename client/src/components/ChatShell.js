export default function ChatShell({ header, children, footer }) {
  return (
    <div className="chat-shell flex min-h-screen h-[100dvh] w-full flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-[var(--panel-border)] bg-[var(--panel)] px-3 py-3 sm:px-4">
        {header}
      </header>
      <main className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-4">
        {children}
      </main>
      <footer className="sticky bottom-0 z-30 border-t border-[var(--panel-border)] bg-[var(--panel)] px-3 py-3 sm:px-4">
        {footer}
      </footer>
    </div>
  );
}
