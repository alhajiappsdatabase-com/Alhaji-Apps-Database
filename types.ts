import React, { createContext, useContext, FC } from 'react';

// --- Domain Models ---

export type ServiceType = 'ria' | 'moneyGram' | 'westernUnion' | 'afro';

export type Rates = Record<ServiceType, number>;

export interface Company {
    id: string;
    name: string;
}

export interface User {
    id: string;
    companyId: string;
    name: string;
    email: string;
    password?: string;
    avatarUrl: string;
    role: 'Admin' | 'Manager' | 'Clerk';
}

export interface ActiveUser {
    userId: string;
    name: string;
    avatarUrl: string;
    onlineAt: string;
    color: string; // Hex color derived from name/id
    currentLocation?: string;
}

export interface EditLog {
    timestamp: string;
    userId: string;
    userName: string;
    previousState: Partial<Transaction> | Partial<CashIn> | Partial<CashOut> | Partial<Branch> | Partial<Agent> | Partial<Income> | Partial<Expense>;
    newState: Partial<Transaction> | Partial<CashIn> | Partial<CashOut> | Partial<Branch> | Partial<Agent> | Partial<Income> | Partial<Expense>;
}

export interface Branch {
    id: string;
    companyId: string;
    name: string;
    location: string;
    rates: Rates;
    isActive: boolean;
    initialBalance?: number;
    editHistory?: EditLog[];
    createdAt?: string;
}

export interface Agent {
    id: string;
    companyId: string;
    name: string;
    location: string;
    rates: Rates;
    isActive: boolean;
    initialBalance?: number;
    editHistory?: EditLog[];
    createdAt?: string;
}

export interface Transaction {
    id: string;
    companyId: string;
    date: string;
    entityId: string;
    entityType: 'branch' | 'agent';
    openingBalance: number;
    cashReceived: number;
    totalCash: number;
    cashPaidByService: Record<ServiceType, { formula: string; total: number }>;
    totalCashPaid: number;
    closingBalance: number;
    createdAt: string;
    createdByUserId: string;
    createdByName: string;
    editHistory: EditLog[];
}

export interface CashIn {
    id: string;
    companyId: string;
    date: string;
    amount: number;
    source: string;
    note: string;
    createdAt: string;
    createdByUserId: string;
    createdByName: string;
    editHistory?: EditLog[];
}

export interface CashOut {
    id: string;
    companyId: string;
    date: string;
    entityId: string;
    entityType: 'branch' | 'agent';
    amount: number;
    note: string;
    createdAt: string;
    createdByUserId: string;
    createdByName: string;
    editHistory?: EditLog[];
}

export interface Income {
    id: string;
    companyId: string;
    date: string;
    category: string;
    amount: number;
    note: string;
    createdAt: string;
    createdByUserId: string;
    createdByName: string;
    editHistory?: EditLog[];
}

export interface Expense {
    id: string;
    companyId: string;
    date: string;
    category: string;
    amount: number;
    note: string;
    createdAt: string;
    createdByUserId: string;
    createdByName: string;
    editHistory?: EditLog[];
}

export interface Settings {
    companyId: string;
    companyName: string;
    defaultRates: {
        branch: Rates;
        agent: Rates;
    };
    principalRates: Rates;
    currency: string;
    dateFormat: string;
    signatureTitle: string;
    signatureImage: string | null;
    commissionTemplateNote: string;
    commissionTemplateThankYou: string;
    companyLogo: string | null;
    companyLogoSize: number;
    companyAddress: string;
    companyEmail: string;
    companyPhone: string;
    dormancyThresholdDays: number;
    showQRCodeOnReport: boolean;
}

export interface CommissionSummaryItem {
    entityId: string;
    entityName: string;
    entityType: 'Branch' | 'Agent';
    totalPayment: number;
    totalCommission: number;
    totalPrincipalCommission: number;
    totalRia: number;
    totalMoneyGram: number;
    totalWesternUnion: number;
    totalAfro: number;
}

