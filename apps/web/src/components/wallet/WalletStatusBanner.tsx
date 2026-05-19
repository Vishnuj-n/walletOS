import { maskIdentifier, titleCaseStatus } from '../../lib/formatters';
import { WalletDto } from '../../types/wallet';

export function WalletStatusBanner({ wallet }: { wallet: WalletDto }) {
  const messages: string[] = [];

  if (wallet.is_sandbox) {
    messages.push('Test Mode Data');
  }

  if (wallet.status === 'frozen') {
    messages.push('Wallet is currently frozen. Transactions are view-only until service restores access.');
  }

  if (wallet.status === 'closed') {
    messages.push('Wallet is closed. Historical balance and transaction records remain available here.');
  }

  if (messages.length === 0) return null;

  return (
    <section
      className={`banner ${wallet.is_sandbox ? 'banner--sandbox' : ''} ${
        wallet.status === 'closed' ? 'banner--closed' : ''
      } ${wallet.status === 'frozen' ? 'banner--frozen' : ''}`}
      aria-label="Wallet status banner"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Environment</p>
        <p className="mt-2 text-lg font-semibold text-foreground">
          {wallet.is_sandbox ? 'Test Mode Data' : titleCaseStatus(wallet.status)}
        </p>
      </div>
      <div className="space-y-2 text-sm leading-6 text-foreground">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
        <p className="text-muted">User {maskIdentifier(wallet.external_user_id)} is viewing a read-only wallet embed.</p>
      </div>
    </section>
  );
}
