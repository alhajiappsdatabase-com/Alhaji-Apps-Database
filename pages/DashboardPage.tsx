
import React, { useMemo, FC, useState, useEffect, useRef, useCallback } from 'react';
// Fix: Import useAppContext from types.ts to avoid circular dependency with App.tsx
import { useAppContext } from '../types';
import { Card, SkeletonLoader } from '../components/ui';
import { PlusIcon, CloseIcon, LoadingSpinnerIcon } from '../components/icons';

const getISODateString = (date: Date) => date.toISOString().split('T')[0];

type DashboardWidget = 'keyStats' | 'dormantAccounts' | 'topAgents';
type WidgetConfig = Record<DashboardWidget, { visible: boolean; name: string }>;

const WIDGETS_CONFIG_KEY = 'finTrackProDashboardWidgets';

const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  keyStats: { visible: true, name: 'Key Statistics' },
  dormantAccounts: { visible: true, name: 'Dormant Accounts' },
  topAgents: { visible: true, name: 'Top Paying Agents' }
};

const DashboardPage: FC = () => {
    const { 
        transactions, cashIns, cashOuts, branches, agents, incomes, expenses, formatCurrency, settings,
        fetchTransactions, fetchCashFlowData, fetchManagementData, fetchPettyCashData, navigateTo
    } = useAppContext();
    
    // SINGLE DATE SELECTION STATE
    const [selectedDate, setSelectedDate] = useState(getISODateString(new Date()));
    
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [isCustomizing, setIsCustomizing] = useState(false);
    const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
    const addWidgetButtonRef = useRef<HTMLDivElement>(null);

    const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>(() => {
        try {
            const savedConfig = localStorage.getItem(WIDGETS_CONFIG_KEY);
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                const mergedConfig = { ...DEFAULT_WIDGET_CONFIG };
                for (const key in mergedConfig) {
                    if (parsed[key] !== undefined) {
                        mergedConfig[key as DashboardWidget].visible = parsed[key].visible;
                    }
                }
                return mergedConfig;
            }
        } catch (e) {
            console.error("Failed to parse widget config from localStorage", e);
        }
        return DEFAULT_WIDGET_CONFIG;
    });

    const isNewCompany = useMemo(() => branches.length === 0 && agents.length === 0 && transactions.length === 0, [branches, agents, transactions]);
    
    const loadAllData = useCallback(async (silent = false) => {
         return Promise.all([
            fetchTransactions(),
            fetchCashFlowData(),
            fetchManagementData(),
            fetchPettyCashData()
        ]);
    }, [fetchTransactions, fetchCashFlowData, fetchManagementData, fetchPettyCashData]);

    // Optimization: Smart Stale-While-Revalidate Strategy
    useEffect(() => {
        const hasData = transactions.length > 0 || branches.length > 0 || agents.length > 0;
        
        if (!hasData) {
            setIsLoading(true);
            loadAllData().finally(() => {
                setIsLoading(false);
            });
        } else {
            loadAllData(true);
        }
    }, []); 
    
    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await loadAllData();
        setIsRefreshing(false);
    };

    useEffect(() => {
        localStorage.setItem(WIDGETS_CONFIG_KEY, JSON.stringify(widgetConfig));
    }, [widgetConfig]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addWidgetButtonRef.current && !addWidgetButtonRef.current.contains(event.target as Node)) {
                setIsAddWidgetOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleWidgetVisibilityChange = (widgetId: DashboardWidget, visible: boolean) => {
        setWidgetConfig(prev => ({
            ...prev,
            [widgetId]: { ...prev[widgetId], visible }
        }));
    };

    const hiddenWidgets = useMemo(() => {
        return (Object.keys(widgetConfig) as DashboardWidget[]).filter(key => !widgetConfig[key].visible);
    }, [widgetConfig]);

    const activeBranches = useMemo(() => branches.filter(b => b.isActive), [branches]);
    const activeAgents = useMemo(() => agents.filter(a => a.isActive), [agents]);
    const activeEntityIds = useMemo(() => new Set([...activeBranches.map(b => b.id), ...activeAgents.map(a => a.id)]), [activeBranches, activeAgents]);
    
    // --- Optimized Stats Logic (Single Pass) ---
    const stats = useMemo(() => {
        // Initialize counters
        let openingBalance = 0;
        let totalCashPaid = 0;
        let closingBalance = 0;
        
        let totalNonAfroPaymentBranches = 0;
        let totalAfroPaymentBranches = 0;
        let totalNonAfroPaymentAgents = 0;
        let totalAfroPaymentAgents = 0;
        
        const entitySnapshots: Record<string, { date: string, closingBalance: number }> = {};
        const entities = [...activeBranches, ...activeAgents];
        
        // Initialize with initial balances
        entities.forEach(e => {
            entitySnapshots[e.id] = { date: '0000-00-00', closingBalance: e.initialBalance || 0 };
        });

        // Single pass through transactions to update snapshots and calculate today's totals
        for (const tx of transactions) {
            // Skip inactive entities
            if (!activeEntityIds.has(tx.entityId)) continue;

            if (tx.date === selectedDate) {
                totalCashPaid += tx.totalCashPaid;

                // Calculate breakdown
                const afro = tx.cashPaidByService.afro?.total || 0;
                const nonAfro = tx.totalCashPaid - afro;

                if (tx.entityType === 'branch') {
                    totalAfroPaymentBranches += afro;
                    totalNonAfroPaymentBranches += nonAfro;
                } else if (tx.entityType === 'agent') {
                    totalAfroPaymentAgents += afro;
                    totalNonAfroPaymentAgents += nonAfro;
                }
            }
        }
        
        const closingBalances: Record<string, number> = {};
        const openingBalances: Record<string, number> = {};
        
        // Fill defaults
        entities.forEach(e => {
            closingBalances[e.id] = e.initialBalance || 0;
            openingBalances[e.id] = e.initialBalance || 0;
        });

        const foundClosing = new Set<string>();
        const foundOpening = new Set<string>();

        for (const tx of transactions) {
            if (!activeEntityIds.has(tx.entityId)) continue;
            
            // Check for Closing Balance Snapshot (<= selectedDate)
            if (tx.date <= selectedDate && !foundClosing.has(tx.entityId)) {
                closingBalances[tx.entityId] = tx.closingBalance;
                foundClosing.add(tx.entityId);
            }

            // Check for Opening Balance Snapshot (< selectedDate)
            if (tx.date < selectedDate && !foundOpening.has(tx.entityId)) {
                openingBalances[tx.entityId] = tx.closingBalance;
                foundOpening.add(tx.entityId);
            }
        }

        openingBalance = Object.values(openingBalances).reduce((a, b) => a + b, 0);
        closingBalance = Object.values(closingBalances).reduce((a, b) => a + b, 0);

        // 2. Calculate Cash Flows (In/Out/Expenses) ON selectedDate
        const cashInsOnDay = cashIns.filter(ci => ci.date === selectedDate);
        const cashOutsOnDay = cashOuts.filter(co => co.date === selectedDate);
        const incomesOnDay = incomes.filter(i => i.date === selectedDate);
        const expensesOnDay = expenses.filter(e => e.date === selectedDate);

        const totalCapitalIn = cashInsOnDay.reduce((sum, ci) => sum + ci.amount, 0);
        const totalDistributed = cashOutsOnDay.reduce((sum, co) => sum + co.amount, 0);
        const totalPettyExpense = expensesOnDay.reduce((sum, e) => sum + e.amount, 0);
        const totalPettyIncome = incomesOnDay.reduce((sum, i) => sum + i.amount, 0);
        
        const totalDisbursedToBranches = cashOutsOnDay
            .filter(co => co.entityType === 'branch')
            .reduce((sum, co) => sum + co.amount, 0);
        
        const totalDisbursedToAgents = cashOutsOnDay
            .filter(co => co.entityType === 'agent')
            .reduce((sum, co) => sum + co.amount, 0);

        // 3. Calculate Capital Opening and Closing Balance
        const priorCashIn = cashIns
            .filter(ci => ci.date < selectedDate)
            .reduce((sum, ci) => sum + ci.amount, 0);
        const priorCashOut = cashOuts
            .filter(co => co.date < selectedDate)
            .reduce((sum, co) => sum + co.amount, 0);
        
        const capitalOpeningBalance = priorCashIn - priorCashOut;
        const totalCapitalOutToday = totalDistributed;
        const capitalClosingBalance = capitalOpeningBalance + totalCapitalIn - totalCapitalOutToday;

        // 4. Calculate Aggregate Entity Payments
        const totalNonAfroPaymentEntities = totalNonAfroPaymentBranches + totalNonAfroPaymentAgents;
        const totalAfroPaymentEntities = totalAfroPaymentBranches + totalAfroPaymentAgents;

        return { 
            openingBalance, 
            totalCashPaid, 
            closingBalance, 
            totalDisbursedToBranches, 
            totalDisbursedToAgents, 
            totalCapitalIn, 
            totalPettyIncome, 
            totalPettyExpense,
            capitalOpeningBalance,
            capitalClosingBalance,
            totalNonAfroPaymentEntities,
            totalAfroPaymentEntities
        };
    }, [transactions, cashIns, cashOuts, incomes, expenses, activeEntityIds, activeBranches, activeAgents, selectedDate]);
    
    const topPayingAgents = useMemo(() => {
        const agentPayments: { [agentId: string]: number } = {};
        transactions.filter(tx => tx.entityType === 'agent' && tx.date === selectedDate && activeEntityIds.has(tx.entityId)).forEach(tx => {
            if (!agentPayments[tx.entityId]) { agentPayments[tx.entityId] = 0; }
            agentPayments[tx.entityId] += tx.totalCashPaid;
        });
        return Object.entries(agentPayments).map(([agentId, totalPaid]) => ({ agentId, agentName: activeAgents.find(a => a.id === agentId)?.name || 'Unknown Agent', totalPaid, })).sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5);
    }, [transactions, activeAgents, selectedDate, activeEntityIds]);

    const dormantEntities = useMemo(() => {
        if (!settings) return [];
        const threshold = settings.dormancyThresholdDays || 7;
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const thresholdDate = new Date(today); thresholdDate.setUTCDate(today.getUTCDate() - threshold);
        const activeEntities = [...activeBranches.map(b => ({ ...b, entityType: 'Branch' as const })), ...activeAgents.map(a => ({ ...a, entityType: 'Agent' as const }))];
        return activeEntities.map(entity => {
            const lastPaymentTx = transactions.filter(tx => tx.entityId === entity.id && tx.totalCashPaid > 0).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if (!lastPaymentTx) return { ...entity, lastPaymentDate: 'Never' };
            const lastPaymentDate = new Date(lastPaymentTx.date);
            if (lastPaymentDate < thresholdDate) return { ...entity, lastPaymentDate: lastPaymentTx.date };
            return null;
        }).filter((entity): entity is NonNullable<typeof entity> => entity !== null);
    }, [settings, activeBranches, activeAgents, transactions]);
    
    // Navigation Handlers
    const handlePrevDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        setSelectedDate(getISODateString(d));
    };

    const handleNextDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        setSelectedDate(getISODateString(d));
    };
    
    const setToday = () => setSelectedDate(getISODateString(new Date()));
    
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={handlePrevDay} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <div>
                            <label htmlFor="selected-date" className="sr-only">Selected Date</label>
                            <input 
                                id="selected-date" 
                                type="date" 
                                value={selectedDate} 
                                onChange={e => setSelectedDate(e.target.value)} 
                                className="p-2 border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-medium shadow-sm focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <button onClick={handleNextDay} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <button onClick={setToday} className="ml-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600">
                            Today
                        </button>
                    </div>

                     <div className="flex items-center gap-2">
                        <button onClick={handleManualRefresh} disabled={isRefreshing} className="p-2 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors" title="Refresh Data">
                             <LoadingSpinnerIcon className={`w-5 h-5 text-slate-600 dark:text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        
                        {isCustomizing && hiddenWidgets.length > 0 && (
                            <div className="relative" ref={addWidgetButtonRef}>
                                <button onClick={() => setIsAddWidgetOpen(prev => !prev)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700">
                                    <PlusIcon className="w-4 h-4" /> Add Widget
                                </button>
                                {isAddWidgetOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg border dark:border-slate-700 z-10 animate-fade-in-scale-up" style={{transformOrigin: 'top right'}}>
                                        <ul className="p-1">
                                            {hiddenWidgets.map(widgetId => (
                                                <li key={widgetId}>
                                                    <button onClick={() => { handleWidgetVisibilityChange(widgetId, true); setIsAddWidgetOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                                        {widgetConfig[widgetId].name}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={() => setIsCustomizing(prev => !prev)} className={`px-4 py-1.5 text-sm rounded-md font-semibold transition-colors ${isCustomizing ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'}`}>
                            {isCustomizing ? 'Done' : 'Customize'}
                        </button>
                    </div>
                </div>
            </Card>

            {widgetConfig.keyStats.visible && (
                <div className={`relative ${isCustomizing ? 'ring-2 ring-dashed ring-primary-500 rounded-lg p-2 pt-8' : ''}`}>
                    {isCustomizing && (
                         <button onClick={() => handleWidgetVisibilityChange('keyStats', false)} title="Hide Widget" aria-label="Hide Key Statistics widget" className="absolute top-1 right-1 p-1 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-500 hover:text-white transition-colors">
                            <CloseIcon className="w-3 h-3"/>
                        </button>
                    )}
                    {(isNewCompany && !isLoading) ? (
                         <Card className="text-center">
                            <h3 className="text-xl font-bold">Welcome to FinTrack Pro! 🚀</h3>
                            <p className="mt-2 text-slate-600 dark:text-slate-300">
                                Your dashboard is ready. To see your financial statistics, start by adding a Branch or Agent.
                            </p>
                            <p className="mt-2 text-slate-500 dark:text-slate-400">
                                Navigate to the <strong className="text-primary-600">Management</strong> page from the sidebar to create your first entity.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {isLoading ? (
                               <>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                                <Card><SkeletonLoader className="h-5 w-2/3 mb-2" /><SkeletonLoader className="h-8 w-1/2" /></Card>
                               </>
                            ) : (
                               <>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Capital Opening</h3><p className="text-3xl font-bold text-primary-600">{formatCurrency(stats.capitalOpeningBalance)}</p></Card>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Capital Injected (Today)</h3><p className="text-3xl font-bold text-green-500">{formatCurrency(stats.totalCapitalIn)}</p></Card>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Total Cash Paid (Today)</h3><p className="text-3xl font-bold text-red-500">{formatCurrency(stats.totalCashPaid)}</p></Card>
                                
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Disbursed to Branches (Today)</h3><p className="text-3xl font-bold text-cyan-600">{formatCurrency(stats.totalDisbursedToBranches)}</p></Card>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Disbursed to Agents (Today)</h3><p className="text-3xl font-bold text-purple-600">{formatCurrency(stats.totalDisbursedToAgents)}</p></Card>
                                
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Entity Non-Afro Payment</h3><p className="text-3xl font-bold text-blue-500">{formatCurrency(stats.totalNonAfroPaymentEntities)}</p></Card>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Entity Afro Payment</h3><p className="text-3xl font-bold text-pink-600">{formatCurrency(stats.totalAfroPaymentEntities)}</p></Card>
                                
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Petty Expenses (Today)</h3><p className="text-3xl font-bold text-orange-600">{formatCurrency(stats.totalPettyExpense)}</p></Card>
                                <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Capital Closing</h3><p className={`text-3xl font-bold ${stats.capitalClosingBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{formatCurrency(stats.capitalClosingBalance)}</p></Card>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {widgetConfig.dormantAccounts.visible && (
                    <div className={`relative ${isCustomizing ? 'ring-2 ring-dashed ring-primary-500 rounded-lg p-2 pt-8' : ''}`}>
                        {isCustomizing && (
                            <button onClick={() => handleWidgetVisibilityChange('dormantAccounts', false)} title="Hide Widget" aria-label="Hide Dormant Accounts widget" className="absolute top-1 right-1 p-1 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-500 hover:text-white transition-colors">
                                <CloseIcon className="w-3 h-3"/>
                            </button>
                        )}
                        <Card>
                            <h3 className="text-xl font-bold mb-4">Dormant Accounts ({isLoading ? '...' : dormantEntities.length})</h3>
                             <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {isLoading ? (
                                    <div className="space-y-3">
                                        {[...Array(3)].map((_, i) => <SkeletonLoader key={i} className="h-16 w-full" />)}
                                    </div>
                                ) : dormantEntities.length > 0 ? (
                                    dormantEntities.map((entity, index) => (
                                        <div key={entity.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border-l-4 border-red-500 animate-pulse-border stagger-child" style={{ animationDelay: `${index * 100}ms` }}>
                                            <div><p className="font-semibold text-slate-800 dark:text-slate-200">{entity.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{entity.entityType}</p></div>
                                            <div className="text-right"><p className="text-sm font-medium text-slate-600 dark:text-slate-300">Last Payment</p><p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{entity.lastPaymentDate === 'Never' ? 'Never' : new Date(entity.lastPaymentDate + 'T00:00:00Z').toLocaleDateString()}</p></div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-center text-slate-500 dark:text-slate-400 animate-fade-in-up">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <p>All accounts are active.</p><p className="text-xs mt-1">No dormant accounts found based on the current settings.</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                )}

                {widgetConfig.topAgents.visible && (
                    <div className={`relative ${isCustomizing ? 'ring-2 ring-dashed ring-primary-500 rounded-lg p-2 pt-8' : ''}`}>
                         {isCustomizing && (
                            <button onClick={() => handleWidgetVisibilityChange('topAgents', false)} title="Hide Widget" aria-label="Hide Top Paying Agents widget" className="absolute top-1 right-1 p-1 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-500 hover:text-white transition-colors">
                                <CloseIcon className="w-3 h-3"/>
                            </button>
                        )}
                        <Card>
                            <h3 className="text-xl font-bold mb-4">Top 5 Paying Agents (Today)</h3>
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {isLoading ? (
                                     <div className="space-y-3">
                                        {[...Array(5)].map((_, i) => <SkeletonLoader key={i} className="h-12 w-full" />)}
                                    </div>
                                ) : topPayingAgents.length > 0 ? (
                                    topPayingAgents.map((agent, index) => (
                                        <div key={agent.agentId} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg stagger-child" style={{ animationDelay: `${index * 100}ms` }}>
                                            <div className="flex items-center gap-3"><span className="flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200">{index + 1}</span><p className="font-semibold text-slate-800 dark:text-slate-200">{agent.agentName}</p></div>
                                            <p className="font-mono font-semibold text-green-600">{formatCurrency(agent.totalPaid)}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-center text-slate-500 dark:text-slate-400 animate-fade-in-up">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        <p>No agent payments found today.</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                )}
             </div>
        </div>
    );
};

export default DashboardPage;
