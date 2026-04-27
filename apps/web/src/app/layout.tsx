import './global.css';
import { AppProviders } from './providers';

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
      <body className="bg-app text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
