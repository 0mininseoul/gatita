# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

가천대학교 학생 전용 통학 경로 동행 플랫폼 - 가천대 이메일 인증으로 학생 간 안전한 통학 동행자 매칭 및 실시간 채팅 서비스.

## Development Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime + Auth)
- **3D Effects**: Three.js, GSAP
- **UI Libraries**: lucide-react, react-hot-toast
- **PWA**: Service Worker, Web Push Notifications

## Architecture

### Authentication Flow
1. **Signup**: Email verification via Supabase Auth → User profile creation in `users` table
2. **Login**: Supabase Auth session → Profile fetch from `users` table
3. **Session Management**: Client-side session handling with `@supabase/ssr`
4. **Admin Access**: Determined only by `users.is_admin`

### Data Flow
- **Client**: Uses `createClient()` from [lib/supabase.ts](lib/supabase.ts) for browser operations
- **Realtime**: Supabase Realtime subscriptions for chat messages
- **RLS**: All tables have Row Level Security policies (see [supabase_schema.sql](supabase_schema.sql))

### Key Routes
- `/` - Landing page (unauthenticated) / Home dashboard (authenticated)
- `/rooms?from={location}&to={location}` - Chat room list for specific route
- `/rooms/[id]` - Individual chat room with real-time messaging
- `/admin` - Admin dashboard (requires `is_admin` or admin email)
- `/settings` - User profile settings

### Database Schema
Core tables (see [supabase_schema.sql](supabase_schema.sql)):
- `users` - User profiles (linked to auth.users)
- `chat_rooms` - Chat rooms with departure info
- `room_participants` - Many-to-many relationship with confirmation status
- `messages` - Chat messages with user references
- `reports` - User report system
- `favorites` - User's favorite routes

### Location System
Fixed 4 locations defined as enum in [lib/supabase.ts](lib/supabase.ts):
- `가천대역_1번출구`
- `가천대학교_정문`
- `교육대학원`
- `제3기숙사`
- `제2기숙사`
- `AI공학관`

Routes are defined by `from_location` and `to_location` pairs.

### Room Participation Flow
1. Room creator automatically joins as first participant with `confirmed: true`
2. Other users join with `confirmed: false`
3. Users can toggle confirmation status in chat room
4. Max 4 participants per room (hardcoded)

### State Management
- No global state library - uses React hooks and Supabase subscriptions
- Auth state synced via `supabase.auth.onAuthStateChange()`
- Real-time chat via Supabase Realtime subscriptions to `messages` table

## Important Implementation Details

### Environment Variables
Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - (Optional) Service role key for admin operations

### Signup Flow
Google OAuth login first. For Gachon (`@gachon.ac.kr`) accounts, a DB trigger (`handle_new_user`) auto-creates a `public.users` row (public: department + avatar from Google) and a `user_private_profiles` row (private: email + name from Google) at login — so every Gachon login counts as a user even before onboarding. Non-Gachon accounts are rejected in the callback and their `auth.users` row is deleted.

Onboarding (the `/api/profile/complete` route) then fills nickname (public), and phone + bank/payout fields (private), and sets `user_private_profiles.onboarded_at`. **Onboarding completion is determined solely by `onboarded_at IS NOT NULL`.** Payout/bank info lives on `user_private_profiles` (the separate `user_payout_accounts` table was merged in and removed); account edits go through `/api/profile/payout`. The app no longer uses email/password auth or password reset routes.

### RLS Policies
- Room messages only accessible to participants (enforced via `room_participants` join)
- Users can only update their own profile
- Reports only visible to admins
- See [supabase_schema.sql](supabase_schema.sql) lines 89-133 for all policies

### PWA Configuration
- Manifest: [public/manifest.json](public/manifest.json)
- Service Worker: [public/sw.js](public/sw.js)
- Icons live in `public/icons/`.

## Testing & Deployment

### Local Testing
1. Set up Supabase project
2. Run [supabase_schema.sql](supabase_schema.sql) in SQL Editor
3. Configure `.env.local` with project credentials
4. Run `npm install` then `npm run dev`

### Deployment
- Platform: Vercel (recommended)
- Set environment variables in Vercel dashboard
- Automatic deployments on push to main branch

## Common Patterns

### Creating Supabase Client
```typescript
import { createClient } from '@/lib/supabase'
const supabase = createClient()
```

### Fetching User Data
```typescript
const { data: { user } } = await supabase.auth.getUser()
const { data: userData } = await supabase
  .from('users')
  .select('*')
  .eq('id', user.id)
  .single()
```

### Joining a Room
```typescript
// Insert participant
await supabase.from('room_participants').insert({
  room_id: roomId,
  user_id: userId,
  confirmed: false
})
```

### Real-time Subscription
```typescript
const channel = supabase
  .channel('messages')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
    (payload) => handleNewMessage(payload.new)
  )
  .subscribe()
```

## Legal & Business Context

This is a **non-commercial community platform** for Gachon University students:
- No payment processing
- Collects phone and payout account details for profile setup and room-scoped coordination
- Payout account details are stored privately and shown to room participants only when the host registers/discloses them
- Matching, chat, and settlement coordination service only
- Designed to avoid taxi-sharing service regulations
