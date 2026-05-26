export default function ChatShell({ header, children, footer }) {
  return (
    <div className="chat-shell grid h-[100dvh] min-h-[100dvh] w-full flex-1 grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden">
      <header className="border-b border-[var(--panel-border)] bg-[var(--panel)] px-3 py-3 sm:px-4">
        {header}
      </header>
      <main className="chat-scroll flex min-h-0 flex-col overflow-y-auto px-3 py-4 sm:px-4">
        {children}
      </main>
      <footer className="border-t border-[var(--panel-border)] bg-[var(--panel)] px-3 py-3 sm:px-4">
        {footer}
      </footer>
    </div>
  );
}
