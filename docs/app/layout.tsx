import { Inter } from 'next/font/google';
import { StaticSearchProvider } from '@sayakm/fumadocs-shared';
import type { Metadata } from 'next';
import '@/app/global.css';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://autodidact.kodeblox.com'),
  icons: {
    icon: '/images/favicon.svg',
  },
  title: {
    default: 'AutoDidact Docs',
    template: '%s | AutoDidact Docs',
  },
  description: 'Documentation for the AutoDidact course reader.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <StaticSearchProvider>{children}</StaticSearchProvider>
      </body>
    </html>
  );
}
