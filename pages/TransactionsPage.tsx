
import React, { useState, useEffect, useMemo, useCallback, FC, useRef } from 'react';
// Fix: Import useAppContext from types.ts to avoid circular dependency with App.tsx
import { useAppContext, PresenceInfo } from '../types';
import { Card, SearchableSelect, Modal } from '../components/ui';
import { Transaction, ServiceType, EditLog } from '../types';
import { HistoryIcon, CheckIcon, UploadIcon, DownloadIcon, EyeIcon, PrinterIcon, LockClosedIcon, FileExcelIcon, LoadingSpinnerIcon } from '../components/icons';
import ReceiptView, { ReceiptData } from '../components/ReceiptView';

const serviceTypes: ServiceType[] = ['ria', 'moneyGram', 'westernUnion', 'afro'];
const serviceNames: Record<ServiceType, string> = {
    ria: 'Ria',
    moneyGram: 'MoneyGram',
    westernUnion: 'Western Union',
    afro: 'Afro'
};

const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const SummaryCard: FC<{ data: Omit<Transaction, 'id' | 'cashPaidByService' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'>, onPrint: () => void }> = ({ data, onPrint }) => {
    const { formatCurrency } = useAppContext();
    const paidAmount = Math.round(data.totalCashPaid);
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-center relative">
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Opening</h4>
                <p className="text-xl font-bold">{formatCurrency(data.openingBalance)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Received</h4>
                <p className="text-xl font-bold text-green-500">+ {formatCurrency(data.cashReceived)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Cash</h4>
                <p className="text-xl font-bold">{formatCurrency(data.totalCash)}</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Paid</h4>
                <p className="text-xl font-bold text-blue-600 min-h-[1.75rem]">
                    {paidAmount > 0 ? `- ${formatCurrency(data.totalCashPaid)}` : ''}
                </p>
            </div>
            <div className="p-3 col-span-2 bg-slate-100 dark:bg-slate-700 rounded-lg relative">
                 <button 
                    onClick={onPrint}
                    className="absolute top-1 right-1 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Print Daily Summary"
                >
                    <PrinterIcon className="w-4 h-4" />
                </button>
                <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Closing Balance</h4>
                <p className={`text-2xl font-extrabold ${data.closingBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(data.closingBalance)}</p>
            </div>
        </div>
    );
};

type FormulaInputProps = {
    service: ServiceType;
    formula: string;
    onFormulaChange: (service: ServiceType, value: string) => void;
    formatNumber: (amount: number) => string;
    onViewHistory: () => void;
    hasHistory: boolean;
    onInputFocus: (service: ServiceType) => void;
    onInputBlur: () => void;
    onEnterSave: () => void;
    isDisabled: boolean;
    activeEditor?: { name: string; color: string; };
};

const FormulaInput = React.forwardRef<HTMLTextAreaElement, FormulaInputProps>(
    ({ service, formula, onFormulaChange, formatNumber, onViewHistory, hasHistory, onInputFocus, onInputBlur, onEnterSave, isDisabled, activeEditor }, ref) => {
        const [isEditing, setIsEditing] = useState(false);
        const [isValid, setIsValid] = useState(true);
        const localTextareaRef = useRef<HTMLTextAreaElement>(null);

        React.useImperativeHandle(ref, () => localTextareaRef.current!);

        const evaluatedValue = useMemo(() => {
            return formula.split('+').reduce((sum, val) => {
                const num = parseFloat(val);
                return sum + (isNaN(num) ? 0 : num);
            }, 0);
        }, [formula]);

        const displayValue = isEditing
            ? (formula === '0' ? '' : formula)
            : (evaluatedValue > 0 ? formatNumber(evaluatedValue) : '');

        useEffect(() => {
            if (localTextareaRef.current) {
                localTextareaRef.current.style.height = 'auto'; // Reset height to recalculate
                localTextareaRef.current.style.height = `${localTextareaRef.current.scrollHeight}px`;
            }
        }, [displayValue]);
        
        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onEnterSave();
                (e.target as HTMLTextAreaElement).blur();
            }
        };
        
        const handleLocalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const value = e.target.value;
            // Allow numbers, decimal points, plus signs, and whitespace
            setIsValid(/^[0-9.+\s]*$/.test(value));
            onFormulaChange(service, value);
        };

        return (
            <div className={`${isDisabled ? 'opacity-60' : ''} relative`}>
                {activeEditor && (
                    <div 
                        className="absolute -top-6 left-0 px-2 py-0.5 text-[10px] font-bold text-white rounded-t-md z-50 shadow-md animate-fade-in"
                        style={{ backgroundColor: '#4ade80' }} // Use the green color for consistency
                    >
                        {activeEditor.name} is typing...
                    </div>
                )}
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{serviceNames[service]}</label>
                        {hasHistory && (
                            <button
                                onClick={onViewHistory}
                                tabIndex={-1}
                                className="text-slate-400 hover:text-blue-500 transition-colors p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
                                title={`View ${serviceNames[service]} history`}
                                aria-label={`View history for ${serviceNames[service]}`}
                            >
                                <HistoryIcon className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {isEditing && formula.includes('+') && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">= {formatNumber(evaluatedValue)}</span>
                    )}
                </div>
                <textarea
                    ref={localTextareaRef}
                    rows={1}
                    placeholder={isDisabled ? "Locked" : "e.g., 100+50"}
                    value={displayValue}
                    onChange={handleLocalChange}
                    onFocus={() => { if(!isDisabled) { setIsEditing(true); onInputFocus(service); }}}
                    onBlur={() => { setIsEditing(false); onInputBlur(); }}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                    className={`w-full p-2 font-mono border rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none overflow-hidden transition-all duration-300 ${
                        !isValid ? 'border-red-500 ring-1 ring-red-500' : 
                        activeEditor ? 'breathing-glow relative' : 
                        'dark:border-slate-600 focus:ring-primary-500 focus:border-primary-500'
                    } ${isDisabled ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''}`}
                    style={{
                        // Ensure outline doesn't conflict with our custom animation
                        outline: 'none',
                        borderColor: activeEditor ? '#4ade80' : undefined 
                    }}
                />
            </div>
        );
    }
);

const SummaryListCard: FC<{
    title: string;
    data: Record<ServiceType, number>;
    isOverall?: boolean;
}> = ({ title, data, isOverall = false }) => {
    const { formatCurrency } = useAppContext();
    const total = (Object.values(data) as number[]).reduce((sum, val) => sum + val, 0);

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 border ${isOverall ? 'border-l-4 border-l-blue-500 border-y border-r border-slate-200 dark:border-slate-700' : 'border border-slate-200 dark:border-slate-700'} transition-all hover:shadow-md`}>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 text-lg">{title}</h3>
            <div className="space-y-3">
                {serviceTypes.map(service => (
                    <div key={service} className="flex justify-between items-center border-b border-slate-50 dark:border-slate-700/50 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">{serviceNames[service]}</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tracking-tight">
                            {formatCurrency(data[service])}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-end">
                <span className={`font-bold text-slate-900 dark:text-white ${isOverall ? 'text-lg' : 'text-base'}`}>
                    {isOverall ? 'Grand Total' : 'Total'}
                </span>
                <span className={`font-mono font-bold ${isOverall ? 'text-2xl text-green-600' : 'text-xl text-blue-600'}`}>
                    {formatCurrency(total)}
                </span>
            </div>
        </div>
    );
};

const TransactionsPage: FC = () => {
    const { 
        api, // Inject API from context
        branches, agents, transactions, cashOuts, // Added cashOuts
        showToast, formatCurrency,
        lastSelectedEntityType, setLastSelectedEntityType,
        lastSelectedEntityId, setLastSelectedEntityId,
        currentUser, updateEntityTransactions, setGlobalLoading,
        fetchTransactions, fetchManagementData, fetchCashFlowData, // Added fetchCashFlowData
        settings, lockDate
    } = useAppContext();

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
    const [ledgerData, setLedgerData] = useState<Transaction[]>([]);
    const [isLoadingLedger, setIsLoadingLedger] = useState(false);

    const [importFile, setImportFile] = useState<File | null>(null);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [viewingHistory, setViewingHistory] = useState<Transaction | null>(null);
    const [historyFilterService, setHistoryFilterService] = useState<ServiceType | null>(null);
    const [lastFocusedService, setLastFocusedService] = useState<ServiceType | null>(null);
    const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

    const riaInputRef = useRef<HTMLTextAreaElement>(null);
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialDataLoaded = useRef(false);
    const userMadeChange = useRef(false);
    const throttleRef = useRef<{ [key: string]: number }>({});
    
    // Refs to track previous navigation state for smart reloading
    const prevEntityIdRef = useRef(lastSelectedEntityId);
    const prevDateRef = useRef(selectedDate);
    
    const [presence, setPresence] = useState<PresenceInfo | null>(null);
    const subscriberIdRef = useRef<string | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const initialFormulas = { ria: '0', moneyGram: '0', westernUnion: '0', afro: '0' };
    const [serviceFormulas, setServiceFormulas] = useState<Record<ServiceType, string>>(initialFormulas);
    
    const isDateLocked = useMemo(() => {
        if (!lockDate) return false;
        return selectedDate < lockDate;
    }, [lockDate, selectedDate]);

    useEffect(() => {
        // Fetch all data required for this page
        Promise.all([
            fetchManagementData(),
            fetchTransactions(),
            fetchCashFlowData() // Important for calculating cash received locally
        ]);
    }, [fetchManagementData, fetchTransactions, fetchCashFlowData]);

    const formatNumber = useCallback((amount: number) => {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    }, []);
    
    const serviceTotals = useMemo(() => {
        let totals = {} as Record<ServiceType, number>;
        for (const service of serviceTypes) {
            // Explicitly type reduce generics to prevent 'unknown' inference
            totals[service] = serviceFormulas[service].split('+').reduce((sum, val) => {
                const num = parseFloat(val);
                return sum + (isNaN(num) ? 0 : num);
            }, 0);
        }
        return totals;
    }, [serviceFormulas]);

    const totalCashPaid = useMemo(() => {
        const values = Object.values(serviceTotals) as number[];
        return values.reduce((sum, total) => sum + total, 0);
    }, [serviceTotals]);

    const [summary, setSummary] = useState<Omit<Transaction, 'id' | 'cashPaidByService' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'>>({
        companyId: currentUser?.companyId || '',
        date: selectedDate, entityId: '', entityType: 'agent',
        openingBalance: 0, cashReceived: 0, totalCash: 0,
        totalCashPaid: 0, closingBalance: 0,
    });
    
    const existingTx = useMemo(() => 
        transactions.find(t => t.entityId === lastSelectedEntityId && t.date === selectedDate),
        [transactions, lastSelectedEntityId, selectedDate]
    );
    
    // Fetch Full Ledger History on Open
    const handleOpenLedger = useCallback(async () => {
        if (!lastSelectedEntityId || !currentUser) return;
        setIsLedgerModalOpen(true);
        setIsLoadingLedger(true);
        try {
            // Fetch full history from server to ensure completeness (beyond 2000 limit)
            const history = await api.getEntityHistory(currentUser.companyId, lastSelectedEntityId, 500);
            setLedgerData(history);
        } catch (error) {
            console.error("Failed to load ledger:", error);
            showToast("Failed to load full ledger history.", "error");
            // Fallback to local filtering
            setLedgerData(transactions.filter(t => t.entityId === lastSelectedEntityId));
        } finally {
            setIsLoadingLedger(false);
        }
    }, [lastSelectedEntityId, currentUser, api, transactions, showToast]);

    const entityList = useMemo(() => {
        const list = lastSelectedEntityType === 'branch' ? branches : agents;
        return list.filter(e => e.isActive);
    }, [lastSelectedEntityType, branches, agents]);

    const selectedEntity = useMemo(() => {
        if (!lastSelectedEntityId) return null;
        const list = lastSelectedEntityType === 'branch' ? branches : agents;
        return list.find(e => e.id === lastSelectedEntityId);
    }, [lastSelectedEntityId, lastSelectedEntityType, branches, agents]);

    const { branchSummary, agentSummary, overallSummary } = useMemo(() => {
        const branchSummary: Record<ServiceType, number> = { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 };
        const agentSummary: Record<ServiceType, number> = { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 };
        const activeBranchIds = new Set(branches.filter(b => b.isActive).map(b => b.id));
        const activeAgentIds = new Set(agents.filter(a => a.isActive).map(a => a.id));
        
        transactions.forEach(tx => {
            // Filter by selected date
            if (tx.date !== selectedDate) return;

            let summaryTarget: Record<ServiceType, number> | null = null;
            if (activeBranchIds.has(tx.entityId)) summaryTarget = branchSummary;
            else if (activeAgentIds.has(tx.entityId)) summaryTarget = agentSummary;
            
            if (summaryTarget) {
                summaryTarget.ria += tx.cashPaidByService.ria?.total || 0;
                summaryTarget.moneyGram += tx.cashPaidByService.moneyGram?.total || 0;
                summaryTarget.westernUnion += tx.cashPaidByService.westernUnion?.total || 0;
                summaryTarget.afro += tx.cashPaidByService.afro?.total || 0;
            }
        });
        const overallSummary: Record<ServiceType, number> = { 
            ria: branchSummary.ria + agentSummary.ria, 
            moneyGram: branchSummary.moneyGram + agentSummary.moneyGram, 
            westernUnion: branchSummary.westernUnion + agentSummary.westernUnion, 
            afro: branchSummary.afro + agentSummary.afro 
        };
        return { branchSummary, agentSummary, overallSummary };
    }, [transactions, branches, agents, selectedDate]);
    
    // Optimized Load Transaction Data (Hybrid: Local + Server Fallback)
    const loadTransactionData = useCallback(async (showLoadingState = true) => {
        if (!lastSelectedEntityId || !selectedDate || !currentUser) return;
        
        // Prevent overwriting if user started typing while this was pending
        if (!showLoadingState && userMadeChange.current) return; 

        setLastFocusedService(null);

        try {
            // 1. Calculate Opening Balance
            let openingBalance: number = 0;
            
            // Try finding previous transaction in LOCAL memory first (Fastest)
            const previousTxs = transactions.filter(t => 
                t.entityId === lastSelectedEntityId && 
                t.date < selectedDate
            );
            previousTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            if (previousTxs.length > 0) {
                openingBalance = previousTxs[0].closingBalance;
            } else {
                // FALLBACK: If not found locally (maybe older than loaded limit), fetch from server
                // This ensures correctness even if the user has 10,000 transactions and only 2000 are loaded.
                const { openingBalance: serverOpening } = await api.getOpeningDataForEntity(
                    currentUser.companyId, 
                    lastSelectedEntityId, 
                    lastSelectedEntityType, 
                    selectedDate
                );
                openingBalance = serverOpening;
            }

            // 2. Calculate Cash Received Locally (Assuming cash outs are loaded for recent dates)
            const cashReceived: number = cashOuts
                .filter(co => co.entityId === lastSelectedEntityId && co.date === selectedDate)
                .reduce<number>((sum, co) => sum + co.amount, 0);

            // 3. Find Existing Transaction for Today (Local Check)
            const foundTx = transactions.find(t => t.entityId === lastSelectedEntityId && t.date === selectedDate);
            const companyId = currentUser.companyId;

            if (foundTx) {
                 setServiceFormulas({
                    ria: foundTx.cashPaidByService.ria.formula, 
                    moneyGram: foundTx.cashPaidByService.moneyGram.formula,
                    westernUnion: foundTx.cashPaidByService.westernUnion.formula, 
                    afro: foundTx.cashPaidByService.afro.formula,
                });
                setSummary({
                    companyId,
                    date: selectedDate, entityId: lastSelectedEntityId, entityType: lastSelectedEntityType,
                    openingBalance: openingBalance, 
                    cashReceived: cashReceived,
                    totalCash: openingBalance + cashReceived,
                    totalCashPaid: foundTx.totalCashPaid,
                    closingBalance: (openingBalance + cashReceived) - foundTx.totalCashPaid,
                });
            } else {
                setServiceFormulas(initialFormulas);
                setSummary({
                    companyId,
                    date: selectedDate, entityId: lastSelectedEntityId, entityType: lastSelectedEntityType,
                    openingBalance: openingBalance, 
                    cashReceived: cashReceived,
                    totalCash: openingBalance + cashReceived, 
                    totalCashPaid: 0,
                    closingBalance: (openingBalance + cashReceived)
                });
            }
        } catch (error) {
            console.error("Failed to compute transaction data", error);
            showToast("Error loading transaction data", "error");
        } finally {
            // Ensure loading state is off immediately
            setIsLoading(false);
            if (showLoadingState) {
                setShouldAutoFocus(true);
            }
        }
    }, [lastSelectedEntityId, lastSelectedEntityType, selectedDate, currentUser, transactions, cashOuts, api, showToast]);

    useEffect(() => {
        // Smart Loading Logic
        const isNavigation = 
            lastSelectedEntityId !== prevEntityIdRef.current || 
            selectedDate !== prevDateRef.current;

        // Update refs
        prevEntityIdRef.current = lastSelectedEntityId;
        prevDateRef.current = selectedDate;

        if (isNavigation) {
            // User explicitly changed page/date. Force reload and reset state.
            initialDataLoaded.current = false;
            userMadeChange.current = false;
            
            // Clear ghost data immediately
            setServiceFormulas(initialFormulas);
            setSummary(prev => ({...prev, openingBalance: 0, cashReceived: 0, totalCash: 0, totalCashPaid: 0, closingBalance: 0}));

            loadTransactionData(true);
            initialDataLoaded.current = true;
        } else {
            // Background refresh or data update
            if (!userMadeChange.current) {
                loadTransactionData(false); 
            }
        }
    }, [loadTransactionData, lastSelectedEntityId, selectedDate]);

    useEffect(() => {
        if (shouldAutoFocus && riaInputRef.current && !isDateLocked) {
            setTimeout(() => {
                riaInputRef.current?.focus();
                riaInputRef.current?.select();
            }, 50);
            setShouldAutoFocus(false);
        }
    }, [shouldAutoFocus, isDateLocked]);

    useEffect(() => {
        const totalCash = summary.openingBalance + summary.cashReceived;
        const closingBalance = totalCash - totalCashPaid;
        if (summary.totalCash !== totalCash || summary.totalCashPaid !== totalCashPaid || summary.closingBalance !== closingBalance) {
            setSummary(prev => ({ ...prev, totalCash, totalCashPaid: totalCashPaid, closingBalance }));
        }
    }, [summary.openingBalance, summary.cashReceived, totalCashPaid, summary.totalCash, summary.closingBalance]);

    const performSave = useCallback(async () => {
        if (!lastSelectedEntityId || !currentUser) return;
        if (isDateLocked) return;

        setGlobalLoading(true);

        const cashPaidByService = {
            ria: { formula: serviceFormulas.ria || '0', total: serviceTotals.ria },
            moneyGram: { formula: serviceFormulas.moneyGram || '0', total: serviceTotals.moneyGram },
            westernUnion: { formula: serviceFormulas.westernUnion || '0', total: serviceTotals.westernUnion },
            afro: { formula: serviceFormulas.afro || '0', total: serviceTotals.afro },
        };
        const txData = { ...summary, totalCashPaid, cashPaidByService };
        
        try {
            const updatedTransaction = await api.saveTransaction(currentUser.companyId, currentUser, txData);
            updateEntityTransactions(updatedTransaction);
        } catch (e) {
            console.error("Save failed", e);
            showToast("Failed to save transaction.", "error");
        } finally {
            setGlobalLoading(false);
        }
    }, [lastSelectedEntityId, currentUser, serviceFormulas, serviceTotals, summary, totalCashPaid, updateEntityTransactions, showToast, setGlobalLoading, api, isDateLocked]);

    const handleEnterSave = useCallback(() => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }
        if (userMadeChange.current) {
            const isMeaningfulChange = totalCashPaid > 0 || !!existingTx;
            if (isMeaningfulChange) {
                userMadeChange.current = false;
                performSave();
            }
        }
    }, [performSave, totalCashPaid, existingTx]);

    useEffect(() => {
        if (!initialDataLoaded.current || !userMadeChange.current) return;
        if (isDateLocked) return;

        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        
        autoSaveTimeoutRef.current = setTimeout(() => {
            const isMeaningfulChange = totalCashPaid > 0 || !!existingTx;
            if (isMeaningfulChange) {
                userMadeChange.current = false;
                performSave();
            }
        }, 1500);

        return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); };
    }, [serviceFormulas, totalCashPaid, existingTx, performSave, isDateLocked]);
    
    const broadcastInput = (service: ServiceType, value: string) => {
        if (!currentUser || !lastSelectedEntityId || !selectedDate || !subscriberIdRef.current) return;
        
        const now = Date.now();
        const lastSent = throttleRef.current[service] || 0;
        
        // Throttle to ~10 updates per second max
        if (now - lastSent > 100) {
            const channel = `presence-transactions-${lastSelectedEntityId}-${selectedDate}`;
            const payload: PresenceInfo = {
                sessionId: subscriberIdRef.current,
                userId: currentUser.id,
                userName: currentUser.name,
                entityId: lastSelectedEntityId,
                date: selectedDate,
                field: service,
                timestamp: now,
                color: stringToColor(currentUser.id),
                value: value // Send the actual data
            };
            api.realtime.broadcast(channel, payload, subscriberIdRef.current);
            throttleRef.current[service] = now;
        }
    };

    const handleFormulaChange = (service: ServiceType, value: string) => {
        if (isDateLocked) return;
        userMadeChange.current = true;
        setServiceFormulas(prev => ({ ...prev, [service]: value }));
        broadcastInput(service, value); // Broadcast changes
    };

    const handleViewHistory = (service: ServiceType | null = null) => {
        const targetService = service || lastFocusedService;
        setHistoryFilterService(targetService);
        setViewingHistory(existingTx || null);
        setIsHistoryModalOpen(true);
    };

    const hasHistoryForService = useCallback((service: ServiceType) => {
        if (!existingTx?.editHistory) return false;
        return existingTx.editHistory.some(log => {
            const oldState = log.previousState as Partial<Transaction>, newState = log.newState as Partial<Transaction>;
            return oldState.cashPaidByService?.[service]?.formula !== newState.cashPaidByService?.[service]?.formula;
        });
    }, [existingTx]);
    
    const renderChangeDetail = (log: EditLog, filterService: ServiceType | null) => {
        const oldState = log.previousState as Partial<Transaction>, newState = log.newState as Partial<Transaction>;
        const changes: React.ReactNode[] = [];
        if (oldState.cashPaidByService && newState.cashPaidByService) {
            serviceTypes.forEach(service => {
                if (filterService && service !== filterService) return;
                const oldF = oldState.cashPaidByService![service]?.formula || '', newF = newState.cashPaidByService![service]?.formula || '';
                if (oldF !== newF) {
                    changes.push(<li key={service} className="text-sm"><span className="font-semibold">{serviceNames[service]}:</span> formula from <span className="font-mono text-red-500 line-through">"{oldF||'empty'}"</span> to <span className="font-mono text-green-500">"{newF||'empty'}"</span></li>);
                }
            });
        }
        return changes.length > 0 ? <ul className="list-disc list-inside space-y-1">{changes}</ul> : null;
    };

    const filteredHistory = viewingHistory?.editHistory?.filter(log => {
        if (!historyFilterService) return true;
        const oldState = log.previousState as Partial<Transaction>, newState = log.newState as Partial<Transaction>;
        return oldState.cashPaidByService?.[historyFilterService]?.formula !== newState.cashPaidByService?.[historyFilterService]?.formula;
    }) || [];

    const handleCycleEntity = (direction: 'next' | 'prev') => {
        if (entityList.length === 0) return;
        const currentIndex = entityList.findIndex(e => e.id === lastSelectedEntityId);
        let nextIndex;
        if (currentIndex === -1) nextIndex = direction === 'next' ? 0 : entityList.length - 1;
        else nextIndex = direction === 'next' ? (currentIndex + 1) % entityList.length : (currentIndex - 1 + entityList.length) % entityList.length;
        // Ref will detect the ID change next render and trigger navigation load
        setLastSelectedEntityId(entityList[nextIndex].id);
    };
    
    // --- Live Presence Logic ---
    useEffect(() => {
        if (!lastSelectedEntityId || !selectedDate) {
            setPresence(null);
            return;
        }

        const channel = `presence-transactions-${lastSelectedEntityId}-${selectedDate}`;

        const sub = api.realtime.subscribe(channel, (payload: PresenceInfo | null) => {
            if (payload && (Date.now() - payload.timestamp < 5000)) {
                // Ignore own updates to prevent jitter
                if (payload.userId !== currentUser?.id) {
                    setPresence(payload);
                    
                    // NEW: Update local state if remote user sent a value
                    if (payload.value !== undefined && payload.field && payload.entityId === lastSelectedEntityId && payload.date === selectedDate) {
                         setServiceFormulas(prev => {
                             // Only update if different to avoid unnecessary renders
                             if (prev[payload.field] !== payload.value) {
                                 return { ...prev, [payload.field]: payload.value! };
                             }
                             return prev;
                         });
                    }
                }
            } else {
                setPresence(null);
            }
        });
        
        subscriberIdRef.current = sub.subscriberId;

        const intervalId = setInterval(() => {
            setPresence(currentPresence => {
                if (currentPresence && (Date.now() - currentPresence.timestamp > 5000)) {
                    return null;
                }
                return currentPresence;
            });
        }, 2500);

        return () => {
            sub.unsubscribe();
            clearInterval(intervalId);
            if (subscriberIdRef.current) {
                api.realtime.broadcast(channel, null, subscriberIdRef.current);
            }
            subscriberIdRef.current = null;
        };
    }, [lastSelectedEntityId, selectedDate, api, currentUser]);
    
    const handleFormulaFocus = (service: ServiceType) => {
        if (isDateLocked) return;
        setLastFocusedService(service);
        if (!currentUser || !lastSelectedEntityId || !selectedDate || !subscriberIdRef.current) return;
        
        const channel = `presence-transactions-${lastSelectedEntityId}-${selectedDate}`;
        const myPresence: PresenceInfo = {
            sessionId: subscriberIdRef.current,
            userId: currentUser.id,
            userName: currentUser.name,
            entityId: lastSelectedEntityId,
            date: selectedDate,
            field: service,
            timestamp: Date.now(),
            color: stringToColor(currentUser.id)
        };
        
        // Broadcast immediately
        api.realtime.broadcast(channel, myPresence, subscriberIdRef.current);

        // Start Heartbeat to keep presence alive while focused
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
             if (subscriberIdRef.current) {
                 const currentPresence = { ...myPresence, timestamp: Date.now() };
                 api.realtime.broadcast(channel, currentPresence, subscriberIdRef.current);
             }
        }, 4000); // Send every 4s (within 5s receiver timeout)
    };

    const handleFormulaBlur = () => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (!lastSelectedEntityId || !selectedDate || !subscriberIdRef.current) return;
        const channel = `presence-transactions-${lastSelectedEntityId}-${selectedDate}`;
        api.realtime.broadcast(channel, null, subscriberIdRef.current);
    };
    
    // Cleanup heartbeat on unmount
    useEffect(() => {
        return () => {
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        };
    }, []);


    // --- CSV Import & Export ---
    const handleDownloadTemplate = () => {
        const template = `date,entity_name,entity_type,ria_formula,moneygram_formula,westernunion_formula,afro_formula\n2024-01-15,"Main Branch",branch,"100+250","50.5","",""\n2024-01-15,"John Doe",agent,"","","300+120","10"`;
        const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "fintrack_transactions_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImportFile(file);
            setParsedData(null);
            setImportErrors([]);
            window.Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const requiredHeaders = ['date', 'entity_name', 'entity_type', 'ria_formula', 'moneygram_formula', 'westernunion_formula', 'afro_formula'];
                    const fileHeaders = results.meta.fields || [];
                    const missingHeaders = requiredHeaders.filter(h => !fileHeaders.includes(h));

                    if (missingHeaders.length > 0) {
                        setImportErrors([`CSV is missing required headers: ${missingHeaders.join(', ')}`]);
                        setParsedData(null);
                    } else {
                        setParsedData(results.data as any[]);
                    }
                },
                error: (error: any) => {
                    setImportErrors([`CSV parsing error: ${error.message}`]);
                }
            });
        }
    };

    const handleImport = async () => {
        if (!parsedData || !currentUser) return;
        setGlobalLoading(true);
        try {
            const result = await api.bulkImportTransactions(currentUser.companyId, currentUser, parsedData);
            if (result.errors && result.errors.length > 0) {
                setImportErrors(result.errors);
                showToast(`Imported ${result.importedCount} records with ${result.errorCount} errors.`, 'error');
            } else {
                showToast(`Successfully imported ${result.importedCount} records!`, 'success');
                setIsImportModalOpen(false);
                await fetchTransactions();
            }
        } catch (error: any) {
            showToast(error.message || 'Import failed.', 'error');
        } finally {
            setGlobalLoading(false);
        }
    };
    
    const handleExportLedgerCSV = () => {
        if (!window.Papa || !ledgerData.length) return;
        
        const dataToExport = ledgerData.map(tx => ({
            Date: new Date(tx.date).toLocaleDateString(),
            Opening: tx.openingBalance,
            "Cash In": tx.cashReceived,
            "Total Cash": tx.totalCash,
            "Total Paid": tx.totalCashPaid,
            "Ria": tx.cashPaidByService.ria?.total || 0,
            "MoneyGram": tx.cashPaidByService.moneyGram?.total || 0,
            "Western Union": tx.cashPaidByService.westernUnion?.total || 0,
            "Afro": tx.cashPaidByService.afro?.total || 0,
            Closing: tx.closingBalance
        }));

        const csv = window.Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const entityName = selectedEntity?.name.replace(/\s+/g, '_') || 'ledger';
        link.setAttribute("href", url);
        link.setAttribute("download", `${entityName}_ledger.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportLedgerExcel = () => {
        if (!window.XLSX || !ledgerData.length) {
            showToast("Excel export library not loaded or no data.", "error");
            return;
        }
        const data = ledgerData.map(tx => ({
            Date: new Date(tx.date).toLocaleDateString(),
            Opening: tx.openingBalance,
            "Cash In": tx.cashReceived,
            "Total Cash": tx.totalCash,
            "Total Paid": tx.totalCashPaid,
            "Ria": tx.cashPaidByService.ria?.total || 0,
            "MoneyGram": tx.cashPaidByService.moneyGram?.total || 0,
            "Western Union": tx.cashPaidByService.westernUnion?.total || 0,
            "Afro": tx.cashPaidByService.afro?.total || 0,
            Closing: tx.closingBalance
        }));

        const ws = window.XLSX.utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Ledger");
        const entityName = selectedEntity?.name.replace(/\s+/g, '_') || 'ledger';
        window.XLSX.writeFile(wb, `${entityName}_ledger.xlsx`);
    };

    // --- Receipt Printing ---
    const handlePrintDailyReceipt = () => {
        if (!selectedEntity) return;
        setReceiptData({
            title: 'Daily Closing Receipt',
            date: selectedDate,
            entityName: selectedEntity.name,
            details: [
                { label: 'Opening Balance', value: formatCurrency(summary.openingBalance) },
                { label: 'Cash Received', value: formatCurrency(summary.cashReceived) },
                { label: 'Total Cash Paid', value: formatCurrency(summary.totalCashPaid) },
                { label: 'Closing Balance', value: formatCurrency(summary.closingBalance), bold: true }
            ],
            note: 'Please verify all cash counts.'
        });
    };

    useEffect(() => {
        if (receiptData) {
            const handleAfterPrint = () => {
                document.body.classList.remove('is-printing');
                setReceiptData(null);
                window.removeEventListener('afterprint', handleAfterPrint);
            };

            window.addEventListener('afterprint', handleAfterPrint);
            document.body.classList.add('is-printing');

            const timer = setTimeout(() => {
                window.print();
            }, 300);

            return () => {
                clearTimeout(timer);
                if (document.body.classList.contains('is-printing')) {
                    document.body.classList.remove('is-printing');
                }
                window.removeEventListener('afterprint', handleAfterPrint);
            };
        }
    }, [receiptData]);


    return (
        <div className="space-y-6">
             {/* Receipt Print Container */}
            {settings && receiptData && (
                <div className="print-only-container">
                    <ReceiptView data={receiptData} settings={settings} />
                </div>
            )}

            <div className="screen-only space-y-6">
                <Card>
                    <h2 className="text-2xl font-bold mb-4">New Transaction</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); }} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" />
                        <select value={lastSelectedEntityType} onChange={e => { setLastSelectedEntityType(e.target.value as any); setLastSelectedEntityId(''); }} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                            <option value="agent">Agent</option>
                            <option value="branch">Branch</option>
                        </select>
                        <div className="md:col-span-2 flex items-center gap-2">
                            <button onClick={() => handleCycleEntity('prev')} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50" title="Previous Entity" aria-label="Go to previous entity" disabled={entityList.length <= 1}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div className="flex-grow"><SearchableSelect value={lastSelectedEntityId} onChange={id => { setLastSelectedEntityId(id); }} options={entityList} placeholder={`Search & select active ${lastSelectedEntityType}`} /></div>
                            <button onClick={() => handleCycleEntity('next')} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50" title="Next Entity" aria-label="Go to next entity" disabled={entityList.length <= 1}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                            {currentUser?.role !== 'Clerk' &&
                                <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 p-2 border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600" title="Import from CSV">
                                    <UploadIcon className="w-5 h-5" />
                                </button>
                            }
                        </div>
                    </div>
                </Card>

                {lastSelectedEntityId && (
                    <Card>
                        {/* Removed opacity/pointer-events logic to keep fields active */}
                        <div className="space-y-6">
                            {selectedEntity && (
                                <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
                                    <div className="flex-1 text-center">
                                        <div className="flex items-center justify-center gap-3">
                                            <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{selectedEntity.name}</h2>
                                            {/* Show loading spinner here instead of disabling the UI */}
                                            {isLoading && <LoadingSpinnerIcon className="w-5 h-5 animate-spin text-slate-400" />}
                                            {isDateLocked && <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1"><LockClosedIcon className="w-3 h-3" /> Locked</span>}
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{selectedEntity.location}</p>
                                    </div>
                                    <button 
                                        onClick={handleOpenLedger}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors text-slate-700 dark:text-slate-300"
                                    >
                                        <EyeIcon className="w-4 h-4" />
                                        View Ledger
                                    </button>
                                </div>
                            )}
                            <SummaryCard data={summary} onPrint={handlePrintDailyReceipt} />
                            
                            {isDateLocked && (
                                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-3 rounded-md text-center text-sm flex items-center justify-center gap-2">
                                    <LockClosedIcon className="w-4 h-4" />
                                    <span>This date is locked. Transactions cannot be edited.</span>
                                </div>
                            )}
                            
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Cash Paid by Service</h3>
                                    {existingTx && (<button onClick={() => handleViewHistory(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline" title="View transaction history"><HistoryIcon className="w-4 h-4" /><span>{lastFocusedService ? `${serviceNames[lastFocusedService]} History` : 'History'}</span></button>)}
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {serviceTypes.map(service => {
                                        const activeEditor = presence && presence.entityId === lastSelectedEntityId && presence.date === selectedDate && presence.field === service && presence.userId !== currentUser?.id 
                                            ? { name: presence.userName, color: presence.color || '#f59e0b' } 
                                            : undefined;

                                        return (
                                            <FormulaInput 
                                                key={service} 
                                                ref={service === 'ria' ? riaInputRef : undefined} 
                                                service={service}
                                                formula={serviceFormulas[service]} 
                                                onFormulaChange={handleFormulaChange}
                                                formatNumber={formatNumber} 
                                                onViewHistory={() => handleViewHistory(service)}
                                                hasHistory={hasHistoryForService(service)} 
                                                onInputFocus={handleFormulaFocus}
                                                onInputBlur={handleFormulaBlur}
                                                onEnterSave={handleEnterSave}
                                                isDisabled={isDateLocked}
                                                activeEditor={activeEditor}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <SummaryListCard title={`Branches Total (${new Date(selectedDate).toLocaleDateString()})`} data={branchSummary} />
                    <SummaryListCard title={`Agents Total (${new Date(selectedDate).toLocaleDateString()})`} data={agentSummary} />
                    <SummaryListCard title="Company Overall Total" data={overallSummary} isOverall={true} />
                </div>

                {/* Ledger Modal */}
                <Modal isOpen={isLedgerModalOpen} onClose={() => setIsLedgerModalOpen(false)} title={`${selectedEntity?.name || 'Entity'} - Full Ledger`} size="lg">
                    <div className="flex flex-col h-[60vh]">
                        <div className="flex justify-end gap-2 mb-4">
                            <button onClick={handleExportLedgerCSV} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                                <DownloadIcon className="w-4 h-4" /> Export to CSV
                            </button>
                            <button onClick={handleExportLedgerExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
                                <FileExcelIcon className="w-4 h-4" /> Export to Excel
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto border rounded-lg border-slate-200 dark:border-slate-700">
                            {isLoadingLedger ? (
                                <div className="flex justify-center items-center h-40">
                                    <LoadingSpinnerIcon className="w-8 h-8 animate-spin text-primary-600" />
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0">
                                        <tr>
                                            <th className="p-2 text-slate-600 dark:text-slate-300 font-semibold">Date</th>
                                            <th className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">Opening</th>
                                            <th className="p-2 text-right text-green-600 font-semibold">Cash In</th>
                                            <th className="p-2 text-right text-red-600 font-semibold">Cash Out</th>
                                            <th className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">Closing</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {ledgerData.length > 0 ? (
                                            ledgerData.map(tx => (
                                                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                    <td className="p-2 text-slate-800 dark:text-slate-200">{new Date(tx.date).toLocaleDateString()}</td>
                                                    <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-400">{formatCurrency(tx.openingBalance)}</td>
                                                    <td className="p-2 text-right font-mono text-green-600">+{formatCurrency(tx.cashReceived)}</td>
                                                    <td className="p-2 text-right font-mono text-red-500">-{formatCurrency(tx.totalCashPaid)}</td>
                                                    <td className="p-2 text-right font-mono font-bold text-primary-600">{formatCurrency(tx.closingBalance)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="p-4 text-center text-slate-500">No transactions found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </Modal>

                <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title={historyFilterService ? `${serviceNames[historyFilterService]} History` : "Transaction History"} size="lg">
                    {viewingHistory ? (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                                <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Entry Created</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">By <span className="font-semibold text-slate-700 dark:text-slate-200">{viewingHistory.createdByName}</span> on <span className="font-semibold text-slate-700 dark:text-slate-200">{new Date(viewingHistory.createdAt).toLocaleString()}</span></p>
                            </div>
                            {filteredHistory.length > 0 ? (<>
                                <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 pt-2">Edit History</h4>
                                {filteredHistory.map((log, index) => (
                                    <div key={index} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                        <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">{log.userName}</span> made changes on <span className="font-semibold">{new Date(log.timestamp).toLocaleString()}</span></p>
                                        <div className="mt-2 pl-2 border-l-2 border-slate-300 dark:border-slate-500">
                                            {renderChangeDetail(log, historyFilterService)}
                                        </div>
                                    </div>
                                ))}
                            </>) : (<p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-4">No subsequent edits found for this view.</p>)}
                        </div>
                    ) : (<p>No history available.</p>)}
                </Modal>

                <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Transactions from CSV" size="lg">
                    <div className="space-y-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg">
                            <h4 className="font-semibold text-blue-800 dark:text-blue-200">Instructions</h4>
                            <ol className="list-decimal list-inside text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                                <li>Download the template CSV file to see the required format.</li>
                                <li>Fill in your transaction data. `entity_name` must match an existing branch or agent exactly.</li>
                                <li>Upload the completed file. The system will preview the number of records.</li>
                                <li>Click "Import" to add the data to your system.</li>
                            </ol>
                            <button onClick={handleDownloadTemplate} className="mt-3 text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
                                <DownloadIcon className="w-4 h-4" /> Download Template
                            </button>
                        </div>
                        
                        <div>
                            <label htmlFor="csv-upload" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Upload CSV File</label>
                            <input 
                                id="csv-upload"
                                type="file" 
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/50 dark:file:text-primary-300 dark:hover:file:bg-primary-900" 
                            />
                        </div>

                        {importFile && (
                            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <p><strong>File:</strong> {importFile.name}</p>
                                {parsedData && <p><strong>Records Found:</strong> {parsedData.length}</p>}
                            </div>
                        )}

                        {importErrors.length > 0 && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/50 rounded-lg max-h-40 overflow-y-auto">
                                <h5 className="font-semibold text-red-800 dark:text-red-200">Import Errors:</h5>
                                <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 mt-1">
                                    {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                            </div>
                        )}
                        
                        <button 
                            onClick={handleImport}
                            disabled={!parsedData || importErrors.length > 0}
                            className="w-full bg-primary-600 text-white p-2.5 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed"
                        >
                            Import {parsedData ? `${parsedData.length} Records` : ''}
                        </button>
                    </div>
                </Modal>
            </div>
        </div>
    );
};

export default TransactionsPage;
