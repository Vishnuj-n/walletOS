export function WalletStatusBanner({
  walletId,
  externalUserId,
  isSandbox,
}: {
  walletId: string;
  externalUserId: string;
  isSandbox: boolean;
}) {
  const maskedUserId =
    externalUserId.length > 4 ? `${'*'.repeat(Math.max(externalUserId.length - 4, 3))}${externalUserId.slice(-4)}` : externalUserId;

  return (
    <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-muted">Mounted wallet</p>
        <p className="font-semibold text-foreground">{walletId}</p>
      </div>
      <div className="text-sm text-muted">
        <span>User: {maskedUserId}</span>
        <span className="mx-2 hidden sm:inline">|</span>
        <span>{isSandbox ? 'Sandbox' : 'Live'}</span>
      </div>
    </div>
  );
}
