export function EmptyTransactionsState() {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-state__art" aria-hidden="true">
        <span className="empty-state__coin empty-state__coin--primary" />
        <span className="empty-state__coin empty-state__coin--secondary" />
        <span className="empty-state__line empty-state__line--top" />
        <span className="empty-state__line empty-state__line--bottom" />
      </div>
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold text-foreground">No transactions yet</h3>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">
          Credits and spending will appear here.
        </p>
      </div>
    </div>
  );
}
