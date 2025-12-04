
import { supabase } from './supabaseClient';
import { ApiService, User, Branch, Agent, Transaction, CashIn, CashOut, Income, Expense, Settings, Notification, EditLog, ServiceType } from '../types';
import { offlineQueue } from './offlineQueue';

// --- Helper for robust error logging ---
const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown error object';
    }
};

// --- Data Mappers (Safety Layer) ---

const mapUser = (profile: any): User => ({
    id: profile.id,
    companyId: profile.company_id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    avatarUrl: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name)}`
});

const mapUserFromMetadata = (user: any): User => ({
    id: user.id,
    companyId: user.user_metadata.company_id,
    name: user.user_metadata.full_name || user.email?.split('@')[0] || 'User',
    email: user.email || '',
    role: user.user_metadata.role || 'Clerk',
    avatarUrl: user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.user_metadata.full_name || 'User')}`
});

const defaultRates = { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 };

const mapBranch = (data: any): Branch => ({
    id: data.id,
    companyId: data.company_id,
    name: data.name,
    location: data.location,
    rates: data.rates || defaultRates,
    isActive: data.isActive,
    initialBalance: data.initialBalance || 0,
    editHistory: data.editHistory || [],
    createdAt: data.createdAt
});

const mapAgent = (data: any): Agent => ({
    id: data.id,
    companyId: data.company_id,
    name: data.name,
    location: data.location,
    rates: data.rates || defaultRates,
    isActive: data.isActive,
    initialBalance: data.initialBalance || 0,
    editHistory: data.editHistory || [],
    createdAt: data.createdAt
});

const mapTransaction = (data: any): Transaction => ({
    id: data.id,
    companyId: data.company_id,
    date: data.date,
    entityId: data.entityId,
    entityType: data.entityType,
    openingBalance: Number(data.openingBalance) || 0,
    cashReceived: Number(data.cashReceived) || 0,
    totalCash: Number(data.totalCash) || 0,
    cashPaidByService: data.cashPaidByService || {
        ria: { formula: '0', total: 0 },
        moneyGram: { formula: '0', total: 0 },
        westernUnion: { formula: '0', total: 0 },
        afro: { formula: '0', total: 0 }
    },
    totalCashPaid: Number(data.totalCashPaid) || 0,
    closingBalance: Number(data.closingBalance) || 0,
    createdAt: data.createdAt,
    createdByUserId: data.createdByUserId,
    createdByName: data.createdByName,
    editHistory: data.editHistory || []
});

const mapSettings = (data: any): Settings => ({
    companyId: data.company_id,
    companyName: data.company_name || '',
    defaultRates: data.default_rates || { branch: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 }, agent: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 } },
    principalRates: data.principal_rates || { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 },
    currency: data.currency || 'USD',
    dateFormat: data.date_format || 'YYYY-MM-DD',
    signatureTitle: data.signature_title || '',
    signatureImage: data.signature_image || null,
    commissionTemplateNote: data.commission_template_note || '',
    commissionTemplateThankYou: data.commission_template_thank_you || '',
    companyLogo: data.company_logo || null,
    companyLogoSize: data.company_logo_size || 60,
    companyAddress: data.company_address || '',
    companyEmail: data.company_email || '',
    companyPhone: data.company_phone || '',
    dormancyThresholdDays: data.dormancy_threshold_days || 0,
    showQRCodeOnReport: data.show_qr_code_on_report ?? true,
});

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const uploadImage = async (fileBase64: string, path: string): Promise<string | null> => {
    try {
        if (!navigator.onLine) return fileBase64; // Cannot upload offline
        if (!fileBase64.startsWith('data:image')) return fileBase64;

        const response = await fetch(fileBase64);
        const blob = await response.blob();
        const fileExt = blob.type.split('/')[1];
        const fileName = `${path}.${fileExt}`;

        const { error } = await supabase.storage
            .from('assets')
            .upload(fileName, blob, { upsert: true });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
        return publicUrl;
    } catch (e) {
        console.error("Image upload failed", e);
        return null;
    }
};

// Helper to avoid "Realtime send() is automatically falling back to REST API" warning
// Checks if channel is joined (socket active); if not, explicitly uses httpSend (REST)
const sendRealtimeMessage = async (channel: any, message: any) => {
    try {
        if (channel.state === 'joined') {
            await channel.send(message);
        } else if (typeof channel.httpSend === 'function') {
            await channel.httpSend(message);
        } else {
            // Fallback for older client versions
            await channel.send(message);
        }
    } catch (e) {
        // Suppress errors for fire-and-forget messages to prevent unhandled promise rejections
        // console.warn("Realtime send failed", e);
    }
};

const broadcastNotification = async (companyId: string, message: string, userId: string, userName: string, entityId?: string, entityType?: 'branch' | 'agent' | 'user') => {
    if (!navigator.onLine) return; // Skip realtime if offline
    
    const notification = {
        company_id: companyId,
        message,
        entityId,
        entityType,
        isRead: false,
        createdByUserId: userId,
        createdByName: userName,
        createdAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('notifications').insert(notification).select().single();
    
    if (!error && data) {
        const channel = supabase.channel(`notifications-${companyId}`);
        await sendRealtimeMessage(channel, {
            type: 'broadcast',
            event: 'NEW_NOTIFICATION',
            payload: data
        });
    }
};

const broadcastDataChange = async (companyId: string, table: string, action: 'INSERT' | 'UPDATE' | 'DELETE', record: any) => {
    if (!navigator.onLine) return;
    const channel = supabase.channel(`notifications-${companyId}`);
    // Fire and forget - we want low latency
    sendRealtimeMessage(channel, {
        type: 'broadcast',
        event: 'DATA_CHANGE',
        payload: { table, action, record }
    }).catch(() => {});
};

const checkDormancy = async (companyId: string) => {
    // RATE LIMIT: Only run this check once every 12 hours per device/browser session
    const lastCheckKey = `fintrack_dormancy_check_${companyId}`;
    const lastCheck = localStorage.getItem(lastCheckKey);
    const now = Date.now();
    
    if (lastCheck && (now - parseInt(lastCheck)) < 12 * 60 * 60 * 1000) {
        return;
    }
    
    // Update timestamp immediately
    localStorage.setItem(lastCheckKey, now.toString());

    if (!navigator.onLine) return;

    // Use try-catch to prevent background tasks from crashing the app
    try {
        const { data: settings } = await supabase.from('settings').select('*').eq('company_id', companyId).maybeSingle();
        if (!settings || !settings.dormancy_threshold_days) return;

        const threshold = settings.dormancy_threshold_days;
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - threshold);
        const isoDate = dateThreshold.toISOString().split('T')[0];

        const { data: branches } = await supabase.from('branches').select('*').eq('company_id', companyId);
        const { data: agents } = await supabase.from('agents').select('*').eq('company_id', companyId);
        
        const processEntity = async (entity: any, type: 'branch' | 'agent') => {
            const { data: lastTx } = await supabase
                .from('transactions')
                .select('date')
                .eq('company_id', companyId)
                .eq('entityId', entity.id)
                .gt('totalCashPaid', 0)
                .order('date', { ascending: false })
                .limit(1)
                .maybeSingle();

            let isDormant = false;
            if (!lastTx) {
                    if (entity.createdAt && entity.createdAt < isoDate) isDormant = true;
            } else {
                if (lastTx.date < isoDate) isDormant = true;
            }

            if (isDormant) {
                const { data: existingNotif } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('entityId', entity.id)
                    .ilike('message', `%dormant%`)
                    .gt('createdAt', isoDate)
                    .maybeSingle();
                    
                if (!existingNotif) {
                    await broadcastNotification(
                        companyId,
                        `Alert: ${entity.name} has been dormant for over ${threshold} days.`,
                        'system', 'System', entity.id, type
                    );
                }
            }
        };

        if (branches) {
            for (const branch of branches) {
                if (branch.isActive) await processEntity(branch, 'branch');
            }
        }
        
        if (agents) {
            for (const agent of agents) {
                if (agent.isActive) await processEntity(agent, 'agent');
            }
        }
    } catch (e) {
        console.warn("Dormancy check failed:", getErrorMessage(e));
    }
};

