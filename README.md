
# FinTrack Pro

A professional financial management system for multi-branch money exchange businesses. Features include daily transaction tracking, capital management (cash in/out), commission calculation, and automated report generation.

## Features

*   **Multi-Tenant SaaS Ready:** Built with Supabase RLS to support multiple companies.
*   **Financial Tracking:** Daily balance reconciliation for branches and agents.
*   **Automated Reporting:** Generate daily balance, monthly statements, and commission reports (PDF/CSV).
*   **Real-time Collaboration:** See who is editing a transaction in real-time.
*   **AI Analyst:** Integrated Gemini AI for natural language financial insights.
*   **Role-Based Access:** Admin, Manager, and Clerk roles with granular permissions.
*   **Reconciliation Tool:** Compare system data with pasted payment logs.
*   **Offline Capable:** PWA-ready architecture.

## Tech Stack

*   **Frontend:** React 18 (Vite), Tailwind CSS
*   **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime)
*   **AI:** Google Gemini API (`@google/genai`)
*   **Utilities:** `jspdf` & `html2canvas` (PDF), `papaparse` (CSV), `recharts` (Charts)

## Prerequisites

1.  **Node.js** (v16 or higher)
2.  **Supabase Account:** Create a new project at [supabase.com](https://supabase.com).
3.  **Google AI Studio Key:** Get an API key from [aistudio.google.com](https://aistudio.google.com).

## CRITICAL FIRST STEP: Database Setup

**You MUST run this SQL script in your Supabase Dashboard to allow the app to work.**
Without this, Sign Up will fail with "Row-Level Security" errors and Settings will fail to save.

1.  Go to Supabase Dashboard -> **SQL Editor**.
2.  Click **New Query**.
3.  Copy/Paste the code below and click **Run**.

```sql
-- 1. GRANT PERMISSIONS (Fixes "violates row-level security policy")
GRANT ALL ON TABLE companies TO anon, authenticated, service_role;
GRANT ALL ON TABLE user_profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE settings TO anon, authenticated, service_role;

-- 2. ALLOW PUBLIC INSERTS POLICY (Fixes Company Creation)
DROP POLICY IF EXISTS "Insert company" ON companies;
DROP POLICY IF EXISTS "Enable insert for all users" ON companies;
CREATE POLICY "Insert company" ON companies FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 3. ADD MISSING COLUMNS (Fixes "Could not find the 'date_format' column")
ALTER TABLE settings ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'YYYY-MM-DD';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS commission_template_note text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS commission_template_thank_you text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_address text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_email text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_phone text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_logo text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_logo_size integer default 60;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS signature_title text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS signature_image text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS dormancy_threshold_days integer default 7;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_qr_code_on_report boolean default true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_rates jsonb default '{"branch": {"ria": 0, "moneyGram": 0, "westernUnion": 0, "afro": 0}, "agent": {"ria": 0, "moneyGram": 0, "westernUnion": 0, "afro": 0}}'::jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS principal_rates jsonb default '{"ria": 0, "moneyGram": 0, "westernUnion": 0, "afro": 0}'::jsonb;

-- 3b. FIX CASH OUTS TABLE (Fixes "Could not find entity_id column" and Constraint Errors)
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS entity_type text;
-- Drop NOT NULL on legacy CamelCase columns to allow new snake_case inserts to succeed
ALTER TABLE cash_outs ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE cash_outs ALTER COLUMN "entityType" DROP NOT NULL;

-- 3c. FIX AUDIT COLUMNS
ALTER TABLE cash_ins ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE cash_ins ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_name text;

-- 4. ENSURE TRIGGER EXISTS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, company_id, email, full_name, role, avatar_url)
  VALUES (
    new.id,
    (new.raw_user_meta_data->>'company_id')::uuid,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'Clerk'),
    'https://ui-avatars.com/api/?name=' || replace(new.raw_user_meta_data->>'full_name', ' ', '+')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'assets' );
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'assets' AND auth.role() = 'authenticated' );
```

## Setup Instructions (Local Dev)

1.  Create a `.env` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    API_KEY=your_google_gemini_api_key
    ```

2.  Install Dependencies & Run:
    ```bash
    npm install
    npm run dev
    ```

## Deployment

1.  Push code to GitHub.
2.  Import project into Vercel.
3.  Add Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `API_KEY`).
4.  Deploy.