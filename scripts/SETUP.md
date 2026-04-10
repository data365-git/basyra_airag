# AttendTrack Setup Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from **Project Settings → API**

## 2. Configure Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## 3. Run Database Schema

In Supabase dashboard → **SQL Editor**, run the contents of `scripts/schema.sql`

## 4. Create Demo Auth Users

In Supabase dashboard → **Authentication → Users**, create:

| Email | Password |
|-------|----------|
| admin@demo.com | demo1234 |
| scanner@demo.com | demo1234 |
| viewer@demo.com | demo1234 |

Note the UUID for each user.

## 5. Seed Demo Data

After creating auth users, in the SQL Editor, run `scripts/seed.sql`.

Then run this with the actual auth user UUIDs:

```sql
INSERT INTO staff_users (id, name, email, role_id, is_active) VALUES
  ('<admin-uuid>', 'Admin User', 'admin@demo.com', 'aaaaaaaa-0001-0000-0000-000000000000', true),
  ('<scanner-uuid>', 'Scanner User', 'scanner@demo.com', 'aaaaaaaa-0002-0000-0000-000000000000', true),
  ('<viewer-uuid>', 'Viewer User', 'viewer@demo.com', 'aaaaaaaa-0003-0000-0000-000000000000', true);
```

## 6. Install Dependencies & Run

```bash
npm install
npm run dev
```

## 7. Access the App

- Login: [http://localhost:3000/login](http://localhost:3000/login)
- Dashboard: [http://localhost:3000](http://localhost:3000)
- Scanner: [http://localhost:3000/scanner](http://localhost:3000/scanner)

## Demo QR Codes

The seed data includes 25 participants with QR tokens in the format:
```
qr_dilnoza_a1b2c3d4e5f60001
qr_bobur_a1b2c3d4e5f60002
...
```

You can scan these directly from the participant profile pages or print them.

## PWA Installation

1. Visit the app in Chrome/Safari on mobile
2. Use "Add to Home Screen" (iOS) or install prompt (Android/Chrome)
3. The app opens in standalone mode with full camera access

## Deployment to Vercel

1. Push code to GitHub
2. Connect repo in Vercel dashboard
3. Add environment variables in Vercel project settings
4. Deploy — Vercel automatically handles HTTPS (required for camera)
