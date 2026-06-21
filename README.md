# Brek's Field Kit

Brek's Field Kit is a persistent tabletop play dashboard for a level 7 Goblin Alchemist Artificer. It is optimized for live-session use on desktop, tablet, and phone, with Firebase-backed persistence for resources, spells, elixirs, Veech, infusions, rest resets, and session logging.

## Stack

- Next.js 16 with React 19 and TypeScript
- Tailwind CSS 4
- Firebase Authentication with anonymous sign-in
- Cloud Firestore for character state and session history
- Lucide React icons

## What Is Included

- Responsive app shell with desktop sidebar and mobile bottom navigation
- Seeded first-run Brek character data
- Dashboard, Combat, Spells & Elixirs, Veech, Exploration & Tools, Inventory & Infusions, Rest & Session, and Character Setup views
- Persistent resource counters with event logging
- Long rest, short rest, and dawn reset workflows
- Editable setup forms for core character data
- Firestore security rules scoped to the authenticated user
- Local cache fallback when Firebase is not configured yet

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local`.

3. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/).

4. Add a web app to the project and copy the config values into `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false
```

## Firebase Configuration

### Enable Anonymous Authentication

1. Open Firebase Console.
2. Go to `Authentication`.
3. Open the `Sign-in method` tab.
4. Enable `Anonymous`.

### Create Firestore

1. Go to `Firestore Database`.
2. Create the database in native mode.
3. Choose a region close to where you expect to run the app.
4. Deploy the included rules:

```bash
firebase deploy --only firestore:rules
```

## Running Locally

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Firebase env vars are missing, the app still runs with local browser cache so you can work on the UI before wiring the backend.

## Firebase Emulators

The repository includes auth and Firestore emulator ports in `firebase.json`.

1. Install the Firebase CLI if needed:

```bash
npm install -g firebase-tools
```

2. Log in:

```bash
firebase login
```

3. Start emulators:

```bash
firebase emulators:start
```

4. Set this in `.env.local` while using emulators:

```env
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true
```

## Firestore Structure

The app stores the seeded character here:

```text
users/{userId}/characters/brek-field-kit
```

The document contains:

- Core character data
- Stats and abilities
- Resources
- Attacks
- Spells
- Reminders and features
- Elixirs
- Tools
- Infusions
- Inventory
- Companion data
- Rest checklist
- Session event log

This keeps the first version practical while still leaving room to split event logs and multi-character support into subcollections later.

## Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
```

The build script uses `next build --webpack` for a stable production verification path.

## Deploying

### GitHub

1. Create a GitHub repository.
2. Push this project:

```bash
git init
git add .
git commit -m "Initial Brek's Field Kit app"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

3. Add your Firebase env vars to your hosting or CI environment.

### Firebase Hosting / Framework Deploy

For a framework-aware Firebase deploy:

```bash
firebase deploy
```

If you use GitHub Actions or another CI system, make sure the same `NEXT_PUBLIC_FIREBASE_*` variables are available during the build.

## Notes

- The app seeds Brek automatically on the first authenticated Firestore session.
- Anonymous auth is used now, but the Firebase setup is isolated so Google sign-in can be added later.
- The event log and resource counters are designed for live play first, rules encyclopedia second.
