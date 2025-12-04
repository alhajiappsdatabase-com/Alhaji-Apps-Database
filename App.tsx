
import React, { useState, useEffect, useCallback, FC, useMemo, useRef, Suspense, lazy } from 'react';
import { User, Branch, Agent, Transaction, CashIn, CashOut, Income, Expense, Settings, Notification, Page, NavItem, AppContext, AppContextType, useAppContext } from './types';
import { supabaseApi } from './services/supabaseApi';
import { processOfflineQueue } from './services/offlineQueue';

import { 
    DashboardIcon, TransactionsIcon, ManagementIcon, ReportsIcon, SettingsIcon, LogoutIcon, 
    CapitalIcon, IncomeIcon, ExpenseIcon, SunIcon, MoonIcon, VerificationIcon, SearchIcon, LockClosedIcon, LoadingSpinnerIcon, BellIcon, TrashIcon, ArrowLeftIcon, UserCircleIcon, EmailIcon, UserIcon, EyeIcon, EyeSlashIcon, CheckIcon, CloseIcon
} from './components/icons';
import { Card, Spinner, ToastContainer, Modal, ProgressBar } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import AuthPage from './pages/AuthPage';
import AiAnalyst from './components/AiAnalyst';
import { ActiveUsers } from './components/ActiveUsers';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const CashFlowPage = lazy(() => import('./pages/ReimbursementsPage'));
const ManagementPage = lazy(() => import('./pages/ManagementPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const IncomeAndExpenditurePage = lazy(() => import('./pages/IncomeAndExpenditurePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));

type ToastMessage = { id: number; message: string; type: 'success' | 'error' | 'info'; action?: { label: string; onClick: () => void } };

// --- CACHING UTILS ---
const CACHE_PREFIX = 'fintrack_cache_';
const getCachedData = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(CACHE_PREFIX + key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) { return fallback; }
};
const setCachedData = (key: string, data: any) => {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); } catch (e) { console.warn("Cache quota exceeded"); }
};
const clearAppCache = () => {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    });
};

const useTheme = () => {
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
    return { theme, toggleTheme };
};

function timeAgo(dateString: string): string {
    const now = new Date();
    const past = new Date(dateString);
    const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);
    if (seconds < 60) return "Just now";
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
}

const allNavItems: NavItem[] = [
    { name: 'Dashboard', icon: DashboardIcon, page: 'dashboard', roles: ['Admin', 'Manager', 'Clerk'] },
    { name: 'Transactions', icon: TransactionsIcon, page: 'transactions', roles: ['Admin', 'Manager', 'Clerk'] },
    { name: 'Capital Management', icon: CapitalIcon, page: 'cash-flow', roles: ['Admin', 'Manager'] },
    { name: 'Petty Cash', icon: IncomeIcon, page: 'income-expenses', roles: ['Admin', 'Manager'] },
    { name: 'Reconciliation', icon: VerificationIcon, page: 'reconciliation', roles: ['Admin', 'Manager'] },
    { name: 'Reports', icon: ReportsIcon, page: 'reports', roles: ['Admin', 'Manager'] },
    { name: 'Management', icon: ManagementIcon, page: 'management', roles: ['Admin'] },
    { name: 'Settings', icon: SettingsIcon, page: 'settings', roles: ['Admin'] },
];

const PermissionDeniedPage: FC = () => (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <LockClosedIcon className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">You do not have permission to view this page.</p>
    </div>
);

