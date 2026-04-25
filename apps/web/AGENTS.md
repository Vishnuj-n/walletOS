# Frontend Embed Specialist

The web app provides a read-only view of the user's wallet.

## UI Patterns
* Use Next.js and Tailwind CSS for the layout.
* Components must be themeable via a central theme provider.
* Implement skeleton loaders for all data fetching states.
* Desktop is the primary experience but the UI must remain functional at 360px.

## Security and Auth
* Use short-lived session tokens for all requests.
* Never store the live API key in the frontend.
* Request a new session token automatically 5 minutes before the current one expires.
* Mask sensitive account IDs in the interface.

## Performance
* Use TanStack Query for caching and synchronization.
* Limit transaction history lists to 20 items per page with cursor-based navigation.