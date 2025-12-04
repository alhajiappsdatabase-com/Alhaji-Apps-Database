import React, { useState, useMemo, FC, useRef, useCallback, useEffect } from 'react';
// Fix: Corrected the import path for useAppContext to '../types' to resolve a circular dependency with App.tsx.
import { useAppContext } from '../types';
import { Card, SearchableSelect, Spinner } from '../components/ui';
import { ServiceType } from '../types';

type PaymentItem = {
  id: number;
  value: number;
  isHighlighted: boolean;
};

const serviceTypes: ServiceType[] = ['ria', 'moneyGram', 'westernUnion', 'afro'];
const serviceNames: Record<ServiceType, string> = {
    ria: 'Ria',
    moneyGram: 'MoneyGram',
    westernUnion: 'Western Union',
    afro: 'Afro'
};

type AmountSearchResultItem = {
    id: string;
    name: string;
    type: 'Branch' | 'Agent';
    service: string;
    amount: number;
    count: number;
};


const PaymentList: FC<{ title: string; payments: PaymentItem[], formatCurrency: (amount: number) => string; }> = ({ title, payments, formatCurrency }) => {
    const summary = useMemo(() => {
        const highlightedItems = payments.filter(p => p.isHighlighted);
        return {
            totalCount: payments.length,
            totalValue: payments.reduce((sum, p) => sum + p.value, 0),
            highlightedCount: highlightedItems.length,
            highlightedValue: highlightedItems.reduce((sum, p) => sum + p.value, 0)
        };
    }, [payments]);

    return (
        <div className="flex-1">
            <h3 className="text-xl font-bold text-center mb-2">{title}</h3>
            <div className="border rounded-lg h-96 overflow-y-auto p-2 space-y-1 bg-slate-100 dark:bg-slate-900/50">
                {payments.length > 0 ? payments.map(p => (
                    <div key={p.id} className={`px-2 py-1 rounded font-mono text-slate-800 dark:text-slate-200 transition-colors duration-200 ${p.isHighlighted ? 'bg-blue-200 dark:bg-blue-500/50' : 'bg-white dark:bg-slate-700'}`}>
                        {formatCurrency(p.value)}
                    </div>
                )) : <p className="text-center text-slate-500 pt-4">No data</p>}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
                <span>Total: {summary.totalCount} ({formatCurrency(summary.totalValue)})</span>
                <span className={summary.highlightedCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''}>
                    Matched: {summary.highlightedCount} ({formatCurrency(summary.highlightedValue)})
                </span>
            </div>
        </div>
    );
};


