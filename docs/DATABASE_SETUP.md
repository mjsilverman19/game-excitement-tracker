# Database Setup Instructions

The search functionality requires a Supabase database to be configured. Follow these steps to enable it:

## Prerequisites

1. A Supabase account (free tier works) - [Sign up here](https://app.supabase.com)
2. Your project deployed on Vercel

## Setup Steps

### 1. Get Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy these values:
   - `Project URL` (starts with https://*.supabase.co)
   - `anon public` key
   - `service_role` key (keep this secret!)

### 2. Configure Environment Variables on Vercel

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add these variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL = [your project URL]
   NEXT_PUBLIC_SUPABASE_ANON_KEY = [your anon key]
   SUPABASE_SERVICE_ROLE_KEY = [your service role key]
   ```
4. Click "Save" for each variable

### 3. Redeploy Your Project

After adding the environment variables, you need to redeploy:
1. Go to the Deployments tab in Vercel
2. Click the three dots on your latest deployment
3. Select "Redeploy"

## What Works Without Database Setup

Even without the database configured, the app still works for:
- Live game excitement analysis
- Real-time NFL game tracking
- ESPN data fetching
- Entertainment score calculations

The only features that require database setup are:
- Team search (e.g., "Show all Steelers games")
- Top excitement games search
- Historical game queries

## Troubleshooting

If you see "Database search is not configured" error:
- Ensure all three environment variables are set correctly in Vercel
- Make sure you've redeployed after adding the variables
- Check that your Supabase project is active (not paused)

If you see "Unexpected token" errors:
- This usually means the API endpoint isn't receiving the environment variables
- Double-check the variable names match exactly
- Ensure there are no extra spaces or quotes in the values