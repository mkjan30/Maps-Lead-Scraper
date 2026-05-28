/*
  # Google Maps Scraper - Database Schema

  ## New Tables
  
  ### scrape_sessions
  - Tracks each scraping session
  - `id` (uuid, PK)
  - `keyword` - the search term used
  - `location` - optional location context
  - `status` - pending/running/completed/error
  - `total_results` - count of leads found
  - `created_at`, `completed_at`

  ### leads
  - Stores individual business leads collected
  - `id` (uuid, PK)
  - `session_id` - FK to scrape_sessions
  - `business_name`
  - `address`
  - `phone`
  - `website`
  - `google_maps_url`
  - `rating`
  - `review_count`
  - `category`
  - `hours`
  - `social_media` (jsonb - array of social profile URLs)
  - `extra_data` (jsonb - any other captured fields)
  - `created_at`

  ## Security
  - RLS enabled on both tables
  - Public anon insert/select allowed (extension is client-side tool, no user auth)
*/

CREATE TABLE IF NOT EXISTS scrape_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL DEFAULT '',
  location text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  total_results integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE scrape_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can select scrape_sessions"
  ON scrape_sessions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert scrape_sessions"
  ON scrape_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update scrape_sessions"
  ON scrape_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  business_name text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  website text DEFAULT '',
  google_maps_url text DEFAULT '',
  rating text DEFAULT '',
  review_count text DEFAULT '',
  category text DEFAULT '',
  hours text DEFAULT '',
  social_media jsonb DEFAULT '[]'::jsonb,
  extra_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_session_id_idx ON leads(session_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can select leads"
  ON leads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can insert leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update leads"
  ON leads FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon can delete leads"
  ON leads FOR DELETE
  TO anon
  USING (true);
