import type {Metadata} from 'next';
import './globals.css';
import './marketing.css';
import './contacts.css';
import './support.css';

export const metadata: Metadata = {
  title: 'Unsaid — Global Shell',
  description:
    'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
  openGraph: {
    title: 'Unsaid — Global Shell',
    description:
      'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Unsaid — Global Shell',
    description:
      'Global operations, finance, catalog, marketing, orders, contacts, and support workspace shell for Unsaid.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        {/* Material Symbols + Inter from Google CDN. The self-hosted woff2
            (4MB) can't be served reliably by the memory-starved dev server
            — it times out and icons render as raw text words. The CDN link
            loads from Google's edge in <100ms. The @font-face in globals.css
            acts as a fallback if the CDN is blocked. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
