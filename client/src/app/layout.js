import "./globals.css";

export const metadata = {
  title: "FlashChat",
  description: "Ultra fast 1-to-1 chat"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect so the browser opens the socket to Google Fonts immediately,
            in parallel with everything else — not after CSS is parsed. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* display=swap means text renders in the fallback font while the
            webfont loads — no invisible-text flash (FOIT). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Space+Grotesk:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

