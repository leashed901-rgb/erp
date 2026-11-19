import type {Metadata} from 'next';
import './globals.css';
import './marketing.css';
import './contacts.css';
import './support.css';

export const metadata: Metadata = {
  title: 'Unsaid — Workspace',
  description:
    'Operations, finance, catalog, marketing, orders, contacts, and support workspace.',
  openGraph: {
    title: 'Unsaid — Workspace',
    description:
      'Operations, finance, catalog, marketing, orders, contacts, and support workspace.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Unsaid — Workspace',
    description:
      'Operations, finance, catalog, marketing, orders, contacts, and support workspace.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      {/* Fonts are @import-ed at the top of globals.css (before Tailwind) so
          utility font sizes win the cascade exactly like the original mockups. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
