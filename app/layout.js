import './globals.css';

export const metadata = {
  title: 'Wedding Check-in',
  description: 'Guest verification system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