const NotificationBell: FC = () => {
    const { notifications, handleMarkNotificationRead, handleMarkAllNotificationsRead, handleClearNotifications, handleNotificationClick } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className="relative">
            <button onClick={() => setIsOpen(prev => !prev)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 relative" title="Notifications">
                <BellIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"></span>
                )}
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 z-20 animate-fade-in-scale-up" style={{transformOrigin: 'top right'}}>
                    <div className="p-3 border-b dark:border-slate-700 flex justify-between items-center">
                        <h4 className="font-semibold">Notifications</h4>
                        {notifications.length > 0 && <button onClick={handleClearNotifications} className="text-sm text-red-500 hover:underline">Clear All</button>}
                    </div>
                    {notifications.length > 0 ? (
                        <>
                            <ul className="max-h-80 overflow-y-auto">
                                {notifications.map(n => (
                                    <li key={n.id} onClick={() => handleNotificationClick(n, () => setIsOpen(false))} className={`p-3 border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer ${!n.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        <p className="text-sm text-slate-700 dark:text-slate-300">{n.message}</p>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                                            {!n.isRead && <button onClick={(e) => { e.stopPropagation(); handleMarkNotificationRead(n.id); }} className="text-xs text-blue-500 hover:underline">Mark read</button>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <div className="p-2">
                                <button onClick={handleMarkAllNotificationsRead} className="w-full text-center text-sm text-blue-500 hover:underline py-1">Mark all as read</button>
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-sm text-slate-500 py-8">No notifications yet.</p>
                    )}
                </div>
            )}
        </div>
    );
};

const MobileNavBar: FC<{ activePage: Page; onNavigate: (page: Page) => void; onMenuClick: () => void; }> = ({ activePage, onNavigate, onMenuClick }) => {
    return (
        <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-around items-center p-2 pb-safe-bottom z-40 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <button onClick={() => onNavigate('dashboard')} className={`flex flex-col items-center p-2 rounded-lg ${activePage === 'dashboard' ? 'text-primary-600' : 'text-slate-500 dark:text-slate-400'}`}>
                <DashboardIcon className="w-6 h-6" />
                <span className="text-[10px] mt-1">Home</span>
            </button>
            <button onClick={() => onNavigate('transactions')} className={`flex flex-col items-center p-2 rounded-lg ${activePage === 'transactions' ? 'text-primary-600' : 'text-slate-500 dark:text-slate-400'}`}>
                <TransactionsIcon className="w-6 h-6" />
                <span className="text-[10px] mt-1">Records</span>
            </button>
             <button onClick={() => onNavigate('cash-flow')} className={`flex flex-col items-center p-2 rounded-lg ${activePage === 'cash-flow' ? 'text-primary-600' : 'text-slate-500 dark:text-slate-400'}`}>
                <CapitalIcon className="w-6 h-6" />
                <span className="text-[10px] mt-1">Cash</span>
            </button>
            <button onClick={onMenuClick} className="flex flex-col items-center p-2 rounded-lg text-slate-500 dark:text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
                <span className="text-[10px] mt-1">Menu</span>
            </button>
        </div>
    );
};

const apiService = supabaseApi;

export default function App() {
    // --- INSTANT LOAD STRATEGY ---
    const [currentUser, setCurrentUser] = useState<User | null>(() => getCachedData('user', null));
    
    // Initial App Data State loaded from Cache
    const [appData, setAppData] = useState<any>({
        users: getCachedData('users', []),
        branches: getCachedData('branches', []),
        agents: getCachedData('agents', []),
        settings: getCachedData('settings', null),
        transactions: getCachedData('transactions', []),
        cashIns: getCachedData('cashIns', []),
        cashOuts: getCachedData('cashOuts', []),
        incomes: getCachedData('incomes', []),
        expenses: getCachedData('expenses', []),
        notifications: getCachedData('notifications', [])
    });

    const [isAppLoading, setIsAppLoading] = useState(() => !getCachedData('user', null));

    const [pageHistory, setPageHistory] = useState<Page[]>(['dashboard']);
    const activePage = pageHistory[pageHistory.length - 1];
    const [isGlobalLoading, setGlobalLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [dbStatus, setDbStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
    const userMenuRef = useRef<HTMLDivElement>(null);
    
    // Updated: Initialize ref with current user from cache to avoid race conditions on mount
    const currentUserIdRef = useRef<string | null>(currentUser?.id || null);
    
    const isLoggingInRef = useRef(false); // Guard against race conditions during manual login
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);

    const [lastSelectedEntityType, setLastSelectedEntityType] = useState<'branch' | 'agent'>(() => (localStorage.getItem('lastSelectedEntityType') as 'branch' | 'agent') || 'agent');
    const [lastSelectedEntityId, setLastSelectedEntityId] = useState<string>(() => localStorage.getItem('lastSelectedEntityId') || '');
    const [lockDate, setLockDateState] = useState<string | null>(() => localStorage.getItem('fintrack_lock_date') || null);

    const setLockDate = useCallback((date: string | null) => {
        if (date) localStorage.setItem('fintrack_lock_date', date);
        else localStorage.removeItem('fintrack_lock_date');
        setLockDateState(date);
    }, []);

    useEffect(() => { localStorage.setItem('lastSelectedEntityType', lastSelectedEntityType); }, [lastSelectedEntityType]);
    useEffect(() => { localStorage.setItem('lastSelectedEntityId', lastSelectedEntityId); }, [lastSelectedEntityId]);
    
    // Sync currentUserIdRef with state, but handleLogin updates it faster
    useEffect(() => { if (currentUser) currentUserIdRef.current = currentUser.id; }, [currentUser]);

    const { theme, toggleTheme } = useTheme();

    const navigateTo = useCallback((page: Page) => {
        setPageHistory(prev => (prev[prev.length - 1] === page ? prev : [...prev, page]));
    }, []);

    const navigateBack = useCallback(() => {
        setPageHistory(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }, []);
    
    const navItems = useMemo(() => currentUser ? allNavItems.filter(item => item.roles.includes(currentUser.role)) : [], [currentUser]);
    const hasPermission = useCallback((page: Page): boolean => {
        if (!currentUser) return false;
        const navItem = allNavItems.find(item => item.page === page);
        return navItem ? navItem.roles.includes(currentUser.role) : false;
    }, [currentUser]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', action?: { label: string; onClick: () => void }) => {
        setToasts(toasts => [...toasts, { id: Date.now(), message, type, action }]);
    }, []);
    
    const removeToast = (id: number) => setToasts(toasts => toasts.filter(toast => toast.id !== id));

    useEffect(() => {
        const handleOnline = () => { 
            setIsOnline(true); 
            showToast("You are back online. Syncing data...", "info");
            // Trigger offline queue processing
            processOfflineQueue((count) => {
                showToast(`Synced ${count} pending actions.`, "success");
            });
        };
        const handleOffline = () => { setIsOnline(false); showToast("You are offline. Changes will sync when online.", "info"); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Check connection on mount with a slight delay to allow cold start
        setTimeout(() => {
             apiService.checkConnection().then(res => {
                 setDbStatus(res.success ? 'connected' : 'error');
                 if (res.success) {
                     console.log("Database connected successfully");
                 } else {
                     console.warn("Database check failed:", res.message);
                 }
             });
        }, 1000);
        
        // Check for pending offline actions on mount if online
        if (navigator.onLine) {
             processOfflineQueue((count) => {
                showToast(`Synced ${count} offline actions.`, "success");
            });
        }

        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, [showToast]);

    useEffect(() => {
        const handleSWUpdate = (event: CustomEvent) => {
            const registration = event.detail as ServiceWorkerRegistration;
            showToast("New version available!", "info", { label: "Refresh", onClick: () => { if (registration.waiting) { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); } } });
        };
        window.addEventListener('sw-update-available', handleSWUpdate as EventListener);
        const handleBeforeInstallPrompt = (e: any) => { e.preventDefault(); setDeferredPrompt(e); setIsInstallable(true); };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => { window.removeEventListener('sw-update-available', handleSWUpdate as EventListener); window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt); };
    }, [showToast]);

    const installApp = useCallback(async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') setIsInstallable(false);
            setDeferredPrompt(null);
        }
    }, [deferredPrompt]);

    // --- GENERIC DATA FETCHER WITH CACHING ---
    const createFetcher = <T extends keyof typeof apiService>(apiMethod: T, stateKey: keyof typeof appData | (keyof typeof appData)[]) => {
        return useCallback(async (silent = false) => {
            if (!currentUser) return;
            // Enable global loading for better visibility like Google Sheets, unless silenced (for background refresh)
            if (!silent) setGlobalLoading(true);
            try {
                const result = await (apiService[apiMethod] as (companyId: string) => Promise<any>)(currentUser.companyId);
                
                if (Array.isArray(stateKey)) {
                    const update: any = {};
                    stateKey.forEach((key, index) => { 
                        const val = (result as any[])[index];
                        update[key] = val;
                        setCachedData(key as string, val); // Save to Cache
                    });
                    setAppData((prev: any) => ({ ...prev, ...update }));
                } else {
                    setCachedData(stateKey as string, result); // Save to Cache
                    setAppData((prev: any) => ({ ...prev, [stateKey as any]: result }));
                }
            } catch (error) { 
                console.error(`Failed to fetch ${String(stateKey)}`, error); 
            } finally {
                if (!silent) setGlobalLoading(false);
            }
        }, [currentUser]);
    };

    const fetchManagementData = createFetcher('getFullBackup', ['users', 'branches', 'agents', 'transactions', 'cashIns', 'cashOuts', 'incomes', 'expenses', 'settings']); 

    const fetchManagementDataReal = useCallback(async (silent = false) => {
         if (!currentUser) return;
         if (!silent) setGlobalLoading(true);
         try {
             const [users, branches, agents] = await Promise.all([
                 apiService.getUsers(currentUser.companyId),
                 apiService.getBranches(currentUser.companyId),
                 apiService.getAgents(currentUser.companyId)
             ]);
             setCachedData('users', users); setCachedData('branches', branches); setCachedData('agents', agents);
             setAppData((prev: any) => ({ ...prev, users, branches, agents }));
         } catch (e) { console.error(e); } finally {
             if (!silent) setGlobalLoading(false);
         }
    }, [currentUser]);

    // Optimized: Fetch heavy data only if explicitly requested by a page (limit can be passed)
    const fetchCashFlowDataReal = useCallback(async (silent = false) => {
        if (!currentUser) return;
        if (!silent) setGlobalLoading(true);
        try {
            const limit = (activePage === 'cash-flow') ? 500 : 100;
            const [cashIns, cashOuts] = await Promise.all([
                apiService.getCashIns(currentUser.companyId, limit),
                apiService.getCashOuts(currentUser.companyId, limit)
            ]);
            setCachedData('cashIns', cashIns); setCachedData('cashOuts', cashOuts);
            setAppData((prev: any) => ({ ...prev, cashIns, cashOuts }));
        } catch (e) { console.error(e); } finally {
            if (!silent) setGlobalLoading(false);
        }
   }, [currentUser, activePage]);

    const fetchPettyCashData = useCallback(async (silent = false) => {
        if (!currentUser) return;
        if (!silent) setGlobalLoading(true);
        try {
             const limit = (activePage === 'income-expenses') ? 500 : 100;
            const [incomes, expenses] = await Promise.all([
                apiService.getIncomes(currentUser.companyId, limit),
                apiService.getExpenses(currentUser.companyId, limit)
            ]);
            setCachedData('incomes', incomes); setCachedData('expenses', expenses);
            setAppData((prev: any) => ({ ...prev, incomes, expenses }));
        } catch (e) { console.error(e); } finally {
            if (!silent) setGlobalLoading(false);
        }
    }, [currentUser, activePage]);

    const fetchSettings = createFetcher('getSettings', 'settings');
    const fetchNotifications = createFetcher('getNotifications', 'notifications');

    // Manually defined to support dynamic limits based on page context
    const fetchTransactions = useCallback(async (silent = false) => {
        if (!currentUser) return;
        if (!silent) setGlobalLoading(true);
        try {
            // Fetch more data if on relevant pages, otherwise minimal load for dashboard
            const limit = (activePage === 'transactions' || activePage === 'reports' || activePage === 'reconciliation') ? 600 : 150;
            const transactions = await apiService.getTransactions(currentUser.companyId, limit);
            setCachedData('transactions', transactions);
            setAppData((prev: any) => ({ ...prev, transactions }));
        } catch (e) { console.error(e); } finally {
            if (!silent) setGlobalLoading(false);
        }
    }, [currentUser, activePage]);


    // --- GLOBAL REFRESH ---
    const refreshAllData = useCallback(async (silent = false) => {
        if (!currentUser) return;
        if (!silent) setGlobalLoading(true);
        
        // RELIABILITY: Timeout to 60s to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Refresh timed out')), 60000)
        );

        try {
            // Smart Refresh: Only fetch what is needed for the current page
            // We pass 'true' (silent) to fetches because we are managing global loading here centrally
            const tasks: Promise<any>[] = [fetchNotifications(true)]; // Always update notifications

            // Ensure settings are loaded if missing (critical for currency etc)
            if (!appData.settings) {
                tasks.push(fetchSettings(true));
            }

            switch (activePage) {
                case 'dashboard':
                    // Dashboard needs aggregation of everything but shallow
                    tasks.push(fetchManagementDataReal(true), fetchCashFlowDataReal(true), fetchPettyCashData(true), fetchTransactions(true));
                    break;
                case 'transactions':
                    // Needs Tx list (heavy), Entities (names), CashFlow (for cash received daily calc)
                    tasks.push(fetchTransactions(true), fetchManagementDataReal(true), fetchCashFlowDataReal(true));
                    break;
                case 'cash-flow':
                    // Needs CashIn/Out (heavy), Entities
                    tasks.push(fetchCashFlowDataReal(true), fetchManagementDataReal(true));
                    break;
                case 'management':
                    // Needs Users, Branches, Agents
                    tasks.push(fetchManagementDataReal(true));
                    break;
                case 'reports':
                    // Needs Tx (heavy), Entities
                    tasks.push(fetchTransactions(true), fetchManagementDataReal(true));
                    break;
                case 'income-expenses':
                    // Needs Income/Expense (heavy)
                    tasks.push(fetchPettyCashData(true));
                    break;
                case 'settings':
                    // Needs Settings
                    tasks.push(fetchSettings(true));
                    break;
                case 'reconciliation':
                    // Needs Tx (heavy), Entities
                    tasks.push(fetchTransactions(true), fetchManagementDataReal(true));
                    break;
                default:
                    // Fallback to everything if unknown page
                    tasks.push(
                        fetchManagementDataReal(true),
                        fetchCashFlowDataReal(true),
                        fetchPettyCashData(true),
                        fetchSettings(true),
                        fetchTransactions(true)
                    );
            }

            // Use Promise.race to prevent indefinite spinning if network hangs
            await Promise.race([Promise.all(tasks), timeoutPromise]);
            if (!silent) showToast("Page data refreshed", "success");
        } catch (error) {
            console.error("Refresh failed", error);
            if (!silent) showToast("Connection slow. Some data may not be updated.", "info");
        } finally {
            if (!silent) setGlobalLoading(false);
        }
    }, [currentUser, activePage, appData.settings, fetchManagementDataReal, fetchCashFlowDataReal, fetchPettyCashData, fetchSettings, fetchTransactions, fetchNotifications, showToast]);

    // Loading Watchdog: Force stop loading if it gets stuck (e.g. device wake issues)
    useEffect(() => {
        let watchdog: ReturnType<typeof setTimeout>;
        if (isGlobalLoading) {
            // RELIABILITY: Safety watchdog matching the refresh timeout
            watchdog = setTimeout(() => {
                setGlobalLoading(false);
                // showToast("Loading took longer than expected. Please check your connection.", "info");
            }, 60000); 
        }
        return () => clearTimeout(watchdog);
    }, [isGlobalLoading, showToast]);

    // Auto-Resume: Refresh data silently when app becomes visible or focused
    useEffect(() => {
        const handleWakeUp = () => {
            if (document.visibilityState === 'visible' && currentUser) {
                // Parallelize: Check connection status AND start refreshing data immediately
                // This reduces perceived latency on wake-up
                apiService.checkConnection().then(res => {
                    setDbStatus(res.success ? 'connected' : 'error');
                    if(res.success) setIsOnline(true);
                });
                
                // Don't wait for connection check to start refreshing - fail fast or succeed fast
                refreshAllData(true);
            }
        };
        
        window.addEventListener('visibilitychange', handleWakeUp);
        window.addEventListener('focus', handleWakeUp); // Aggressive wake-up on focus
        
        return () => {
            window.removeEventListener('visibilitychange', handleWakeUp);
            window.removeEventListener('focus', handleWakeUp);
        };
    }, [currentUser, refreshAllData]);

    // --- HEARTBEAT ---
    // Keeps the database connection active and prevents cold starts.
    useEffect(() => {
        if (!currentUser) return;
        
        // Interval: 20 seconds (Very Aggressive to prevent PaaS shutdown and satisfy "Always Active")
        const intervalMs = 20 * 1000;
        
        const beat = () => {
            if (navigator.onLine) {
                // Fire and forget - effectively a ping.
                // Removed visibility check to keep connection alive even in background
                apiService.checkConnection().catch(() => {});
            }
        };

        const timer = setInterval(beat, intervalMs);
        return () => clearInterval(timer);
    }, [currentUser]);

    const handleMarkNotificationRead = useCallback(async (id: string) => {
        if (!currentUser) return;
        const newNotifs = appData.notifications.map((n: any) => n.id === id ? { ...n, isRead: true } : n);
        setAppData((prev: any) => ({ ...prev, notifications: newNotifs }));
        setCachedData('notifications', newNotifs);
        await apiService.markNotificationRead(currentUser.companyId, id);
    }, [currentUser, appData.notifications]);

    const handleMarkAllNotificationsRead = useCallback(async () => {
        if (!currentUser) return;
        const newNotifs = appData.notifications.map((n: any) => ({ ...n, isRead: true }));
        setAppData((prev: any) => ({ ...prev, notifications: newNotifs }));
        setCachedData('notifications', newNotifs);
        await apiService.markAllNotificationsRead(currentUser.companyId);
    }, [currentUser, appData.notifications]);
    
    const handleClearNotifications = useCallback(async () => {
        if (!currentUser) return;
        setAppData((prev: any) => ({ ...prev, notifications: [] }));
        setCachedData('notifications', []);
        await apiService.clearAllNotifications(currentUser.companyId);
    }, [currentUser]);
    
    const handleNotificationClick = useCallback((notification: Notification, callback: () => void) => {
        handleMarkNotificationRead(notification.id);
        if (notification.entityId && notification.entityType) {
            if (notification.entityType === 'branch' || notification.entityType === 'agent') {
                if (hasPermission('transactions')) {
                    setLastSelectedEntityType(notification.entityType);
                    setLastSelectedEntityId(notification.entityId);
                    navigateTo('transactions');
                    callback();
                } else { showToast("You don't have permission for transactions.", "error"); }
            } else if (notification.entityType === 'user') {
                if (hasPermission('management')) { navigateTo('management'); callback(); } else { showToast("You don't have permission for management.", "error"); }
            }
        }
    }, [handleMarkNotificationRead, hasPermission, showToast, navigateTo]);

    const updateEntityTransactions = useCallback((transaction: Transaction, previousId?: string) => {
        setAppData((prev: any) => {
            // Remove existing entry for this specific transaction if it exists (or if it matches tempId)
            const otherTransactions = prev.transactions.filter((t: any) => t.id !== transaction.id && t.id !== previousId);
            const newTransactions = [...otherTransactions, transaction].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            setCachedData('transactions', newTransactions);
            return { ...prev, transactions: newTransactions };
        });
    }, []);

    const formatCurrency = useCallback((amount: number) => {
        const options: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 };
        if (!appData.settings) return new Intl.NumberFormat('en-US', options).format(amount);
        try { return new Intl.NumberFormat(undefined, { ...options, currency: appData.settings.currency }).format(amount); } catch (error) { return new Intl.NumberFormat('en-US', options).format(amount); }
    }, [appData.settings]);

    const handleLogout = useCallback(async (e?: React.MouseEvent) => {
        if (e && typeof e.preventDefault === 'function') { e.preventDefault(); }

        // 1. Immediate UI Reset & Cache Clear
        setCachedData('user', null); // Clear user cache
        clearAppCache(); // Optional: Clear data cache for privacy on logout
        setCurrentUser(null);
        currentUserIdRef.current = null;
        setPageHistory(['dashboard']);
        // Reset app data to defaults
        setAppData({ users: [], branches: [], agents: [], settings: null, transactions: [], cashIns: [], cashOuts: [], incomes: [], expenses: [], notifications: [] });
        setIsAppLoading(false); 

        // 2. Defer API logout
        setTimeout(async () => {
             try { await apiService.logout(); } catch (e) { console.error("Bg logout error", e); }
        }, 200);
    }, []);

    const handleLogin = useCallback(async (user: User, isAutoLogin: boolean = false) => {
        // Prevent unnecessary re-login logic if we are already logged in as this user
        if (currentUser && currentUser.id === user.id && !isAutoLogin) return;

        // IMMEDIATE UPDATE to prevent race conditions in background logic
        currentUserIdRef.current = user.id;

        // Guard: If this is a manual login, set the flag to ignore spurious SIGNED_OUT events
        if (!isAutoLogin) {
            isLoggingInRef.current = true;
            setTimeout(() => { isLoggingInRef.current = false; }, 5000);
        }

        // Persist User
        setCachedData('user', user);

        setCurrentUser(user);
        setIsAppLoading(false);
        
        if (user) {
            if (!isAutoLogin) { setPageHistory(['dashboard']); showToast(`Welcome back!`, 'success'); }
            
            // Background Data Sync - Only fetch lightweight data on startup to speed up load time
            // Optimized: Increased delay to 2s to allow dashboard priority rendering
            // Removed getUsers fetch as it's redundant and fetched by management/dashboard logic
            setTimeout(() => {
                Promise.all([
                    apiService.getSettings(user.companyId), 
                    apiService.getNotifications(user.companyId),
                ])
                    .then(([settings, notifications]) => {
                        setCachedData('settings', settings);
                        setCachedData('notifications', notifications);
                        setAppData((prev: any) => ({ ...prev, settings, notifications }));
                    })
                    .catch(err => {
                        console.warn("Background metadata sync warning", err);
                    });
            }, 2000); // Delayed start
        } else { if (!isAutoLogin) showToast("Failed to log in.", "error"); }
    }, [showToast, isAppLoading, currentUser]); 

    // Used to signal the beginning of a login attempt to prevent race conditions
    const handleLoginStart = useCallback(() => {
        isLoggingInRef.current = true;
        // Extended timeout to cover slow network operations
        setTimeout(() => { isLoggingInRef.current = false; }, 20000);
    }, []);

    const handleLoginRef = useRef(handleLogin);
    useEffect(() => { handleLoginRef.current = handleLogin; }, [handleLogin]);
    
    const handleLogoutRef = useRef(handleLogout);
    useEffect(() => { handleLogoutRef.current = handleLogout; }, [handleLogout]);

    useEffect(() => {
        const initSession = async () => {
            try {
                // Optimistic check: if we have a user in cache, we assume logged in.
                // The restoreSession call validates this with the server.
                const user = await apiService.restoreSession();
                
                // GUARD: If user logged in manually while we were waiting, abort auto-logout
                if (currentUserIdRef.current) return;

                if (user) {
                    // Valid session found
                    handleLoginRef.current(user, true);
                } else {
                    // Session is null.
                    // CHECK CACHE: If we have a cached user, we might be offline or encountering 
                    // a network error that falsely looks like "no session".
                    const cached = getCachedData('user', null);
                    if (cached) {
                         console.warn("Restore session failed but cache exists. Staying logged in (Offline Mode).");
                         // Ensure state matches cache if not already set
                         if (!currentUserIdRef.current) {
                             handleLoginRef.current(cached as User, true);
                         }
                    } else {
                         // No cache, no session -> truly logged out
                         setIsAppLoading(false);
                    }
                }
            } catch (e) { 
                // GUARD: If manually logged in, do nothing
                if (currentUserIdRef.current) return;

                // CRITICAL FIX: If restoreSession throws (e.g. network failure), 
                // BUT we have a cached user, assume we are offline/slow and KEEP the user logged in.
                if (getCachedData('user', null)) {
                    console.warn("Session verification failed, but keeping cached user active (Offline Mode assumed).");
                    // We assume the cached user is valid for now.
                    setIsAppLoading(false);
                } else {
                    setIsAppLoading(false); 
                }
            }
        };
        initSession();
    }, []);

    useEffect(() => {
        const unsubscribe = apiService.onAuthStateChange((user, event) => {
            const currentId = currentUserIdRef.current;
            if (event === 'SIGNED_OUT') { 
                // GUARD 1: If manual login in progress, ignore
                if (isLoggingInRef.current) return;

                // GUARD 2: Windows / Unstable Network Protection
                // Supabase might fire SIGNED_OUT on token refresh failure.
                // If we have a valid session in local storage (checked via cache), we should ignore this
                // unless the user explicitly logged out.
                // Since we can't easily know "explicit", we rely on our handleLogout function clearing the cache first.
                // If cache exists, it means the logout was NOT triggered by our button.
                if (getCachedData('user', null)) {
                    console.warn("Ignoring SIGNED_OUT event because local cache exists (presumed network error).");
                    return;
                }

                if (currentId) handleLogoutRef.current(); 
                return; 
            }
            if (currentId === user?.id && event !== 'PASSWORD_RECOVERY') return;
            
            if (event === 'PASSWORD_RECOVERY') { 
                if (user) { setIsPasswordRecoveryMode(true); setIsProfileModalOpen(true); if (currentId !== user.id) handleLoginRef.current(user, true); } 
            } 
            else if ((event === 'SIGNED_OUT' && currentId) || (!user && currentId)) { 
                if (isLoggingInRef.current) return; 
                // Double check cache before logging out here too
                if (getCachedData('user', null)) return;
                
                handleLogoutRef.current(); 
            } 
            else if (event === 'SIGNED_IN' && user) { 
                // Only trigger login if we aren't already logged in as this user
                if (currentId !== user.id) handleLoginRef.current(user, true); 
            }
        });
        return () => unsubscribe();
    }, []);
    
    useEffect(() => {
        if (!currentUser) return;
        const channel = `notifications-${currentUser.companyId}`;
        const sub = apiService.realtime.subscribe(channel, (data: { type: string, payload: any }) => {
            // Handle Notifications
            if (data && data.type === 'NEW_NOTIFICATION' && data.payload) {
                if (data.payload.createdByUserId !== currentUser.id) showToast(data.payload.message, 'success');
                setAppData((prev: any) => {
                    if (prev.notifications.some((n: any) => n.id === data.payload.id)) return prev;
                    const newNotifs = [data.payload, ...prev.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    setCachedData('notifications', newNotifs);
                    return { ...prev, notifications: newNotifs };
                });
            }
            
            // Handle Data Changes (Realtime Update)
            if (data && data.type === 'DATA_CHANGE' && data.payload) {
                const { table, action, record } = data.payload;
                
                setAppData((prev: any) => {
                    // Generic helper to update lists
                    const updateList = (listName: string, item: any) => {
                        const list = prev[listName] || [];
                        if (action === 'DELETE') {
                            const filtered = list.filter((i: any) => i.id !== item.id);
                            setCachedData(listName, filtered);
                            return filtered;
                        } else {
                            // INSERT or UPDATE
                            const others = list.filter((i: any) => i.id !== item.id);
                            const updated = [item, ...others].sort((a: any, b: any) => 
                                new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
                            );
                            setCachedData(listName, updated);
                            return updated;
                        }
                    };

                    const updates: any = {};
                    if (table === 'transactions') updates.transactions = updateList('transactions', record);
                    if (table === 'cash_ins') updates.cashIns = updateList('cashIns', record);
                    if (table === 'cash_outs') updates.cashOuts = updateList('cashOuts', record);
                    if (table === 'incomes') updates.incomes = updateList('incomes', record);
                    if (table === 'expenses') updates.expenses = updateList('expenses', record);
                    if (table === 'branches') updates.branches = updateList('branches', record);
                    if (table === 'agents') updates.agents = updateList('agents', record);
                    
                    // Only trigger update if we actually changed something
                    if (Object.keys(updates).length > 0) {
                        return { ...prev, ...updates };
                    }
                    return prev;
                });
            }
        });
        return () => sub.unsubscribe();
    }, [currentUser, showToast]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey) { if (event.key === 'k') { event.preventDefault(); setIsPaletteOpen(prev => !prev); } } 
            else if (event.altKey) {
                switch (event.key.toLowerCase()) {
                    case 'd': if (hasPermission('dashboard')) navigateTo('dashboard'); break;
                    case 't': if (hasPermission('transactions')) navigateTo('transactions'); break;
                    case 'n': if (hasPermission('transactions')) setIsPaletteOpen(true); break;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasPermission, navigateTo]);
    
    useEffect(() => { document.body.style.overflow = isPaletteOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [isPaletteOpen]);
    useEffect(() => { const handleClickOutside = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setIsUserMenuOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);

    const handlePaletteSelect = useCallback((item: { type: string; id: string; }) => {
        if (item.type === 'page') {
            if (hasPermission(item.id as Page)) navigateTo(item.id as Page); else showToast("Access denied.", "error");
        } else if (item.type === 'branch' || item.type === 'agent') {
            if (hasPermission('transactions')) { setLastSelectedEntityType(item.type as any); setLastSelectedEntityId(item.id); navigateTo('transactions'); } else showToast("Access denied.", "error");
        }
        setIsPaletteOpen(false);
    }, [hasPermission, navigateTo, showToast]);

     const handleUpdateProfile = async (data: any) => {
        if (!currentUser) return;
        setGlobalLoading(true);
        try {
            const updatedUser = await apiService.updateMyProfile(currentUser.id, data);
            setCurrentUser(updatedUser);
            setCachedData('user', updatedUser); // Update cache
            showToast('Profile updated!', 'success');
            setIsProfileModalOpen(false);
            setIsPasswordRecoveryMode(false);
        } catch (error: any) { showToast(error.message || 'Update failed.', 'error'); } finally { setGlobalLoading(false); }
    };

    const renderPage = () => {
        if (!hasPermission(activePage)) return <PermissionDeniedPage />;
        return (
            <Suspense fallback={<Spinner />}>
                {activePage === 'dashboard' && <DashboardPage />}
                {activePage === 'transactions' && <TransactionsPage />}
                {activePage === 'cash-flow' && <CashFlowPage />}
                {activePage === 'management' && <ManagementPage />}
                {activePage === 'reconciliation' && <ReconciliationPage />}
                {activePage === 'reports' && <ReportsPage />}
                {activePage === 'income-expenses' && <IncomeAndExpenditurePage />}
                {activePage === 'settings' && <SettingsPage />}
            </Suspense>
        );
    };
    
    const SidebarContent = () => (
        <>
            <div className="p-4 border-b border-slate-700 flex flex-col items-center gap-2">
                {appData.settings?.companyLogo && <img src={appData.settings.companyLogo} alt="Logo" className="h-12 w-auto object-contain" />}
                <h1 className="text-xl font-bold text-center">{appData.settings?.companyName || "FinTrack Pro"}</h1>
            </div>
            <nav className="flex-grow p-2">
                <ul>
                    {navItems.map(item => (
                        <li key={item.name}>
                            <a href="#" onClick={(e) => { e.preventDefault(); navigateTo(item.page); setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-3 rounded-lg my-1 transition-all duration-200 ease-in-out ${activePage === item.page ? 'bg-primary-600 text-white' : 'hover:bg-slate-700 hover:translate-x-1'}`}>
                                <item.icon className="w-5 h-5" /> <span>{item.name}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="p-4 border-t border-slate-700">
                 <a href="#" onClick={(e) => handleLogout(e)} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-700 transition-all duration-200 ease-in-out hover:translate-x-1">
                     <LogoutIcon className="w-5 h-5" /> <span>Logout</span>
                 </a>
            </div>
        </>
    );

    return (
        <AppContext.Provider value={{ 
            api: apiService, ...appData, currentUser, lockDate, setLockDate, 
            fetchManagementData: fetchManagementDataReal, 
            fetchCashFlowData: fetchCashFlowDataReal, 
            fetchPettyCashData, fetchSettings, fetchTransactions, fetchNotifications, 
            updateEntityTransactions, setGlobalLoading, formatCurrency, 
            lastSelectedEntityType, setLastSelectedEntityType, lastSelectedEntityId, setLastSelectedEntityId, 
            showToast, handleMarkNotificationRead, handleMarkAllNotificationsRead, handleClearNotifications, handleNotificationClick, 
            installApp, isInstallable, navigateTo 
        }}>
            <ErrorBoundary>
                <ToastContainer toasts={toasts} removeToast={removeToast} />
                {isAppLoading ? (
                     <div className="h-screen w-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                        <Spinner />
                     </div>
                ) : !currentUser ? (
                    <AuthPage 
                        api={apiService} 
                        onLoginSuccess={(user) => handleLogin(user, false)} 
                        onLoginStart={handleLoginStart}
                        showToast={showToast} 
                    />
                ) : (
                    <>
                        <ProgressBar isLoading={isGlobalLoading} />
                        {/* Removed key prop to prevent full re-renders on minor updates */}
                        <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                            <aside className="w-64 bg-slate-800 text-white flex-col hidden md:flex screen-only">
                                <SidebarContent />
                                {!isOnline && <div className="bg-red-600 text-white text-xs text-center py-1">Offline Mode (Changes Queued)</div>}
                            </aside>
                            {isSidebarOpen && (
                                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden screen-only" onClick={() => setIsSidebarOpen(false)}>
                                    <aside className="w-64 bg-slate-800 text-white flex flex-col h-full" onClick={e => e.stopPropagation()}>
                                        <SidebarContent />
                                        {!isOnline && <div className="bg-red-600 text-white text-xs text-center py-1">Offline Mode (Changes Queued)</div>}
                                    </aside>
                                </div>
                            )}
                            <main className="flex-1 flex flex-col overflow-hidden main-content-area pb-16 md:pb-0">
                                <header className="bg-white dark:bg-slate-800 shadow-md p-4 flex justify-between items-center z-10 screen-only">
                                    <div className="flex items-center gap-2">
                                        <button className="md:hidden text-slate-500 dark:text-slate-400" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Open menu"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></button>
                                        {pageHistory.length > 1 && (<button onClick={navigateBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Go back"><ArrowLeftIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" /></button>)}
                                        <h1 className="text-2xl font-bold ml-2">{navItems.find(item => item.page === activePage)?.name || 'Dashboard'}</h1>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => refreshAllData(false)} 
                                            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                            title="Refresh Data"
                                        >
                                            <LoadingSpinnerIcon className={`w-5 h-5 text-slate-500 dark:text-slate-400 ${isGlobalLoading ? 'animate-spin text-primary-600' : ''}`} />
                                        </button>
                                        <button onClick={() => setIsPaletteOpen(true)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 hidden sm:block" title="Search (Alt+K)"><SearchIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" /></button>
                                        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">{theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}</button>
                                        <NotificationBell />
                                        <ActiveUsers />
                                        <div ref={userMenuRef} className="relative">
                                            <button onClick={() => setIsUserMenuOpen(prev => !prev)} className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                                                <div className="text-right hidden sm:block"><span className="font-semibold">{currentUser.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{currentUser.role}</span></div>
                                                <img src={currentUser.avatarUrl} alt="User Avatar" className="w-10 h-10 rounded-full" />
                                            </button>
                                            {isUserMenuOpen && (
                                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 z-20 animate-fade-in-scale-up" style={{transformOrigin: 'top right'}}>
                                                    <ul className="p-1">
                                                        <li><button onClick={() => { setIsProfileModalOpen(true); setIsUserMenuOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-100 dark:hover:bg-slate-700"><UserCircleIcon className="w-5 h-5" /> My Profile</button></li>
                                                        <li><button onClick={(e) => handleLogout(e)} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50"><LogoutIcon className="w-5 h-5" /> Logout</button></li>
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </header>
                                <div key={activePage} className="flex-1 p-4 md:p-6 overflow-y-auto animate-fade-in-up main-content-area">{renderPage()}</div>
                                <footer className="text-center p-2 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 screen-only hidden md:flex justify-between px-4">
                                    <span>Made By Alhaji Amadu Kanu</span>
                                    <div className="flex items-center gap-3">
                                        <span className={`font-semibold ${isOnline ? 'text-green-600' : 'text-red-600'}`}>{isOnline ? 'Online' : 'Offline'}</span>
                                        <span className="text-slate-300 dark:text-slate-600">|</span>
                                        <div className="flex items-center gap-1"><span>DB:</span>{dbStatus === 'unknown' && <span className="text-yellow-500">Checking...</span>}{dbStatus === 'connected' && <span className="text-green-600 flex items-center gap-0.5"><CheckIcon className="w-3 h-3"/> Connected</span>}{dbStatus === 'error' && <span className="text-red-600 flex items-center gap-0.5"><CloseIcon className="w-3 h-3"/> Error</span>}</div>
                                    </div>
                                </footer>
                            </main>
                        </div>
                        <MobileNavBar activePage={activePage} onNavigate={navigateTo} onMenuClick={() => setIsSidebarOpen(true)} />
                        <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onSelect={handlePaletteSelect} navItems={navItems} branches={appData.branches} agents={appData.agents} />
                        <AiAnalyst />
                        {isProfileModalOpen && <ProfileModal isOpen={isProfileModalOpen} onClose={() => { if (isPasswordRecoveryMode) { setIsProfileModalOpen(false); setIsPasswordRecoveryMode(false); } else { setIsProfileModalOpen(false); } }} user={currentUser} onSave={handleUpdateProfile} isRecoveryMode={isPasswordRecoveryMode} />}
                    </>
                )}
            </ErrorBoundary>
        </AppContext.Provider>
    );
}

type ProfileModalProps = { isOpen: boolean; onClose: () => void; user: User; onSave: (data: any) => Promise<void>; isRecoveryMode?: boolean; };
const ProfileModal: FC<ProfileModalProps> = ({ isOpen, onClose, user, onSave, isRecoveryMode = false }) => {
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [avatar, setAvatar] = useState(user.avatarUrl);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordVisibility, setPasswordVisibility] = useState({ current: false, new: false, confirm: false });
    const { showToast } = useAppContext();
    
    const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => setPasswordVisibility(prev => ({...prev, [field]: !prev[field]}));
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setAvatar(reader.result as string); reader.readAsDataURL(file); } };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave: any = {};
        if (name !== user.name) dataToSave.name = name;
        if (email !== user.email) dataToSave.email = email;
        if (avatar !== user.avatarUrl) dataToSave.avatarUrl = avatar;
        if (isRecoveryMode && !newPassword) { showToast("Please enter a new password.", "error"); return; }
        if (newPassword) {
            if (newPassword !== confirmPassword) { showToast("New passwords do not match.", "error"); return; }
             if (!isRecoveryMode && !currentPassword) { showToast("Please enter your current password.", "error"); return; }
            if (currentPassword) dataToSave.currentPassword = currentPassword;
            dataToSave.newPassword = newPassword;
        }
        if (Object.keys(dataToSave).length === 0 && !newPassword) { showToast("No changes to save.", "success"); onClose(); return; }
        await onSave(dataToSave);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isRecoveryMode ? "Reset Your Password" : "Edit My Profile"}>
            <form onSubmit={handleSubmit} className="space-y-6">
                {!isRecoveryMode && ( <div className="flex items-center gap-4"> <img src={avatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover" /> <div> <label htmlFor="avatar-upload" className="cursor-pointer bg-slate-200 dark:bg-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-500"> Change Avatar </label> <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" /> </div> </div> )}
                {!isRecoveryMode && ( <div className="space-y-4"> <div> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label> <div className="relative mt-1"> <UserIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" /> <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full p-2 pl-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> </div> </div> <div> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label> <div className="relative mt-1"> <EmailIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" /> <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2 pl-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> </div> </div> </div> )}
                <div className={`border-t pt-6 space-y-4 dark:border-slate-600 ${isRecoveryMode ? 'border-t-0 pt-0' : ''}`}>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">{isRecoveryMode ? 'Set New Password' : 'Change Password'}</h4>
                    {isRecoveryMode && <p className="text-sm text-slate-500">Please enter a new password to secure your account.</p>}
                     {!isRecoveryMode && ( <div> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Current Password</label> <div className="relative mt-1"> <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" /> <input type={passwordVisibility.current ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Required to change password" className="w-full p-2 pl-10 pr-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> <button type="button" onClick={() => togglePasswordVisibility('current')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"> {passwordVisibility.current ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />} </button> </div> </div> )}
                     <div> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label> <div className="relative mt-1"> <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" /> <input type={passwordVisibility.new ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={isRecoveryMode ? "Enter new password" : "Leave blank to keep current"} className="w-full p-2 pl-10 pr-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> <button type="button" onClick={() => togglePasswordVisibility('new')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"> {passwordVisibility.new ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />} </button> </div> </div>
                     <div> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New Password</label> <div className="relative mt-1"> <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" /> <input type={passwordVisibility.confirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 pl-10 pr-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> <button type="button" onClick={() => togglePasswordVisibility('confirm')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"> {passwordVisibility.confirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />} </button> </div> </div>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                    {!isRecoveryMode && ( <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500"> Cancel </button> )}
                    <button type="submit" className="px-6 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"> {isRecoveryMode ? 'Update Password' : 'Save Changes'} </button>
                </div>
            </form>
        </Modal>
    );
}
