# ResQ — Hospital Blood Donation Web Admin Dashboard

ResQ is a web-based administrative dashboard for managing hospital blood donation operations. It gives hospital staff a real-time view of blood stock levels, donor registrations, appointment scheduling, and fulfillment analytics.

## Features

- **Dashboard** — live blood stock overview, stock criticality alerts, and recent donor arrivals, with fuzzy search across donors, request IDs, and units.
- **Donor Management** — registered donor records, appointment scheduling with day-by-day navigation, and DOH 90-day donation cooling period tracking.
- **Analytics & Reports** — donor response time trends, demand forecasting, fulfillment logs, and system health monitoring.
- **System Settings** — administrative account credentials, security protocol updates, and active session management.

## Tech Stack

- [React 19](https://react.dev/) with [React Router](https://reactrouter.com/)
- [Vite](https://vite.dev/) for build tooling and dev server
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Oxlint](https://oxc.rs/) for linting

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint the project:

```bash
npm run lint
```

## Project Structure

```
src/
  components/   Shared UI components (navigation, page headers)
  pages/        Route-level pages (Dashboard, Donor Management, Reports, Settings, etc.)
  utils/        Utility functions (fuzzy search, etc.)
```
