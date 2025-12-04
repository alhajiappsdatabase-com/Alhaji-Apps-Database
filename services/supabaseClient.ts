
import { createClient } from '@supabase/supabase-js';

// Access env vars via import.meta.env (Vite standard)
const env = (import.meta as any).env || {};

// Robustly retrieve and trim keys to handle copy-paste errors
const getEnvVar = (key: string) => {
    const val = env[key];
    return typeof val === 'string' ? val.trim() : undefined;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Fallback credentials provided by user (for immediate functionality)
// NOTE: In a production environment, these should strictly be in .env files.
const FALLBACK_URL = 'https://chliosplscpmolapyllt.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNobGlvc3Bsc2NwbW9sYXB5bGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTIxMzUsImV4cCI6MjA3OTA2ODEzNX0.0RMVpjyhqka9wHMu5BdSsV1XcD5JKz5l9EEjpUiQ7vY';

// Initialize client with Env Vars first, then Fallback
const url = supabaseUrl || FALLBACK_URL;
const key = supabaseAnonKey || FALLBACK_KEY;

if (!url || !key) {
    console.error(
        "CRITICAL: Supabase credentials missing. Please check your .env file or Vercel project settings."
    );
} else {
    console.log(`[Supabase] Connecting to ${url.substring(0, 20)}...`);
}

export const supabase = createClient(url, key, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Increase storage key persistence
        storageKey: 'fintrack_auth_token',
    },
    global: {
        // Enhanced fetch retry logic for Windows resilience
        fetch: async (url, options) => {
            // RELIABILITY: 60s timeout to allow cold DB starts
            const MAX_RETRIES = 3; 
            const REQUEST_TIMEOUT = 60000; // 60s timeout
            let attempt = 0;

            while (attempt < MAX_RETRIES) {
                // 1. Check Offline Status immediately
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    throw new Error("Network request failed: Device is offline.");
                }

                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
                
                // Respect external abort signals (e.g., from checkConnection)
                if (options?.signal) {
                    options.signal.addEventListener('abort', () => {
                        clearTimeout(id);
                        controller.abort();
                    });
                }
                
                try {
                    const res = await fetch(url, {
                        ...options,
                        signal: controller.signal,
                        // Removed 'cache: no-store' to avoid potential CORS preflight issues on some networks
                    });
                    
                    clearTimeout(id);

                    // Accept 4xx errors (client errors) as valid responses (don't retry)
                    // Only retry on 5xx (server errors) or network failures
                    if (res.ok || res.status < 500) {
                        return res;
                    }
                    
                    // If 5xx, throw to trigger retry
                    throw new Error(`Server error: ${res.status}`);

                } catch (err: any) {
                    clearTimeout(id);
                    
                    // If aborted by caller (not timeout), rethrow immediately
                    if (options?.signal?.aborted) {
                        throw err;
                    }

                    const isLastAttempt = attempt === MAX_RETRIES - 1;

                    if (isLastAttempt) {
                        const msg = err.message || 'Unknown error';
                        console.warn(`Supabase Fetch failed after ${MAX_RETRIES} attempts. Last error: ${msg}`);
                        throw err;
                    }

                    // Optimized Backoff: 300ms, 600ms, 1200ms (Snappy retries)
                    const backoff = 300 * Math.pow(2, attempt);
                    const jitter = Math.random() * 100; 
                    
                    await new Promise(resolve => setTimeout(resolve, backoff + jitter));
                    attempt++;
                }
            }
            // Should be unreachable
            throw new Error("Network request failed after maximum retries");
        }
    }
});
