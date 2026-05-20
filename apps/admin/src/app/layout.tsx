import './global.css';
import { ClientProviders } from '../components/ClientProviders';

export const metadata = {
  title: 'WalletOS Admin',
  description: 'Administrative dashboard for WalletOS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