const profileRequestCache = new Map<string, Promise<any>>();

const fetchProfileWithRetry = async (userId: string) => {
    if (profileRequestCache.has(userId)) {
        return profileRequestCache.get(userId);
    }

    const request = (async () => {
        // RELIABILITY: 5 retries is robust for cold starts
        const MAX_RETRIES = 5; 
        let lastError = null;

        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (!error && data) {
                    return data;
                }

                lastError = error;

                if (error && error.code === 'PGRST116') {
                     // Not found. Wait longer before giving up.
                     if (i > 3) throw new Error("User profile not found. Please contact support.");
                }
            } catch (e: any) {
                lastError = e;
                if (e.message && e.message.includes('User profile not found')) throw e;
            }

            // OPTIMIZATION: 500ms delay per retry (faster cold start recovery)
            const delay = 500; 
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        console.warn("Profile fetch failed after retries:", getErrorMessage(lastError));
        // Do not throw here if we can avoid it, or throw something restoreSession can handle
        throw new Error("Connection timed out. The database is taking too long to respond.");
    })();

    profileRequestCache.set(userId, request);
    
    setTimeout(() => {
        if (profileRequestCache.has(userId)) {
            profileRequestCache.delete(userId);
        }
    }, 5000);

    return request;
};

// Generic Helper to attempt multiple insertion payloads to handle schema differences
const tryInsertWithFallbacks = async (table: string, payloads: any[]): Promise<any> => {
    let lastError: any = null;
    for (const payload of payloads) {
        try {
            const { data, error } = await supabase.from(table).insert(payload).select().single();
            if (!error) return data;
            
            // If error is NOT about missing columns (e.g. RLS, unique constraint), throw immediately
            if (error.code === '42501' || error.code === '23505') {
                throw error;
            }
            lastError = error;
            // Continue to next payload if it's likely a schema mismatch (42703 undefined_column)
        } catch (e: any) {
            lastError = e;
            if (e.code === '42501' || e.code === '23505') throw e;
        }
    }
    throw new Error(lastError?.message || `Failed to insert into ${table} after multiple attempts.`);
};

