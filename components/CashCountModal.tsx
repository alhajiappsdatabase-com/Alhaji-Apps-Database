
import React, { FC, useState, useEffect, useMemo } from 'react';
import { Modal } from './ui';
import { useAppContext } from '../types';

type CashCountModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (total: number) => void;
};

const CashCountModal: FC<CashCountModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const { formatCurrency } = useAppContext();
    const [counts, setCounts] = useState<Record<string, number>>({});

    // Standard denominations (could be moved to settings later)
    const denominations = [
        { value: 100, label: '100' },
        { value: 50, label: '50' },
        { value: 20, label: '20' },
        { value: 10, label: '10' },
        { value: 5, label: '5' },
        { value: 1, label: '1' },
        { value: 0.5, label: '0.50' },
        { value: 0.25, label: '0.25' },
        { value: 0.1, label: '0.10' },
        { value: 0.05, label: '0.05' },
    ];

    useEffect(() => {
        if (isOpen) {
            setCounts({});
        }
    }, [isOpen]);

    const handleCountChange = (value: number, countStr: string) => {
        const count = parseInt(countStr) || 0;
        setCounts(prev => ({ ...prev, [value]: count }));
    };

    const total = useMemo(() => {
        return denominations.reduce((sum, denom) => {
            return sum + (denom.value * (counts[denom.value] || 0));
        }, 0);
    }, [counts, denominations]);

    const handleConfirm = () => {
        onConfirm(total);
        onClose();
    };

    const handleClear = () => {
        setCounts({});
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Cash Count Helper" size="md">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto p-1">
                    {denominations.map(denom => (
                        <div key={denom.value} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded-lg">
                            <div className="w-16 text-right font-bold text-slate-700 dark:text-slate-300">
                                {denom.value >= 1 ? denom.value : denom.label}
                            </div>
                            <div className="text-slate-400 text-xs">x</div>
                            <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={counts[denom.value] || ''}
                                onChange={(e) => handleCountChange(denom.value, e.target.value)}
                                className="flex-1 p-1 border rounded text-center bg-white dark:bg-slate-600 dark:border-slate-500 text-slate-900 dark:text-slate-100"
                            />
                            <div className="w-20 text-right font-mono text-sm text-slate-600 dark:text-slate-400">
                                {formatCurrency(denom.value * (counts[denom.value] || 0))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t dark:border-slate-600 pt-4">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-300">Total Count:</span>
                        <span className="text-2xl font-bold text-primary-600">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleClear}
                            className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                        >
                            Clear
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-[2] px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                        >
                            Use Total
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default CashCountModal;
