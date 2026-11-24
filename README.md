# Maps Lead Scraper

A Chrome extension (Manifest V3) that collects business leads from Google Maps search results and exports them to CSV.

> Status: prototype, originally scaffolded with [Bolt](https://bolt.new/~/sb1-eppgzqgr).

## What it captures

Business name, category, address, phone, website, Google Maps URL, rating, review count, opening hours, social media links, plus code and price level.

## How it works

- A **content script** reads listings on `google.com/maps` pages.
- A **background service worker** saves each lead and scrape session to Supabase.
- The **popup** (React) starts and stops a scrape, shows collected leads and downloads them as CSV.

## Tech stack

TypeScript, React 18, Vite, Tailwind CSS, Supabase, lucide-react

## Setup

1. Create a Supabase project and run the migration in `supabase/migrations/`.
2. Create a `.env` file in the project root:

   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Replace the Supabase URL and key at the top of `src/background/background.ts` with your own project's values.
4. Install and build:

   ```bash
   npm install
   npm run build
   ```

5. Add icons at `public/icons/icon16.png`, `icon48.png` and `icon128.png` (the manifest references them), then rebuild.
6. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select the `dist` folder.

## Usage

Open Google Maps, search for a business type and area, then open the extension popup and start the scrape. Export the results with the CSV button.

## Responsible use

Collecting data from Google Maps may be restricted by Google's terms of service and by privacy laws in your region. Check both before using this tool, and only contact businesses in ways the law allows.