export const supabaseApi: ApiService = {
    realtime: {
        subscribe: (channelName: string, callback: (payload: any) => void) => {
            const channel = supabase.channel(channelName)
                .on('broadcast', { event: 'NEW_NOTIFICATION' }, (payload) => callback(payload))
                .on('broadcast', { event: 'PRESENCE_UPDATE' }, (payload) => callback(payload.payload)) 
                .on('broadcast', { event: 'DATA_CHANGE' }, (payload) => callback(payload.payload))
                .subscribe();
            return { 
                unsubscribe: () => { supabase.removeChannel(channel); },
                subscriberId: generateUUID() 
            };
        },
        broadcast: async (channelName: string, payload: any, senderId: string) => {
             if (!navigator.onLine) return;
             const channel = supabase.channel(channelName);
             try {
                 await sendRealtimeMessage(channel, {
                    type: 'broadcast',
                    event: 'PRESENCE_UPDATE',
                    payload: { ...payload, senderId }
                });
             } catch (e) {
                 // Silent fail for presence updates if channel isn't ready yet
             }
        },
        subscribeToPresence: (channelName: string, userState: any, onSync: (users: any[]) => void) => {
            if (!navigator.onLine) return { unsubscribe: () => {} };
            
            const channel = supabase.channel(channelName, {
                config: {
                    presence: {
                        key: userState.userId,
                    },
                },
            });

            // Robust state update function used for sync, join, and leave
            const updateState = () => {
                const newState = channel.presenceState();
                const users: any[] = [];
                for (const key in newState) {
                    // newState[key] is an array of presence objects for that key (userId)
                    // We take the first one (most recent usually)
                    if (newState[key].length > 0) {
                        users.push(newState[key][0]);
                    }
                }
                onSync(users);
            };

            channel
                .on('presence', { event: 'sync' }, updateState)
                .on('presence', { event: 'join' }, updateState) // Trigger update on user join
                .on('presence', { event: 'leave' }, updateState) // Trigger update on user leave
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track(userState);
                    }
                });

            return {
                unsubscribe: () => {
                    channel.untrack().then(() => supabase.removeChannel(channel));
                }
            };
        }
    },

    checkConnection: async () => {
        if (!navigator.onLine) return { success: false, message: 'Offline Mode' };
        try {
            // Small delay to ensure network driver is ready on OS wake
            await new Promise(resolve => setTimeout(resolve, 100)); 
            
            // Timeout promise to prevent hanging indefinitely on zombie connections
            const controller = new AbortController();
            // RELIABILITY: 20s timeout for quicker offline detection but allows wakeup
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            
            // Check 'companies' table as it is the root entity
            const { data, error } = await supabase
                .from('companies')
                .select('id')
                .limit(1)
                .maybeSingle()
                .abortSignal(controller.signal);
            
            clearTimeout(timeoutId);
            
            if (error) {
                if (error.code === '42P01') { // undefined_table
                    return { success: false, message: 'Database tables missing. Run setup script.' };
                }
                // Ignore RLS errors if checking connection, as anonymous might not have select access yet
                // but the query executed, meaning connection is OK.
                if (error.code === '42501') {
                    return { success: true, message: 'Connected (RLS Active)' };
                }
                throw new Error(error.message);
            }
            return { success: true, message: 'Connected to Supabase' };
        } catch (error: any) {
            const msg = error.name === 'AbortError' ? 'Connection check timed out' : (error.message || 'Connection failed');
            return { success: false, message: msg };
        }
    },

    checkEmailExists: async (email: string) => {
        const emailLower = email.trim().toLowerCase();
        const { data, error } = await supabase.from('user_profiles').select('id').eq('email', emailLower).maybeSingle();
        return !!data;
    },
    
    getCanonicalCompanyName: async (companyName: string) => {
        const { data, error } = await supabase
            .from('companies')
            .select('name')
            .ilike('name', companyName)
            .maybeSingle();
            
        if (error || !data) return null;
        return data.name;
    },

    checkCompanyNameExists: async (companyName: string) => {
        const canonical = await supabaseApi.getCanonicalCompanyName(companyName);
        return !!canonical;
    },

    login: async (email, password) => {
        if (!password) throw new Error("Password required");
        const emailLower = email.trim().toLowerCase();

        // Fire-and-forget cleanup: Don't wait for it
        supabase.auth.signOut().catch(() => {});

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: emailLower, password });
            if (error) throw error;
            if (!data.user) return null;

            // OPTIMIZATION: If metadata exists, return IMMEDIATELY.
            if (data.user.user_metadata?.company_id && data.user.user_metadata?.role) {
                // Background: Fetch latest profile to ensure metadata stays in sync for future
                fetchProfileWithRetry(data.user.id).then(profile => {
                    if (profile) {
                        supabase.auth.updateUser({
                            data: {
                                company_id: profile.company_id,
                                role: profile.role,
                                full_name: profile.full_name,
                                avatar_url: profile.avatar_url
                            }
                        }).catch(() => {}); // Fire and forget update
                    }
                }).catch(() => {});

                return mapUserFromMetadata(data.user);
            }

            // Fallback: If no metadata (legacy or first run), wait for profile
            const profile = await fetchProfileWithRetry(data.user.id);
            
            // Update metadata for next time
            if (profile) {
                supabase.auth.updateUser({
                    data: {
                        company_id: profile.company_id,
                        role: profile.role,
                        full_name: profile.full_name,
                        avatar_url: profile.avatar_url
                    }
                }).catch(() => {});
            }

            return mapUser(profile);
        } catch (error: any) {
            let msg = error.message;
            if (msg === 'Failed to fetch' || msg.includes('Network request failed')) {
                msg = "Connection failed. Please check your internet connection and try again.";
            } else if (msg.includes("Invalid login credentials")) {
                msg = "Invalid email or password.";
            }
            throw new Error(msg);
        }
    },

    signUp: async (name, email, password, companyName) => {
        const emailLower = email.trim().toLowerCase();
        const canonicalName = await supabaseApi.getCanonicalCompanyName(companyName);
        let companyId: string;
        let role: 'Admin' | 'Clerk' = 'Admin';

        if (canonicalName) {
            const { data: company } = await supabase.from('companies').select('id').eq('name', canonicalName).single();
            companyId = company!.id;
            role = 'Clerk'; 
        } else {
            const { data: company, error: companyError } = await supabase.from('companies').insert({ name: companyName }).select().single();
            
            if (companyError) {
                const msg = getErrorMessage(companyError);
                if (companyError.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
                     throw new Error("DATABASE SETUP REQUIRED: Row-level security policy violation.");
                }
                throw new Error(msg);
            }
            companyId = company.id;

            try {
                await supabase.from('settings').insert({
                    company_id: companyId,
                    currency: 'USD'
                });
            } catch (settingsError) {
                // Ignore
            }
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: emailLower,
            password,
            options: {
                data: { full_name: name, company_id: companyId, role: role }
            }
        });

        if (authError) throw new Error(authError.message);
        if (!authData.user) throw new Error("User creation failed");

        const profile = await fetchProfileWithRetry(authData.user.id);
        return mapUser(profile);
    },

    logout: async () => {
        await supabase.auth.signOut();
    },
    
    resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin, 
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
    },
    
    resendConfirmationEmail: async (email) => {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email,
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
    },

    restoreSession: async () => {
        // Attempt restoration with retries for flakey connections
        let attempts = 0;
        let sessionResult = null;
        let lastError = null;

        // RELIABILITY: Increased attempts to 3
        while (attempts < 3) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session) {
                sessionResult = data.session;
                break;
            }
            if (error) lastError = error;
            // RELIABILITY: Increased wait time
            await new Promise(r => setTimeout(r, 500));
            attempts++;
        }

        if (lastError && (lastError.message.includes("Invalid Refresh Token") || lastError.message.includes("Refresh Token Not Found"))) {
             await supabase.auth.signOut();
             return null;
        }
        
        // If we really don't have a session locally, return null to prompt login
        if (!sessionResult?.user) return null;
        
        // OPTIMIZATION: If we have a valid session with metadata, return immediately.
        if (sessionResult.user.user_metadata?.company_id && sessionResult.user.user_metadata?.role) {
             // Background verify
             fetchProfileWithRetry(sessionResult.user.id).catch(() => {});
             return mapUserFromMetadata(sessionResult.user);
        }

        try {
            // Attempt to fetch fresh profile from DB
            const profile = await fetchProfileWithRetry(sessionResult.user.id);
            return mapUser(profile);
        } catch (e) {
            console.warn("Session restore profile fetch failed:", getErrorMessage(e));
            
            // FAIL-SAFE: If network fails but we have a valid JWT session,
            // construct a user object from the session metadata.
            console.warn("Entering Offline Mode using fallback session data.");
            
            return {
                id: sessionResult.user.id,
                companyId: sessionResult.user.user_metadata?.company_id || '', 
                name: sessionResult.user.user_metadata?.full_name || sessionResult.user.email?.split('@')[0] || 'User',
                email: sessionResult.user.email || '',
                role: sessionResult.user.user_metadata?.role || 'Clerk',
                avatarUrl: sessionResult.user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sessionResult.user.email?.split('@')[0] || 'U')}`
            };
        }
    },

    onAuthStateChange: (callback) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'TOKEN_REFRESH_FAILED') {
                 // On Windows/unstable networks, token refresh might fail temporarily.
                 // We don't force logout here; we let the session expire naturally or wait for restoreSession to handle it.
                 console.warn("Token refresh failed - network might be offline.");
                 return;
            }

            if (event === 'SIGNED_IN' && session?.user) {
                // If metadata exists, callback immediately for responsiveness
                if (session.user.user_metadata?.company_id) {
                    callback(mapUserFromMetadata(session.user), 'SIGNED_IN');
                }

                // Also attempt to fetch fresh profile data
                try {
                    const profile = await fetchProfileWithRetry(session.user.id);
                    callback(mapUser(profile), 'SIGNED_IN');
                } catch (e) {
                    console.warn("Auth state change profile fetch failed", getErrorMessage(e));
                }
            } else if (event === 'SIGNED_OUT') {
                callback(null, 'SIGNED_OUT');
            } else if (event === 'PASSWORD_RECOVERY') {
                callback(session?.user ? { ...mapUserFromMetadata(session.user), id: session.user.id } as any : null, 'PASSWORD_RECOVERY');
            }
        });
        return () => subscription.unsubscribe();
    },

    getUsers: async (companyId) => {
        if (!navigator.onLine) return [];
        try {
            const { data, error } = await supabase.from('user_profiles').select('*').eq('company_id', companyId);
            if (error) throw error;
            return data.map(mapUser);
        } catch (error: any) {
             console.warn(`Fetch users failed: ${getErrorMessage(error)}`);
             return []; // Fail gracefully with empty list
        }
    },

    getBranches: async (companyId) => {
        if (!navigator.onLine) return [];
        // Optimized: Exclude editHistory for lighter payload
        try {
            const { data, error } = await supabase.from('branches')
                .select('id, company_id, name, location, rates, isActive, initialBalance, createdAt')
                .eq('company_id', companyId)
                .order('name');
            if (error) throw error;
            return data.map(mapBranch);
        } catch (error: any) {
             console.warn(`Fetch branches failed: ${getErrorMessage(error)}`);
             return [];
        }
    },

    getAgents: async (companyId) => {
        if (!navigator.onLine) return [];
        // Optimized: Exclude editHistory for lighter payload
        try {
            const { data, error } = await supabase.from('agents')
                .select('id, company_id, name, location, rates, isActive, initialBalance, createdAt')
                .eq('company_id', companyId)
                .order('name');
            if (error) throw error;
            return data.map(mapAgent);
        } catch (error: any) {
             console.warn(`Fetch agents failed: ${getErrorMessage(error)}`);
             return [];
        }
    },

    // Optimized to accept limit to prevent heavy load on Dashboard
    getTransactions: async (companyId, limit = 300) => {
        if (!navigator.onLine) return [];
        // Optimized: Explicitly select columns to exclude editHistory which can be huge
        try {
            const { data, error } = await supabase.from('transactions')
                .select('id, company_id, date, entityId, entityType, openingBalance, cashReceived, totalCash, cashPaidByService, totalCashPaid, closingBalance, createdAt, createdByUserId, createdByName')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return data.map(mapTransaction);
        } catch (e: any) {
            console.warn(`Fetch transactions failed: ${getErrorMessage(e)}`);
            // Return empty array instead of throwing to prevent UI crash
            return [];
        }
    },

    getTransactionsByRange: async (companyId, startDate, endDate) => {
        if (!navigator.onLine) return [];
        // Optimized: Exclude editHistory
        try {
            const { data, error } = await supabase.from('transactions')
                .select('id, company_id, date, entityId, entityType, openingBalance, cashReceived, totalCash, cashPaidByService, totalCashPaid, closingBalance, createdAt, createdByUserId, createdByName')
                .eq('company_id', companyId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });
            if (error) throw error;
            return data.map(mapTransaction);
        } catch (e: any) {
            console.error(`Fetch transactions range failed: ${getErrorMessage(e)}`);
            return [];
        }
    },

    getEntityHistory: async (companyId, entityId, limit = 100) => {
        if (!navigator.onLine) return [];
        // This method INTENTIONALLY fetches editHistory as it's for audit logs
        const { data, error } = await supabase.from('transactions')
            .select('*')
            .eq('company_id', companyId)
            .eq('entityId', entityId)
            .order('date', { ascending: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return data.map(mapTransaction);
    },

    getCashIns: async (companyId, limit = 200) => {
        if (!navigator.onLine) return [];
        // Optimized: Exclude unnecessary audit trails if any
        try {
            const { data, error } = await supabase.from('cash_ins')
                .select('id, company_id, date, amount, source, note, created_at, created_by, created_by_name')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit(limit);

            if (error) {
                // FAIL-SAFE: If created_at column is missing (legacy DB), fetch without it
                if (error.code === '42703') { // undefined_column
                     const { data: fallbackData, error: fallbackError } = await supabase.from('cash_ins')
                        .select('id, company_id, date, amount, source, note')
                        .eq('company_id', companyId)
                        .order('date', { ascending: false })
                        .limit(limit);
                     if (fallbackError) throw fallbackError;
                     
                     return (fallbackData || []).map(d => ({
                        id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, source: d.source, note: d.note, 
                        createdAt: new Date().toISOString(), createdByUserId: '', createdByName: ''
                    }));
                }
                throw error;
            }

            return (data || []).map(d => ({
                id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, source: d.source, note: d.note, createdAt: d.created_at, createdByUserId: d.created_by, createdByName: d.created_by_name
            }));
        } catch (e: any) {
            console.warn(`Fetch cash ins failed: ${getErrorMessage(e)}`);
            return [];
        }
    },

    getCashOuts: async (companyId, limit = 200) => {
        if (!navigator.onLine) return [];
        try {
            const { data, error } = await supabase.from('cash_outs')
                .select('id, company_id, date, amount, entity_id, entityId, entity_type, entityType, note, created_at, created_by, created_by_name')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit(limit);

            if (error) {
                // FAIL-SAFE for missing columns
                if (error.code === '42703') {
                     const { data: fallbackData, error: fallbackError } = await supabase.from('cash_outs')
                        .select('id, company_id, date, amount, entity_id, entityId, entity_type, entityType, note')
                        .eq('company_id', companyId)
                        .order('date', { ascending: false })
                        .limit(limit);
                     if (fallbackError) throw fallbackError;
                     
                     return (fallbackData || []).map(d => ({
                        id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, 
                        entityId: d.entity_id || d.entityId, entityType: d.entity_type || d.entityType, 
                        note: d.note, createdAt: new Date().toISOString(), createdByUserId: '', createdByName: ''
                    }));
                }
                throw error;
            }

            return (data || []).map(d => ({
                id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, entityId: d.entity_id || d.entityId, entityType: d.entity_type || d.entityType, note: d.note, createdAt: d.created_at, createdByUserId: d.created_by, createdByName: d.created_by_name
            }));
        } catch (e: any) {
            console.warn(`Fetch cash outs failed: ${getErrorMessage(e)}`);
            return [];
        }
    },
    
    getIncomes: async (companyId, limit = 200) => {
        if (!navigator.onLine) return [];
        try {
            const { data, error } = await supabase.from('incomes')
                .select('id, company_id, date, amount, category, note, created_at, created_by, created_by_name')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit(limit);

            if (error) {
                 // FAIL-SAFE for missing columns
                if (error.code === '42703') {
                     const { data: fallbackData, error: fallbackError } = await supabase.from('incomes')
                        .select('id, company_id, date, amount, category, note')
                        .eq('company_id', companyId)
                        .order('date', { ascending: false })
                        .limit(limit);
                     if (fallbackError) throw fallbackError;
                     
                     return (fallbackData || []).map(d => ({
                        id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, category: d.category, note: d.note, 
                        createdAt: new Date().toISOString(), createdByUserId: '', createdByName: ''
                    }));
                }
                throw error;
            }

            return (data || []).map(d => ({
                id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, category: d.category, note: d.note, createdAt: d.created_at, createdByUserId: d.created_by, createdByName: d.created_by_name
            }));
        } catch (e: any) {
            console.warn(`Fetch incomes failed: ${getErrorMessage(e)}`);
            return [];
        }
    },

    getExpenses: async (companyId, limit = 200) => {
        if (!navigator.onLine) return [];
        try {
            const { data, error } = await supabase.from('expenses')
                .select('id, company_id, date, amount, category, note, created_at, created_by, created_by_name')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit(limit);

            if (error) {
                // FAIL-SAFE for missing columns
                if (error.code === '42703') {
                     const { data: fallbackData, error: fallbackError } = await supabase.from('expenses')
                        .select('id, company_id, date, amount, category, note')
                        .eq('company_id', companyId)
                        .order('date', { ascending: false })
                        .limit(limit);
                     if (fallbackError) throw fallbackError;
                     
                     return (fallbackData || []).map(d => ({
                        id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, category: d.category, note: d.note, 
                        createdAt: new Date().toISOString(), createdByUserId: '', createdByName: ''
                    }));
                }
                throw error;
            }

            return (data || []).map(d => ({
                id: d.id, companyId: d.company_id, date: d.date, amount: d.amount, category: d.category, note: d.note, createdAt: d.created_at, createdByUserId: d.created_by, createdByName: d.created_by_name
            }));
        } catch (e: any) {
            console.warn(`Fetch expenses failed: ${getErrorMessage(e)}`);
            return [];
        }
    },

    getSettings: async (companyId) => {
        if (!navigator.onLine) return null;
        
        try {
            // PARALLEL EXECUTION: Fetch settings and company details simultaneously to reduce latency
            const [settingsRes, companyRes] = await Promise.all([
                supabase.from('settings').select('*').eq('company_id', companyId).maybeSingle(),
                supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
            ]);

            const settingsData = settingsRes.data;
            const companyData = companyRes.data;
            
            if (settingsRes.error) throw new Error(`Settings fetch error: ${settingsRes.error.message}`);
            if (companyRes.error) throw new Error(`Company fetch error: ${companyRes.error.message}`);

            if (!settingsData) return { 
                companyId, 
                companyName: companyData?.name || 'Unknown Company', 
                defaultRates: { branch: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 }, agent: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 } },
                principalRates: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 },
                currency: 'USD', dateFormat: 'YYYY-MM-DD', signatureTitle: '', signatureImage: null, commissionTemplateNote: '', commissionTemplateThankYou: '', companyLogo: null, companyLogoSize: 60, companyAddress: '', companyEmail: '', companyPhone: '', dormancyThresholdDays: 0, showQRCodeOnReport: true
            };

            return mapSettings({ ...settingsData, company_name: companyData?.name || '' });
        } catch (e: any) {
            console.error(`Get settings failed: ${getErrorMessage(e)}`);
            
            // FAIL-SAFE: Return default settings instead of null/crash if fetch fails
            return {
                companyId,
                companyName: 'Offline Company',
                defaultRates: { branch: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 }, agent: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 } },
                principalRates: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 },
                currency: 'USD', dateFormat: 'YYYY-MM-DD', signatureTitle: '', signatureImage: null, commissionTemplateNote: '', commissionTemplateThankYou: '', companyLogo: null, companyLogoSize: 60, companyAddress: '', companyEmail: '', companyPhone: '', dormancyThresholdDays: 0, showQRCodeOnReport: true
            };
        }
    },
    
    getNotifications: async (companyId) => {
        if (!navigator.onLine) return [];
        // Note: checkDormancy is now rate-limited internally
        // We intentionally do NOT await checkDormancy here to make notification fetching instant
        checkDormancy(companyId).catch(console.warn);

        try {
            const { data, error } = await supabase.from('notifications').select('*').eq('company_id', companyId).order('createdAt', { ascending: false }).limit(50);
            if (error) throw error;
            return data.map(n => ({
                 id: n.id, companyId: n.company_id, message: n.message, entityId: n.entityId, entityType: n.entityType, isRead: n.isRead, createdAt: n.createdAt, createdByUserId: n.createdByUserId, createdByName: n.createdByName
            }));
        } catch (e) {
            return [];
        }
    },

    getOpeningDataForEntity: async (companyId, entityId, entityType, date) => {
        if (!navigator.onLine) return { openingBalance: 0, cashReceived: 0 };
        try {
            // PARALLEL EXECUTION: Run closing balance check and cash out check simultaneously
            const [txRes, cashOutRes] = await Promise.all([
                supabase
                    .from('transactions')
                    .select('closingBalance')
                    .eq('company_id', companyId)
                    .eq('entityId', entityId)
                    .lt('date', date)
                    .order('date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                    
                supabase
                    .from('cash_outs')
                    .select('amount')
                    .eq('company_id', companyId)
                    .eq('entity_id', entityId)
                    .eq('date', date)
            ]);

            let openingBalance = txRes.data ? Number(txRes.data.closingBalance) : 0;
            
            // If no previous transaction, check initial balance (only if txRes was null)
            if (!txRes.data) {
                 const table = entityType === 'branch' ? 'branches' : 'agents';
                 const { data: entity } = await supabase.from(table).select('initialBalance').eq('id', entityId).single();
                 if (entity) openingBalance = entity.initialBalance || 0;
            }
            
            const cashReceived = (cashOutRes.data || []).reduce((sum, co) => sum + Number(co.amount), 0);

            return { openingBalance, cashReceived };
        } catch (e) {
            return { openingBalance: 0, cashReceived: 0 };
        }
    },

    saveTransaction: async (companyId, currentUser, txData) => {
        // OFFLINE HANDLING
        if (!navigator.onLine) {
            const tempId = offlineQueue.enqueue({
                type: 'saveTransaction',
                payload: { companyId, currentUser, txData }
            });
            
            // Optimistic return
            return {
                id: tempId,
                companyId,
                date: txData.date,
                entityId: txData.entityId,
                entityType: txData.entityType,
                openingBalance: txData.openingBalance,
                cashReceived: txData.cashReceived,
                totalCash: txData.totalCash,
                cashPaidByService: txData.cashPaidByService,
                totalCashPaid: txData.totalCashPaid,
                closingBalance: txData.closingBalance,
                createdAt: new Date().toISOString(),
                createdByUserId: currentUser.id,
                createdByName: currentUser.name,
                editHistory: []
            } as Transaction;
        }

        const { data: existing } = await supabase
            .from('transactions')
            .select('id, cashPaidByService, totalCashPaid, closingBalance, editHistory')
            .eq('company_id', companyId)
            .eq('entityId', txData.entityId)
            .eq('date', txData.date)
            .maybeSingle();

        let result;

        if (existing) {
            const newHistory = [
                {
                    timestamp: new Date().toISOString(),
                    userId: currentUser.id,
                    userName: currentUser.name,
                    previousState: { cashPaidByService: existing.cashPaidByService, totalCashPaid: existing.totalCashPaid, closingBalance: existing.closingBalance },
                    newState: { cashPaidByService: txData.cashPaidByService, totalCashPaid: txData.totalCashPaid, closingBalance: txData.closingBalance }
                },
                ...(existing.editHistory || [])
            ].slice(0, 10);

            const { data: updated, error } = await supabase.from('transactions').update({
                openingBalance: txData.openingBalance,
                cashReceived: txData.cashReceived,
                totalCash: txData.totalCash,
                cashPaidByService: txData.cashPaidByService,
                totalCashPaid: txData.totalCashPaid,
                closingBalance: txData.closingBalance,
                editHistory: newHistory
            }).eq('id', existing.id).select().single();

            if (error) throw new Error(error.message);
            result = updated;
        } else {
            const { data: inserted, error } = await supabase.from('transactions').insert({
                company_id: companyId,
                date: txData.date,
                entityId: txData.entityId,
                entityType: txData.entityType,
                openingBalance: txData.openingBalance,
                cashReceived: txData.cashReceived,
                totalCash: txData.totalCash,
                cashPaidByService: txData.cashPaidByService,
                totalCashPaid: txData.totalCashPaid,
                closingBalance: txData.closingBalance,
                createdByUserId: currentUser.id,
                createdByName: currentUser.name,
                editHistory: []
            }).select().single();
            
            if (error) throw new Error(error.message);
            result = inserted;
        }

        if (txData.totalCashPaid > 10000) {
             let entityName = txData.entityId; // fallback
             try {
                 const table = txData.entityType === 'branch' ? 'branches' : 'agents';
                 const { data: ent } = await supabase.from(table).select('name').eq('id', txData.entityId).maybeSingle();
                 if (ent) entityName = ent.name;
             } catch(e) {
                 // ignore lookup error
             }
             
             const formattedAmount = new Intl.NumberFormat().format(txData.totalCashPaid);
             await broadcastNotification(companyId, `High Value Transaction: ${formattedAmount} paid by ${entityName}`, currentUser.id, currentUser.name, txData.entityId, txData.entityType);
        }

        const mappedTransaction = mapTransaction(result);
        broadcastDataChange(companyId, 'transactions', existing ? 'UPDATE' : 'INSERT', mappedTransaction);
        
        return mappedTransaction;
    },

    addCashIn: async (companyId, currentUser, data) => {
        if (!navigator.onLine) {
            const tempId = offlineQueue.enqueue({
                type: 'addCashIn',
                payload: { companyId, currentUser, data }
            });
            // Optimistic return
            return {
                id: tempId,
                companyId,
                date: data.date,
                amount: data.amount,
                source: data.source,
                note: data.note,
                createdAt: new Date().toISOString(),
                createdByUserId: currentUser.id,
                createdByName: currentUser.name
            };
        }

        const payloadBase = {
            company_id: companyId,
            date: data.date,
            amount: data.amount,
            source: data.source,
            note: data.note
        };

        // Try inserting with robust fallback for missing audit columns in DB schema
        const payloads = [
            { ...payloadBase, created_by: currentUser.id, created_by_name: currentUser.name }, // Standard
            payloadBase // Fallback: no audit
        ];

        const newRecord = await tryInsertWithFallbacks('cash_ins', payloads);
        
        await broadcastNotification(companyId, `Cash In: ${data.amount} from ${data.source}`, currentUser.id, currentUser.name);
        
        const mappedRecord = {
            id: newRecord.id, 
            companyId: newRecord.company_id, 
            date: newRecord.date, 
            amount: newRecord.amount, 
            source: newRecord.source, 
            note: newRecord.note, 
            createdAt: newRecord.created_at || new Date().toISOString(), 
            createdByUserId: newRecord.created_by || currentUser.id, 
            createdByName: newRecord.created_by_name || currentUser.name
        };

        broadcastDataChange(companyId, 'cash_ins', 'INSERT', mappedRecord);
        return mappedRecord;
    },

    updateCashIn: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Editing is disabled while offline.");
        const { data: updated, error } = await supabase.from('cash_ins').update({
            date: data.date, amount: data.amount, source: data.source, note: data.note
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        
        const mappedRecord = {
            id: updated.id, companyId: updated.company_id, date: updated.date, amount: updated.amount, source: updated.source, note: updated.note, createdAt: updated.created_at, createdByUserId: updated.created_by, createdByName: updated.created_by_name
        };
        broadcastDataChange(companyId, 'cash_ins', 'UPDATE', mappedRecord);
        return mappedRecord;
    },

    deleteCashIn: async (companyId, currentUser, id) => {
        if (!navigator.onLine) throw new Error("Deleting is disabled while offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { error } = await supabase.from('cash_ins').delete().eq('id', id);
        if (error) throw new Error(error.message);
        broadcastDataChange(companyId, 'cash_ins', 'DELETE', { id });
        return { success: true };
    },

    addCashOut: async (companyId, currentUser, data) => {
        if (!data.entityId) throw new Error("Entity ID is required");

        if (!navigator.onLine) {
            const tempId = offlineQueue.enqueue({
                type: 'addCashOut',
                payload: { companyId, currentUser, data }
            });
            return {
                id: tempId,
                companyId,
                date: data.date,
                amount: data.amount,
                entityId: data.entityId,
                entityType: data.entityType,
                note: data.note,
                createdAt: new Date().toISOString(),
                createdByUserId: currentUser.id,
                createdByName: currentUser.name
            };
        }
        
        const base = {
            company_id: companyId,
            date: data.date,
            amount: data.amount,
            note: data.note
        };

        // Try permutations of snake_case vs camelCase and audit cols vs no audit cols
        // to support both legacy and new DB schemas without failure
        const payloads = [
            // 1. Standard (Snake Case + Audit)
            { ...base, entity_type: data.entityType, entity_id: data.entityId, created_by: currentUser.id, created_by_name: currentUser.name },
            // 2. Legacy (Camel Case + Audit)
            { ...base, entityType: data.entityType, entityId: data.entityId, created_by: currentUser.id, created_by_name: currentUser.name },
            // 3. Standard (No Audit)
            { ...base, entity_type: data.entityType, entity_id: data.entityId },
            // 4. Legacy (No Audit)
            { ...base, entityType: data.entityType, entityId: data.entityId }
        ];

        const newRecord = await tryInsertWithFallbacks('cash_outs', payloads);
        
        const mappedRecord = {
            id: newRecord.id, 
            companyId: newRecord.company_id, 
            date: newRecord.date, 
            amount: newRecord.amount, 
            entityId: newRecord.entity_id || newRecord.entityId, 
            entityType: newRecord.entity_type || newRecord.entityType, 
            note: newRecord.note, 
            createdAt: newRecord.created_at || new Date().toISOString(), 
            createdByUserId: newRecord.created_by || currentUser.id, 
            createdByName: newRecord.created_by_name || currentUser.name
        };
        
        broadcastDataChange(companyId, 'cash_outs', 'INSERT', mappedRecord);
        return mappedRecord;
    },

    updateCashOut: async (companyId, currentUser, data) => {
         if (!navigator.onLine) throw new Error("Editing is disabled while offline.");
         if (!data.entityId) throw new Error("Entity ID is required");

        // Try standard update first
        let error = null;
        let updated = null;
        
        try {
             const res = await supabase.from('cash_outs').update({
                date: data.date, amount: data.amount, note: data.note, entity_type: data.entityType, entity_id: data.entityId
            }).eq('id', data.id).select().single();
            if (res.error) throw res.error;
            updated = res.data;
        } catch (e) {
            // Fallback to legacy column names
             const res = await supabase.from('cash_outs').update({
                date: data.date, amount: data.amount, note: data.note, entityType: data.entityType, entityId: data.entityId
            }).eq('id', data.id).select().single();
            if (res.error) throw res.error;
            updated = res.data;
        }
        
        const mappedRecord = {
            id: updated.id, companyId: updated.company_id, date: updated.date, amount: updated.amount, entityId: updated.entity_id || updated.entity_id, entityType: updated.entity_type || updated.entity_type, note: updated.note, createdAt: updated.created_at, createdByUserId: updated.created_by, createdByName: updated.created_by_name
        };
        
        broadcastDataChange(companyId, 'cash_outs', 'UPDATE', mappedRecord);
        return mappedRecord;
    },

    deleteCashOut: async (companyId, currentUser, id) => {
         if (!navigator.onLine) throw new Error("Deleting is disabled while offline.");
         if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { error } = await supabase.from('cash_outs').delete().eq('id', id);
        if (error) throw new Error(error.message);
        broadcastDataChange(companyId, 'cash_outs', 'DELETE', { id });
        return { success: true };
    },
    
    addIncome: async (companyId, currentUser, data) => {
        if (!navigator.onLine) {
            const tempId = offlineQueue.enqueue({ type: 'addIncome', payload: { companyId, currentUser, data } });
            return { id: tempId, companyId, ...data, createdAt: new Date().toISOString(), createdByUserId: currentUser.id, createdByName: currentUser.name };
        }
        
        const payloadBase = {
            company_id: companyId, 
            date: data.date,
            amount: data.amount,
            category: data.category,
            note: data.note
        };

        const payloads = [
            { ...payloadBase, created_by: currentUser.id, created_by_name: currentUser.name },
            payloadBase
        ];

        const newRecord = await tryInsertWithFallbacks('incomes', payloads);

         const mappedRecord = { 
            id: newRecord.id, 
            companyId, 
            ...data, 
            createdAt: newRecord.created_at || new Date().toISOString(), 
            createdByUserId: newRecord.created_by || currentUser.id, 
            createdByName: newRecord.created_by_name || currentUser.name 
        };
        broadcastDataChange(companyId, 'incomes', 'INSERT', mappedRecord);
        return mappedRecord;
    },
    
    updateIncome: async (companyId, currentUser, data) => {
         if (!navigator.onLine) throw new Error("Editing is disabled while offline.");
         const { data: updated, error } = await supabase.from('incomes').update({
            date: data.date, amount: data.amount, category: data.category, note: data.note
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        const mappedRecord = { id: updated.id, companyId, ...data, createdAt: updated.created_at, createdByUserId: updated.created_by, createdByName: updated.created_by_name };
        broadcastDataChange(companyId, 'incomes', 'UPDATE', mappedRecord);
        return mappedRecord;
    },
    
    deleteIncome: async (companyId, currentUser, id) => {
        if (!navigator.onLine) throw new Error("Deleting is disabled while offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { error } = await supabase.from('incomes').delete().eq('id', id);
        if (error) throw new Error(error.message);
        broadcastDataChange(companyId, 'incomes', 'DELETE', { id });
        return { success: true };
    },

    addExpense: async (companyId, currentUser, data) => {
        if (!navigator.onLine) {
            const tempId = offlineQueue.enqueue({ type: 'addExpense', payload: { companyId, currentUser, data } });
            return { id: tempId, companyId, ...data, createdAt: new Date().toISOString(), createdByUserId: currentUser.id, createdByName: currentUser.name };
        }
        
        const payloadBase = {
            company_id: companyId, 
            date: data.date,
            amount: data.amount,
            category: data.category,
            note: data.note,
        };

        const payloads = [
            { ...payloadBase, created_by: currentUser.id, created_by_name: currentUser.name },
            payloadBase
        ];

        const newRecord = await tryInsertWithFallbacks('expenses', payloads);

         const mappedRecord = { 
            id: newRecord.id, 
            companyId, 
            ...data, 
            createdAt: newRecord.created_at || new Date().toISOString(), 
            createdByUserId: newRecord.created_by || currentUser.id, 
            createdByName: newRecord.created_by_name || currentUser.name 
        };
        broadcastDataChange(companyId, 'expenses', 'INSERT', mappedRecord);
        return mappedRecord;
    },

    updateExpense: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Editing is disabled while offline.");
        const { data: updated, error } = await supabase.from('expenses').update({
            date: data.date, amount: data.amount, category: data.category, note: data.note
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        const mappedRecord = { id: updated.id, companyId, ...data, createdAt: updated.created_at, createdByUserId: updated.created_by, createdByName: updated.created_by_name };
        broadcastDataChange(companyId, 'expenses', 'UPDATE', mappedRecord);
        return mappedRecord;
    },

    deleteExpense: async (companyId, currentUser, id) => {
        if (!navigator.onLine) throw new Error("Deleting is disabled while offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) throw new Error(error.message);
        broadcastDataChange(companyId, 'expenses', 'DELETE', { id });
        return { success: true };
    },

    addBranch: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Adding branches unavailable offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { data: newBranch, error } = await supabase.from('branches').insert({
            company_id: companyId, ...data, createdAt: new Date().toISOString()
        }).select().single();
        if (error) throw new Error(error.message);
        await broadcastNotification(companyId, `New Branch Added: ${data.name}`, currentUser.id, currentUser.name, newBranch.id, 'branch');
        return mapBranch(newBranch);
    },

    updateBranch: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Editing branches unavailable offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { data: updated, error } = await supabase.from('branches').update({
            name: data.name, location: data.location, rates: data.rates, isActive: data.isActive,
            editHistory: [...(data.editHistory || []), { timestamp: new Date().toISOString(), userId: currentUser.id, userName: currentUser.name, previousState: {}, newState: data }]
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        return mapBranch(updated);
    },

    addAgent: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Adding agents unavailable offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { data: newAgent, error } = await supabase.from('agents').insert({
            company_id: companyId, ...data, createdAt: new Date().toISOString()
        }).select().single();
        if (error) throw new Error(error.message);
        await broadcastNotification(companyId, `New Agent Added: ${data.name}`, currentUser.id, currentUser.name, newAgent.id, 'agent');
        return mapAgent(newAgent);
    },

    updateAgent: async (companyId, currentUser, data) => {
        if (!navigator.onLine) throw new Error("Editing agents unavailable offline.");
        if (currentUser.role === 'Clerk') throw new Error("Unauthorized");
        const { data: updated, error } = await supabase.from('agents').update({
            name: data.name, location: data.location, rates: data.rates, isActive: data.isActive,
            editHistory: [...(data.editHistory || []), { timestamp: new Date().toISOString(), userId: currentUser.id, userName: currentUser.name, previousState: {}, newState: data }]
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        return mapAgent(updated);
    },
    
    addUser: async (companyId, currentUser, data) => {
        throw new Error("Use signUp flow");
    },

    updateUser: async (companyId, currentUser, data) => {
        if (currentUser.role !== 'Admin') throw new Error("Unauthorized");
        const { data: updated, error } = await supabase.from('user_profiles').update({
            role: data.role
        }).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        return mapUser(updated);
    },
    
    updateMyProfile: async (userId, data) => {
        const updates: any = {};
        if (data.name) updates.full_name = data.name;
        if (data.email) updates.email = data.email;
        if (data.avatarUrl) updates.avatar_url = data.avatarUrl;

        const { data: updatedProfile, error } = await supabase.from('user_profiles').update(updates).eq('id', userId).select().single();
        if (error) throw new Error(error.message);

        if (data.email || data.newPassword) {
            const authUpdates: any = {};
            if (data.email) authUpdates.email = data.email;
            if (data.newPassword) authUpdates.password = data.newPassword;
            
            const { error: authError } = await supabase.auth.updateUser(authUpdates);
            if (authError) throw new Error(authError.message);
        }

        return mapUser(updatedProfile);
    },

    updateSettings: async (companyId: string, currentUser: User, newSettings: Settings) => {
        if (currentUser.role !== 'Admin') throw new Error("Unauthorized");

        if (newSettings.companyName) {
            const { error: companyError } = await supabase
                .from('companies')
                .update({ name: newSettings.companyName })
                .eq('id', companyId);
            
            if (companyError) throw new Error(`Failed to update company name: ${companyError.message}`);
        }

        const settingsUpdates: any = {
            currency: newSettings.currency,
            default_rates: newSettings.defaultRates, 
            principal_rates: newSettings.principalRates, 
            date_format: newSettings.dateFormat, 
            signature_title: newSettings.signatureTitle, 
            company_logo_size: newSettings.companyLogoSize, 
            company_address: newSettings.companyAddress, 
            company_email: newSettings.companyEmail, 
            company_phone: newSettings.companyPhone, 
            dormancy_threshold_days: newSettings.dormancyThresholdDays, 
            show_qr_code_on_report: newSettings.showQRCodeOnReport, 
            commission_template_note: newSettings.commissionTemplateNote, 
            commission_template_thank_you: newSettings.commissionTemplateThankYou 
        };

        if (newSettings.companyLogo && newSettings.companyLogo.startsWith('data:')) {
             const url = await uploadImage(newSettings.companyLogo, `logos/${companyId}_${Date.now()}`);
             if (url) settingsUpdates.company_logo = url;
        }
        if (newSettings.signatureImage && newSettings.signatureImage.startsWith('data:')) {
             const url = await uploadImage(newSettings.signatureImage, `signatures/${companyId}_${Date.now()}`);
             if (url) settingsUpdates.signature_image = url;
        }

        const { data, error } = await supabase
            .from('settings')
            .upsert({ company_id: companyId, ...settingsUpdates })
            .select()
            .single();

        if (error) {
             const msg = error.message || JSON.stringify(error);
             throw new Error(`Failed to save settings: ${msg}`);
        }

        return mapSettings({ ...data, company_name: newSettings.companyName });
    },

    deleteBranch: async (companyId, currentUser, branchId) => {
        if (currentUser.role !== 'Admin') throw new Error("Unauthorized");
        const { error } = await supabase.from('branches').delete().eq('id', branchId);
        if (error) throw new Error(error.message);
        return { success: true };
    },

    deleteAgent: async (companyId, currentUser, agentId) => {
        if (currentUser.role !== 'Admin') throw new Error("Unauthorized");
        const { error } = await supabase.from('agents').delete().eq('id', agentId);
        if (error) throw new Error(error.message);
        return { success: true };
    },

    markNotificationRead: async (companyId, notificationId) => {
        const { data, error } = await supabase.from('notifications').update({ isRead: true }).eq('id', notificationId).select().single();
        if (error) return null;
        return { id: data.id, companyId: data.company_id, message: data.message, isRead: data.isRead, createdAt: data.createdAt };
    },
    
    markAllNotificationsRead: async (companyId) => {
        const { error } = await supabase.from('notifications').update({ isRead: true }).eq('company_id', companyId).eq('isRead', false);
        if (error) throw new Error(error.message);
        return { success: true };
    },
    
    clearAllNotifications: async (companyId) => {
        const { error } = await supabase.from('notifications').delete().eq('company_id', companyId);
        if (error) throw new Error(error.message);
        return { success: true };
    },

    bulkImportTransactions: async (companyId, currentUser, data) => {
        const errors: string[] = [];
        let importedCount = 0;
        
        const [branches, agents] = await Promise.all([
            supabaseApi.getBranches(companyId),
            supabaseApi.getAgents(companyId)
        ]);
        
        for (const row of data) {
            try {
                const entityName = row.entity_name?.trim();
                const entityType = row.entity_type?.toLowerCase().trim();
                
                let entityId = '';
                if (entityType === 'branch') {
                    const b = branches.find(b => b.name.toLowerCase() === entityName.toLowerCase());
                    if (b) entityId = b.id;
                } else if (entityType === 'agent') {
                     const a = agents.find(a => a.name.toLowerCase() === entityName.toLowerCase());
                     if (a) entityId = a.id;
                }
                
                if (!entityId) {
                    errors.push(`Entity not found: ${entityName} (${entityType})`);
                    continue;
                }
                
                const txData: any = {
                    companyId,
                    date: row.date,
                    entityId,
                    entityType,
                    openingBalance: 0,
                    cashReceived: 0,
                    totalCash: 0,
                    cashPaidByService: {
                        ria: { formula: row.ria_formula || '0', total: 0 },
                        moneyGram: { formula: row.moneygram_formula || '0', total: 0 },
                        westernUnion: { formula: row.westernunion_formula || '0', total: 0 },
                        afro: { formula: row.afro_formula || '0', total: 0 }
                    },
                    totalCashPaid: 0,
                    closingBalance: 0
                };
                
                let totalPaid = 0;
                Object.values(txData.cashPaidByService).forEach((s: any) => {
                    s.total = s.formula.split('+').reduce((sum: number, v: string) => sum + (parseFloat(v) || 0), 0);
                    totalPaid += s.total;
                });
                txData.totalCashPaid = totalPaid;
                
                await supabaseApi.saveTransaction(companyId, currentUser, txData);
                importedCount++;
            } catch (e: any) {
                errors.push(`Row error: ${e.message}`);
            }
        }
        return { success: true, importedCount, errorCount: errors.length, errors };
    },

    getFullBackup: async (companyId) => {
        const [users, branches, agents, transactions, cashIns, cashOuts, incomes, expenses, settings] = await Promise.all([
            supabaseApi.getUsers(companyId),
            supabaseApi.getBranches(companyId),
            supabaseApi.getAgents(companyId),
            supabaseApi.getTransactions(companyId),
            supabaseApi.getCashIns(companyId),
            supabaseApi.getCashOuts(companyId),
            supabaseApi.getIncomes(companyId),
            supabaseApi.getExpenses(companyId),
            supabaseApi.getSettings(companyId)
        ]);
        return { users, branches, agents, transactions, cashIns, cashOuts, incomes, expenses, settings };
    },

    seedDatabase: async (companyId, currentUser) => {
        const b1 = await supabaseApi.addBranch(companyId, currentUser, { name: 'Main Office', location: 'Downtown', rates: { ria: 1.5, moneyGram: 1.5, westernUnion: 1.5, afro: 2.0 }, isActive: true, initialBalance: 5000 });
        const b2 = await supabaseApi.addBranch(companyId, currentUser, { name: 'Airport Branch', location: 'Terminal 1', rates: { ria: 2.0, moneyGram: 2.0, westernUnion: 2.0, afro: 2.5 }, isActive: true, initialBalance: 2000 });
        const a1 = await supabaseApi.addAgent(companyId, currentUser, { name: 'Ali Express', location: 'North Market', rates: { ria: 1.0, moneyGram: 1.0, westernUnion: 1.0, afro: 1.5 }, isActive: true, initialBalance: 0 });
        
        const today = new Date().toISOString().split('T')[0];
        
        await supabaseApi.saveTransaction(companyId, currentUser, {
            date: today,
            entityId: b1.id,
            entityType: 'branch',
            openingBalance: 5000,
            cashReceived: 0,
            totalCash: 5000,
            cashPaidByService: {
                ria: { formula: '100+200', total: 300 },
                moneyGram: { formula: '500', total: 500 },
                westernUnion: { formula: '0', total: 0 },
                afro: { formula: '0', total: 0 }
            },
            totalCashPaid: 800,
            closingBalance: 4200
        });

        await supabaseApi.saveTransaction(companyId, currentUser, {
            date: today,
            entityId: a1.id,
            entityType: 'agent',
            openingBalance: 0,
            cashReceived: 1000,
            totalCash: 1000,
            cashPaidByService: {
                ria: { formula: '0', total: 0 },
                moneyGram: { formula: '0', total: 0 },
                westernUnion: { formula: '500+50', total: 550 },
                afro: { formula: '0', total: 0 }
            },
            totalCashPaid: 550,
            closingBalance: 450
        });
    }
};
