import './global.css';
import { AppProviders } from './providers';
import { Manrope } from 'next/font/google';

const manrope = Manrope({ subsets: ['latin'], weight: ['400','500','600','700','800'], display: 'swap' });

export const metadata = {
  title: 'WalletOS Demo',
  description: 'Read-only wallet visibility for end users',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`bg-app text-foreground antialiased ${manrope.className}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
