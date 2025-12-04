
import { ApiService, User } from '../types';

export const mockApi: ApiService = {
    checkConnection: async () => {
        return { success: true, message: "Mock connection successful" };
    },
    login: async (email, password) => {
        // Mock login
        return {
            id: '1',
            companyId: 'comp1',
            name: 'Mock User',
            email: email,
            role: 'Admin',
            avatarUrl: 'https://ui-avatars.com/api/?name=Mock+User'
        };
    },
    signUp: async (name, email, password, companyName) => {
        return {
            id: '1',
            companyId: 'comp1',
            name: name,
            email: email,
            role: 'Admin',
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`
        };
    },
    logout: async () => {},
    resetPassword: async () => ({ success: true }),
    resendConfirmationEmail: async () => ({ success: true }), // Added stub
    restoreSession: async () => {
        return Promise.resolve(null);
    },
    onAuthStateChange: (callback: (user: User | null, event?: string) => void) => {
        // In mock mode, we don't really have external auth events
        return () => {};
    },
    checkEmailExists: async (email: string): Promise<boolean> => {
        return false;
    },
    checkCompanyNameExists: async () => false,
    getCanonicalCompanyName: async (name) => null,
    getUsers: async () => [],
    getBranches: async () => [],
    getAgents: async () => [],
    getTransactions: async () => [],
    getTransactionsByRange: async () => [],
    getEntityHistory: async () => [],
    getCashIns: async () => [],
    getCashOuts: async () => [],
    getSettings: async () => null,
    getIncomes: async () => [],
    getExpenses: async () => [],
    getNotifications: async () => [],
    getOpeningDataForEntity: async () => ({ openingBalance: 0, cashReceived: 0 }),
    saveTransaction: async (companyId, currentUser, txData) => {
        return {
            id: 'mock-tx-1',
            companyId: companyId,
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
        };
    },
    addCashIn: async () => ({} as any),
    updateCashIn: async () => ({} as any),
    deleteCashIn: async () => ({ success: true }),
    addCashOut: async () => ({} as any),
    updateCashOut: async () => ({} as any),
    deleteCashOut: async () => ({ success: true }),
    addIncome: async () => ({} as any),
    updateIncome: async () => ({} as any),
    deleteIncome: async () => ({ success: true }),
    addExpense: async () => ({} as any),
    updateExpense: async () => ({} as any),
    deleteExpense: async () => ({ success: true }),
    addBranch: async () => ({} as any),
    updateBranch: async () => ({} as any),
    addAgent: async () => ({} as any),
    updateAgent: async () => ({} as any),
    addUser: async () => ({} as any),
    updateUser: async () => ({} as any),
    updateMyProfile: async () => ({} as any),
    updateSettings: async () => ({} as any),
    deleteBranch: async () => ({ success: true }),
    deleteAgent: async () => ({ success: true }),
    markNotificationRead: async () => null,
    markAllNotificationsRead: async () => ({ success: true }),
    clearAllNotifications: async () => ({ success: true }),
    bulkImportTransactions: async () => ({ success: true, importedCount: 0, errorCount: 0, errors: [] }),
    seedDatabase: async () => {},
    getFullBackup: async () => ({
        users: [], branches: [], agents: [], transactions: [], cashIns: [], cashOuts: [], incomes: [], expenses: [], settings: null
    }),
    realtime: {
        subscribe: (channel, callback) => ({ unsubscribe: () => {}, subscriberId: 'mock' }),
        broadcast: (channel, payload, senderId) => {},
        subscribeToPresence: (channelName, userState, onSync) => ({ unsubscribe: () => {} })
    }
};