export interface Notification {
    id: string;
    companyId: string;
    message: string;
    entityId?: string;
    entityType?: 'branch' | 'agent' | 'user';
    createdAt: string;
    isRead: boolean;
    createdByUserId?: string;
    createdByName?: string;
}

export type PresenceInfo = {
    sessionId: string;
    userId: string;
    userName: string;
    entityId: string;
    date: string;
    field: ServiceType;
    timestamp: number;
    color?: string; // Visual indicator color
    value?: string; // The value being typed
};

// --- API Interface ---

export interface ApiService {
    checkConnection: () => Promise<{ success: boolean; message: string }>;
    login: (email: string, password?: string) => Promise<User | null>;
    signUp: (name: string, email: string, password: string, companyName: string) => Promise<User>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
    resendConfirmationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
    restoreSession: () => Promise<User | null>;
    onAuthStateChange: (callback: (user: User | null, event?: string) => void) => () => void;
    checkEmailExists: (email: string) => Promise<boolean>;
    checkCompanyNameExists: (companyName: string) => Promise<boolean>;
    getCanonicalCompanyName: (companyName: string) => Promise<string | null>;
    getUsers: (companyId: string) => Promise<User[]>;
    getBranches: (companyId: string) => Promise<Branch[]>;
    getAgents: (companyId: string) => Promise<Agent[]>;
    getTransactions: (companyId: string, limit?: number) => Promise<Transaction[]>;
    getTransactionsByRange: (companyId: string, startDate: string, endDate: string) => Promise<Transaction[]>;
    getEntityHistory: (companyId: string, entityId: string, limit?: number) => Promise<Transaction[]>;
    getCashIns: (companyId: string, limit?: number) => Promise<CashIn[]>;
    getCashOuts: (companyId: string, limit?: number) => Promise<CashOut[]>;
    getSettings: (companyId: string) => Promise<Settings | null>;
    getIncomes: (companyId: string, limit?: number) => Promise<Income[]>;
    getExpenses: (companyId: string, limit?: number) => Promise<Expense[]>;
    getNotifications: (companyId: string) => Promise<Notification[]>;
    getOpeningDataForEntity: (companyId: string, entityId: string, entityType: 'branch' | 'agent', date: string) => Promise<{ openingBalance: number; cashReceived: number }>;
    saveTransaction: (companyId: string, currentUser: User, txData: Omit<Transaction, 'id' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory' | 'companyId'>) => Promise<Transaction>;
    addCashIn: (companyId: string, currentUser: User, cashInData: Omit<CashIn, 'id' | 'editHistory' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'companyId'>) => Promise<CashIn>;
    updateCashIn: (companyId: string, currentUser: User, cashInData: CashIn) => Promise<CashIn>;
    deleteCashIn: (companyId: string, currentUser: User, id: string) => Promise<{ success: boolean }>;
    addCashOut: (companyId: string, currentUser: User, cashOutData: Omit<CashOut, 'id' | 'editHistory' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'companyId'>) => Promise<CashOut>;
    updateCashOut: (companyId: string, currentUser: User, cashOutData: CashOut) => Promise<CashOut>;
    deleteCashOut: (companyId: string, currentUser: User, id: string) => Promise<{ success: boolean }>;
    addIncome: (companyId: string, currentUser: User, incomeData: Omit<Income, 'id' | 'companyId' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'>) => Promise<Income>;
    updateIncome: (companyId: string, currentUser: User, incomeData: Income) => Promise<Income>;
    deleteIncome: (companyId: string, currentUser: User, id: string) => Promise<{ success: boolean }>;
    addExpense: (companyId: string, currentUser: User, expenseData: Omit<Expense, 'id' | 'companyId' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'>) => Promise<Expense>;
    updateExpense: (companyId: string, currentUser: User, expenseData: Expense) => Promise<Expense>;
    deleteExpense: (companyId: string, currentUser: User, id: string) => Promise<{ success: boolean }>;
    addBranch: (companyId: string, currentUser: User, branchData: Omit<Branch, 'id' | 'companyId'>) => Promise<Branch>;
    updateBranch: (companyId: string, currentUser: User, branchData: Branch) => Promise<Branch>;
    addAgent: (companyId: string, currentUser: User, agentData: Omit<Agent, 'id' | 'companyId'>) => Promise<Agent>;
    updateAgent: (companyId: string, currentUser: User, agentData: Agent) => Promise<Agent>;
    addUser: (companyId: string, currentUser: User, userData: Omit<User, 'id' | 'companyId' | 'avatarUrl'>) => Promise<User>;
    updateUser: (companyId: string, currentUser: User, userData: User) => Promise<User>;
    updateMyProfile: (userId: string, data: { name?: string; email?: string; avatarUrl?: string; currentPassword?: string; newPassword?: string; }) => Promise<User>;
    updateSettings: (companyId: string, currentUser: User, newSettings: Settings) => Promise<Settings>;
    deleteBranch: (companyId: string, currentUser: User, branchId: string) => Promise<{ success: boolean }>;
    deleteAgent: (companyId: string, currentUser: User, agentId: string) => Promise<{ success: boolean }>;
    markNotificationRead: (companyId: string, notificationId: string) => Promise<Notification | null>;
    markAllNotificationsRead: (companyId: string) => Promise<{ success: boolean }>;
    clearAllNotifications: (companyId: string) => Promise<{ success: boolean }>;
    bulkImportTransactions: (companyId: string, currentUser: User, data: any[]) => Promise<{ success: boolean; importedCount: number; errorCount: number; errors: string[] }>;
    seedDatabase: (companyId: string, currentUser: User) => Promise<void>;
    getFullBackup: (companyId: string) => Promise<{ users: User[], branches: Branch[], agents: Agent[], transactions: Transaction[], cashIns: CashIn[], cashOuts: CashOut[], incomes: Income[], expenses: Expense[], settings: Settings | null }>;
    realtime: {
        subscribe: (channel: string, callback: (payload: any) => void) => { unsubscribe: () => void, subscriberId: string };
        broadcast: (channel: string, payload: any, senderId: string) => void;
        subscribeToPresence: (channelName: string, userState: any, onSync: (users: any[]) => void) => { unsubscribe: () => void };
    };
}

// --- Application Context (Moved here from App.tsx to prevent cycles) ---

export type Page = 'dashboard' | 'transactions' | 'cash-flow' | 'management' | 'reports' | 'income-expenses' | 'settings' | 'reconciliation';

export type NavItem = {
    name: string;
    icon: FC<{ className?: string }>;
    page: Page;
    roles: User['role'][];
};

export type AppContextType = {
    api: ApiService;
    currentUser: User | null;
    users: User[];
    branches: Branch[];
    agents: Agent[];
    settings: Settings | null;
    transactions: Transaction[];
    cashIns: CashIn[];
    cashOuts: CashOut[];
    incomes: Income[];
    expenses: Expense[];
    notifications: Notification[];
    lockDate: string | null;
    setLockDate: (date: string | null) => void;
    fetchManagementData: () => Promise<void>;
    fetchCashFlowData: () => Promise<void>;
    fetchPettyCashData: () => Promise<void>;
    fetchSettings: () => Promise<void>;
    fetchTransactions: () => Promise<void>;
    fetchNotifications: () => Promise<void>;
    updateEntityTransactions: (transaction: Transaction) => void;
    setGlobalLoading: React.Dispatch<React.SetStateAction<boolean>>;
    formatCurrency: (amount: number) => string;
    lastSelectedEntityType: 'branch' | 'agent';
    setLastSelectedEntityType: React.Dispatch<React.SetStateAction<'branch' | 'agent'>>;
    lastSelectedEntityId: string;
    setLastSelectedEntityId: React.Dispatch<React.SetStateAction<string>>;
    showToast: (message: string, type?: 'success' | 'error') => void;
    handleMarkNotificationRead: (id: string) => void;
    handleMarkAllNotificationsRead: () => void;
    handleClearNotifications: () => void;
    handleNotificationClick: (notification: Notification, callback: () => void) => void;
    isInstallable: boolean;
    installApp: () => void;
    navigateTo: (page: Page) => void;
};

export const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppProvider");
    return context;
};