const ReconciliationPage: FC = () => {
    const { transactions, branches, agents, formatCurrency, showToast, fetchTransactions, fetchManagementData } = useAppContext();
    
    const [manualInput, setManualInput] = useState('');
    const [systemPayments, setSystemPayments] = useState<PaymentItem[]>([]);
    const [appPayments, setAppPayments] = useState<PaymentItem[]>([]);
    
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedEntityType, setSelectedEntityType] = useState<'branch' | 'agent'>('agent');
    const [selectedEntityId, setSelectedEntityId] = useState<string>('');
    const [selectedService, setSelectedService] = useState<ServiceType | 'all'>('all');
    
    const [isLoading, setIsLoading] = useState(false);
    
    const systemIdCounter = useRef(0);
    const appIdCounter = useRef(0);

    // Amount Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchAmount, setSearchAmount] = useState<number | ''>('');
    const [searchService, setSearchService] = useState<ServiceType | 'all'>('all');
    const [amountSearchResult, setAmountSearchResult] = useState<AmountSearchResultItem[] | null>(null);

    useEffect(() => {
        fetchTransactions();
        fetchManagementData();
    }, [fetchTransactions, fetchManagementData]);

    const entityOptions = useMemo(() => {
        const list = selectedEntityType === 'branch' ? branches : agents;
        return list.filter(e => e.isActive).map(e => ({ id: e.id, name: e.name }));
    }, [selectedEntityType, branches, agents]);
    
    const formatNumber = useCallback((amount: number) => {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    }, []);

    const handleLoadManualData = () => {
        const values = manualInput
            .split(/[\n\t, ]+/)
            .map(v => parseFloat(v.trim()))
            .filter(num => !isNaN(num));
        setSystemPayments(values.map((v) => ({ 
            id: systemIdCounter.current++, 
            value: v, 
            isHighlighted: false 
        })));
    };

    const handleGenerate = () => {
        if (!selectedEntityId) {
            alert("Please select an entity.");
            return;
        }
        setIsLoading(true);
        appIdCounter.current = 0;
        setAppPayments([]);

        const tx = transactions.find(t => t.entityId === selectedEntityId && t.date === selectedDate);
        
        let allPayments: number[] = [];
        if (tx) {
            const servicesToProcess = selectedService === 'all' 
                ? Object.values(tx.cashPaidByService) 
                : [tx.cashPaidByService[selectedService]];

            servicesToProcess.forEach((service: { formula: string; total: number } | undefined) => {
                if (service && service.formula) {
                    const paymentsInFormula = service.formula
                        .split('+')
                        .map(s => parseFloat(s.trim()))
                        .filter(num => !isNaN(num));
                    allPayments.push(...paymentsInFormula);
                }
            });
        }
        
        setTimeout(() => {
            setAppPayments(allPayments.map((p) => ({ 
                id: appIdCounter.current++, 
                value: p, 
                isHighlighted: false 
            })));
            setIsLoading(false);
        }, 300);
    };

    const handleCompare = () => {
        const systemValueCounts = new Map<number, number>();
        systemPayments.forEach(p => {
            if (!p.isHighlighted) {
                systemValueCounts.set(p.value, (systemValueCounts.get(p.value) || 0) + 1);
            }
        });

        const appValueCounts = new Map<number, number>();
        appPayments.forEach(p => {
            if (!p.isHighlighted) {
                appValueCounts.set(p.value, (appValueCounts.get(p.value) || 0) + 1);
            }
        });

        const valuesToHighlight = new Map<number, number>();
        for (const [value, count] of systemValueCounts.entries()) {
            const appCount = appValueCounts.get(value) || 0;
            if (appCount > 0) {
                valuesToHighlight.set(value, Math.min(count, appCount));
            }
        }
        
        let totalMatches = 0;
        for (const count of valuesToHighlight.values()) {
            totalMatches += count;
        }

        if (totalMatches > 0) {
            showToast(`Found ${totalMatches} new matches.`, 'success');
        } else {
            showToast('No new matches found.', 'success');
        }
        
        const valuesToHighlightForApp = new Map(valuesToHighlight);

        const newSystemPayments = systemPayments.map(p => {
            const highlightCount = valuesToHighlight.get(p.value) || 0;
            if (!p.isHighlighted && highlightCount > 0) {
                valuesToHighlight.set(p.value, highlightCount - 1);
                return { ...p, isHighlighted: true };
            }
            return p;
        });

        const newAppPayments = appPayments.map(p => {
            const highlightCount = valuesToHighlightForApp.get(p.value) || 0;
            if (!p.isHighlighted && highlightCount > 0) {
                valuesToHighlightForApp.set(p.value, highlightCount - 1);
                return { ...p, isHighlighted: true };
            }
            return p;
        });

        setSystemPayments(newSystemPayments);
        setAppPayments(newAppPayments);
    };
    
    const handleDeleteMatches = () => {
        setSystemPayments(prev => prev.filter(p => !p.isHighlighted));
        setAppPayments(prev => prev.filter(p => !p.isHighlighted));
    };

    const handleClearSystem = () => {
        setSystemPayments([]);
        setManualInput('');
        systemIdCounter.current = 0;
    };

    const handleAmountSearch = useCallback(() => {
        setIsSearching(true);
        setAmountSearchResult(null);

        const amountToFind = Number(searchAmount);
        if (isNaN(amountToFind) || amountToFind <= 0) {
            showToast('Please enter a valid amount to search for.', 'error');
            setIsSearching(false);
            return;
        }
        
        const results: AmountSearchResultItem[] = [];
        const allEntities = [...branches, ...agents];
        const txsOnDate = transactions.filter(tx => tx.date === searchDate);

        const servicesToSearch = searchService === 'all' ? serviceTypes : [searchService];

        for (const tx of txsOnDate) {
            const entity = allEntities.find(e => e.id === tx.entityId);
            if (!entity) continue;

            for (const service of servicesToSearch) {
                const formula = tx.cashPaidByService[service]?.formula || '';
                const paidAmounts = formula.split('+').map(val => parseFloat(val.trim())).filter(num => !isNaN(num));
                
                const count = paidAmounts.filter(num => num === amountToFind).length;

                if (count > 0) {
                    const entityType = branches.some(b => b.id === entity.id) ? 'Branch' : 'Agent';
                    results.push({
                        id: entity.id,
                        name: entity.name,
                        type: entityType,
                        service: serviceNames[service],
                        amount: amountToFind,
                        count: count,
                    });
                }
            }
        }
        
        const sortedResults = results.sort((a,b) => a.name.localeCompare(b.name));

        setTimeout(() => {
            setAmountSearchResult(sortedResults);
            setIsSearching(false);
        }, 300);

    }, [searchDate, searchAmount, searchService, transactions, branches, agents, showToast]);

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold mb-4">Reconciliation Tool</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Entity Type</label>
                        <select value={selectedEntityType} onChange={e => { setSelectedEntityType(e.target.value as any); setSelectedEntityId(''); }} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                            <option value="agent">Agent</option>
                            <option value="branch">Branch</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Service Type</label>
                        <select value={selectedService} onChange={e => setSelectedService(e.target.value as ServiceType | 'all')} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                            <option value="all">All Services</option>
                            {serviceTypes.map(s => <option key={s} value={s}>{serviceNames[s]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Entity</label>
                        <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <SearchableSelect
                                    value={selectedEntityId}
                                    onChange={setSelectedEntityId}
                                    options={entityOptions}
                                    placeholder={`Search...`}
                                />
                            </div>
                            <button onClick={handleGenerate} disabled={!selectedEntityId || isLoading} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                                {isLoading ? <Spinner /> : "Generate"}
                            </button>
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="lg:w-1/3">
                        <h3 className="text-xl font-bold mb-2">System Payments</h3>
                        <p className="text-sm text-slate-500 mb-2">Paste payment amounts below (one per line).</p>
                        <textarea
                            value={manualInput}
                            onChange={e => setManualInput(e.target.value)}
                            placeholder="500&#10;1200&#10;350.50&#10;..."
                            className="w-full h-40 p-2 border rounded font-mono bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                        />
                        <div className="flex gap-2 mt-2">
                            <button onClick={handleLoadManualData} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">Load Data</button>
                            <button onClick={handleClearSystem} className="flex-1 bg-slate-500 text-white px-4 py-2 rounded-lg hover:bg-slate-600">Clear</button>
                        </div>
                    </div>

                    <div className="lg:w-1/6 flex flex-row lg:flex-col items-center justify-center gap-4 py-4">
                        <div className="hidden lg:block w-px h-full bg-slate-200 dark:bg-slate-700"></div>
                        <button onClick={handleCompare} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full">Compare &amp; Highlight</button>
                        <button onClick={handleDeleteMatches} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 w-full">Delete Matches</button>
                        <div className="hidden lg:block w-px h-full bg-slate-200 dark:bg-slate-700"></div>
                    </div>

                    <div className="lg:w-1/2">
                        <div className="flex flex-col md:flex-row gap-4">
                             <PaymentList title="System Payments" payments={systemPayments} formatCurrency={formatCurrency} />
                             <PaymentList title="App Payments" payments={appPayments} formatCurrency={formatNumber} />
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <h2 className="text-2xl font-bold mb-2">Search for a Payment Amount</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-4">Find which branch or agent made a payment of a specific amount on a given day.</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
                        <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Amount to Find</label>
                        <input type="number" placeholder="e.g., 5000" value={searchAmount} onChange={e => setSearchAmount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Service</label>
                        <select 
                            value={searchService} 
                            onChange={e => setSearchService(e.target.value as ServiceType | 'all')}
                            className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                        >
                            <option value="all">All Services</option>
                            {serviceTypes.map(service => (
                                <option key={service} value={service}>{serviceNames[service]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <button onClick={handleAmountSearch} disabled={isSearching} className="w-full bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition transform hover:-translate-y-0.5">
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                </div>
            </Card>

            {isSearching && <Spinner />}
            {amountSearchResult && (
                <Card>
                    <h3 className="text-xl font-bold mb-4">Search Results for {formatCurrency(Number(searchAmount))} on {new Date(searchDate + 'T00:00:00').toLocaleDateString()}</h3>
                    {amountSearchResult.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Service</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                                        <th className="p-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Count</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {amountSearchResult.map((result, index) => (
                                        <tr key={`${result.id}-${result.service}-${index}`} className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{result.name}</td>
                                            <td className="p-3 text-slate-700 dark:text-slate-300">{result.type}</td>
                                            <td className="p-3 text-slate-700 dark:text-slate-300">{result.service}</td>
                                            <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(result.amount)}</td>
                                            <td className="p-3 text-center font-mono text-slate-800 dark:text-slate-200">{result.count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 dark:text-slate-400 py-8">No entities found with that payment amount on the selected date.</p>
                    )}
                </Card>
            )}
        </div>
    );
};

export default ReconciliationPage;