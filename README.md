# Friends Team Alarm — Web Push Backend

This project converts the uploaded Friends Team Alarm HTML into a self-hostable architecture with a Node.js backend, VAPID Web Push, a Service Worker, and a server-side scheduler.

## Important
The uploaded HTML currently depends on the Claude runtime (`claude.use('user')`, `claude.use('db')`, and `claude.use('assets')`). This project includes the backend and push infrastructure, but the frontend still needs its data adapter migrated from that runtime to these `/api/*` endpoints before it is a drop-in replacement.

## Setup
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Set a strong `ADMIN_KEY`.
4. Generate VAPID keys:
   `npx web-push generate-vapid-keys`
5. Put the public/private keys in `.env`.
6. Run `npm install` then `npm start`.
7. For real phone push, serve over HTTPS (localhost is the exception for development).

## Production
Use a real database (PostgreSQL/MySQL/etc.), HTTPS, object storage for uploads, and a process manager such as systemd/PM2. The scheduler runs inside the Node process, so keep at least one server instance alive.

## What the backend provides
- Admin/member login
- Persistent contacts, alarms, messages, acknowledgements and alarm state
- VAPID push subscriptions
- Service Worker push notifications
- Repeating alarm scheduling
- Multi-recipient push delivery
- Expired subscription cleanup
