
import { supabaseApi } from './supabaseApi';

export interface OfflineAction {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
    retryCount: number;
}

const QUEUE_KEY = 'fintrack_offline_queue';

export const offlineQueue = {
    getQueue: (): OfflineAction[] => {
        try {
            return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        } catch { return []; }
    },

    enqueue: (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => {
        const queue = offlineQueue.getQueue();
        // Avoid duplicate actions if possible (simple check)
        const newAction: OfflineAction = {
            ...action,
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            timestamp: Date.now(),
            retryCount: 0
        };
        queue.push(newAction);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        return newAction.id;
    },

    remove: (id: string) => {
        const queue = offlineQueue.getQueue().filter(a => a.id !== id);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    },

    clear: () => localStorage.removeItem(QUEUE_KEY)
};

export const processOfflineQueue = async (onSync?: (count: number) => void) => {
    const queue = offlineQueue.getQueue();
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline actions...`);
    let syncedCount = 0;

    // Process sequentially to maintain order
    for (const action of queue) {
        try {
            console.log(`Replaying action: ${action.type}`, action.payload);
            
            // Map action types to API calls
            // Note: We need to import supabaseApi dynamically or pass it to avoid circular deps if this file grows,
            // but for now standard import works if structure is clean.
            // However, supabaseApi imports types which might be circular. 
            // We will use the imported instance.

            switch (action.type) {
                case 'saveTransaction':
                    await supabaseApi.saveTransaction(
                        action.payload.companyId, 
                        action.payload.currentUser, 
                        action.payload.txData
                    );
                    break;
                case 'addCashIn':
                    await supabaseApi.addCashIn(
                        action.payload.companyId,
                        action.payload.currentUser,
                        action.payload.data
                    );
                    break;
                case 'addCashOut':
                    await supabaseApi.addCashOut(
                        action.payload.companyId,
                        action.payload.currentUser,
                        action.payload.data
                    );
                    break;
                case 'addIncome':
                    await supabaseApi.addIncome(
                        action.payload.companyId,
                        action.payload.currentUser,
                        action.payload.data
                    );
                    break;
                case 'addExpense':
                    await supabaseApi.addExpense(
                        action.payload.companyId,
                        action.payload.currentUser,
                        action.payload.data
                    );
                    break;
                // Add other write operations as needed
            }

            // If successful, remove from queue
            offlineQueue.remove(action.id);
            syncedCount++;
            
        } catch (error: any) {
            console.error(`Failed to replay action ${action.type}:`, error);
            // If it's a permanent error (e.g. validation), maybe remove it?
            // For now, we keep it to retry later unless it exceeds max retries (logic to be added)
            if (action.retryCount > 5) {
                 offlineQueue.remove(action.id); // Give up
            } else {
                // Update retry count
                const currentQueue = offlineQueue.getQueue();
                const updated = currentQueue.map(a => a.id === action.id ? {...a, retryCount: a.retryCount + 1} : a);
                localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
            }
        }
    }

    if (onSync && syncedCount > 0) {
        onSync(syncedCount);
    }
};
