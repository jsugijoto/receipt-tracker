# 🧾 ReceiptTracker — AI Receipt Tracker & Expense Analytics

A 100% **free forever ($0.00/month)**, high-accuracy receipt tracking web app built for individuals and small groups (5–10 people).

---

## ⚡ Tech Stack

- **Frontend & App Framework:** [Next.js](https://nextjs.org/) (App Router, React 19, TypeScript)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) (Mobile-first, clean UI)
- **Database, Auth & Storage:** [Supabase](https://supabase.com/) (PostgreSQL + RLS + S3-compatible file storage + Auth)
- **AI OCR & Line-Item Extraction:** [Google Gemini 2.5 Flash](https://aistudio.google.com/) via `@google/genai`
- **Mobile Optimization:** Client-side image compression (`browser-image-compression`), PWA support ("Add to Home Screen")
- **Zero-Sleep Keep-Alive:** Built-in `/api/ping` endpoint compatible with free ping services (e.g. [cron-job.org](https://cron-job.org))

---

## 🚀 Quick Start Guide

### Step 1: Create Your Free Supabase Backend
1. Go to [supabase.com](https://supabase.com) and create a free account (no credit card needed).
2. Create a new project (e.g., `receipt-tracker`).
3. In your Supabase Dashboard:
   - Click **SQL Editor** on the left menu.
   - Click **New Query**.
   - Copy the entire contents of [`schema.sql`](./schema.sql) and paste it into the editor.
   - Click **Run**. This sets up the `receipts` table, `receipt_items` table, indexes, Row-Level Security (RLS), and the `receipts` storage bucket.
4. Grab your project keys:
   - Go to **Project Settings** (gear icon) ➔ **API**.
   - Copy your **Project URL** and **`anon` `public` key**.

---

### Step 2: Get Your Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with any Google account.
3. Click **"Create API Key"** (Free tier gives you up to **1,500 requests/day** at no charge).

---

### Step 3: Configure Environment Variables
Create a file named `.env.local` in the root of this project:

```bash
cp .env.example .env.local
```

Fill in your keys:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

---

### Step 4: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
1. Sign up for a free account on the `/login` page.
2. Go to **"Snap Receipt"** (`/upload`).
3. Upload or take a photo of a receipt.
4. Watch Gemini Flash extract the vendor, date, total, tax, and itemized lines in ~1 second!

---

### Step 5: Deploy to Vercel (Free Public Web URL)

1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Push to your GitHub repo
   ```
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Add the three Environment Variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
5. Click **Deploy**. Your app is now live at `https://your-project.vercel.app`!

---

### Step 6: Prevent Supabase from Pausing (Optional Free Keep-Alive)
Supabase free tier pauses if inactive for 7 days. To ensure it stays awake forever even when you don't use it:
1. Go to [cron-job.org](https://cron-job.org) (100% free).
2. Create a new cron job that makes a `GET` request to:
   ```
   https://your-project.vercel.app/api/ping
   ```
3. Set the schedule to run **once every 3 days**.

---

## 📱 Mobile Experience ("Add to Home Screen")
- **iPhone (Safari):** Open your Vercel URL ➔ tap the Share button (square with arrow) ➔ tap **"Add to Home Screen"**.
- **Android (Chrome):** Open your Vercel URL ➔ tap the three dots menu ➔ tap **"Install app"** or **"Add to Home screen"**.

The app opens like a native app and triggers your phone's camera directly when you tap **"Take Photo"**!
