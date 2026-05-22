import "./globals.css";

export const metadata = {
  title: "FlashChat",
  description: "Ultra fast 1-to-1 chat"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
