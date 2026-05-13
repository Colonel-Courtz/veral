import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Veral · Verification Authority Layer for Ethereum',
  description:
    'Veral reads public evidence behind any ENS-named subject and computes a deterministic 0–100 reputation score, publishable as an EAS attestation.',
  metadataBase: new URL('https://veral.tech'),
  openGraph: {
    title: 'Veral · Verification Authority Layer for Ethereum',
    description:
      'Twenty public sources. One deterministic score. ENS-anchored, EAS-published.',
    type: 'website',
    url: 'https://veral.tech',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
