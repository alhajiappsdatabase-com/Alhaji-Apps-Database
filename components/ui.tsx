
import React, { FC, useState, useEffect, useRef, useMemo } from 'react';

export const Card: FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-md p-4 sm:p-6 transition-shadow duration-300 ${className}`}>
        {children}
    </div>
);

export const Spinner: FC = () => (
    <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
    </div>
);

export const ProgressBar: FC<{ isLoading: boolean }> = ({ isLoading }) => {
    if (!isLoading) return null;
    return (
        <div className="fixed top-0 left-0 w-full h-1 z-[200] bg-transparent overflow-hidden pointer-events-none">
            <div className="h-full bg-green-500 animate-progress origin-left shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
        </div>
    );
};

export const Modal: FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' }> = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;
    
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
            <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full ${sizeClasses[size]} p-6 animate-fade-in-scale-up`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2 dark:border-slate-600">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
                    <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-3xl">&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

export const ConfirmationModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="space-y-6">
                <div className="text-slate-600 dark:text-slate-300">{message}</div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export const DestructiveConfirmationModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    requiredConfirmationText: string;
    confirmText?: string;
    cancelText?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, requiredConfirmationText, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
    const [confirmationInput, setConfirmationInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmationInput(''); // Reset on open
        }
    }, [isOpen]);

    const isConfirmed = confirmationInput === requiredConfirmationText;

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="space-y-6">
                <div className="text-slate-600 dark:text-slate-300">{message}</div>
                <div>
                    <label htmlFor="confirmation-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        To confirm, type "<span className="font-bold text-slate-900 dark:text-slate-100">{requiredConfirmationText}</span>" below.
                    </label>
                    <input
                        id="confirmation-input"
                        type="text"
                        value={confirmationInput}
                        onChange={(e) => setConfirmationInput(e.target.value)}
                        className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:ring-primary-500 focus:border-primary-500"
                        autoComplete="off"
                    />
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500">
                        {cancelText}
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={!isConfirmed}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export const Pagination: FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) {
        return null;
    }

    return (
        <div className="flex items-center justify-between mt-4 p-2 border-t dark:border-slate-700">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                Previous
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-400">
                Page <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span> of <span className="font-semibold text-slate-900 dark:text-slate-100">{totalPages}</span>
            </span>
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                Next
            </button>
        </div>
    );
};


type ToastMessage = { id: number; message: string; type: 'success' | 'error' | 'info'; action?: { label: string; onClick: () => void } };

const Toast: FC<{ message: ToastMessage; onDismiss: (id: number) => void }> = ({ message, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(message.id);
        }, 4000);
        return () => clearTimeout(timer);
    }, [message.id, onDismiss]);

    const baseClasses = 'w-full max-w-sm p-4 rounded-lg shadow-lg flex items-center space-x-4 text-white animate-fade-in-up pointer-events-auto';
    const typeClasses = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600'
    };

    const Icon = {
        success: () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>,
        error: () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        info: () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    };

    return (
        <div className={`${baseClasses} ${typeClasses[message.type]}`}>
            <div className="flex-shrink-0">{Icon[message.type]()}</div>
            <div className="flex-1 font-medium">
                {message.message}
                {message.action && (
                    <button onClick={message.action.onClick} className="ml-2 underline font-bold hover:text-gray-200">{message.action.label}</button>
                )}
            </div>
            <button onClick={() => onDismiss(message.id)} className="text-2xl leading-none opacity-70 hover:opacity-100">&times;</button>
        </div>
    );
};

export const ToastContainer: FC<{ toasts: ToastMessage[]; removeToast: (id: number) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-5 right-5 z-[100] space-y-3 pointer-events-none">
            {toasts.map(toast => (
                <Toast key={toast.id} message={toast} onDismiss={removeToast} />
            ))}
        </div>
    );
};

type Option = {
    id: string;
    name: string;
};

type SearchableSelectProps = {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

export const SearchableSelect: FC<SearchableSelectProps> = ({ options, value, onChange, placeholder = "Select an option" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    const selectedOption = useMemo(() => options.find(option => option.id === value), [options, value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    useEffect(() => {
        if (!isOpen) {
           setSearchTerm('');
        }
    }, [isOpen]);

    const filteredOptions = useMemo(() => options.filter(option =>
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [options, searchTerm]);

    const handleSelect = (optionId: string) => {
        onChange(optionId);
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        if (!isOpen) {
            setIsOpen(true);
        }
    };
    
    const displayValue = isOpen ? searchTerm : (selectedOption?.name || '');

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    value={displayValue}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setIsOpen(true);
                        setSearchTerm(selectedOption?.name || '');
                    }}
                    placeholder={placeholder}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 pr-8"
                />
                <button
                    type="button"
                    onClick={() => {
                        if (!isOpen) {
                           setSearchTerm(selectedOption?.name || '');
                        }
                        setIsOpen(!isOpen);
                    }}
                    className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-500 dark:text-slate-400"
                >
                    <svg className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
            </div>

            {isOpen && (
                <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto animate-fade-in-scale-up" style={{ transformOrigin: 'top' }}>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map(option => (
                            <li
                                key={option.id}
                                onClick={() => handleSelect(option.id)}
                                className={`px-4 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-150 ${option.id === value ? 'bg-primary-100 dark:bg-primary-900' : ''}`}
                            >
                                {option.name}
                            </li>
                        ))
                    ) : (
                        <li className="px-4 py-2 text-slate-500">No results found</li>
                    )}
                </ul>
            )}
        </div>
    );
};

// New Component
type MultiOption = {
    id: string;
    name: string;
};

type MultiSearchableSelectProps = {
    options: MultiOption[];
    selectedIds: string[];
    onChange: (selectedIds: string[]) => void;
    placeholder?: string;
};

export const MultiSearchableSelect: FC<MultiSearchableSelectProps> = ({ options, selectedIds, onChange, placeholder = "Select options" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const allOptionIds = useMemo(() => options.map(o => o.id), [options]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => options.filter(option =>
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [options, searchTerm]);

    const handleSelect = (optionId: string) => {
        const newSelectedIds = selectedIds.includes(optionId)
            ? selectedIds.filter(id => id !== optionId)
            : [...selectedIds, optionId];
        onChange(newSelectedIds);
    };

    const handleSelectAll = () => {
        if (selectedIds.length === allOptionIds.length) {
            onChange([]);
        } else {
            onChange(allOptionIds);
        }
    };
    
    const displayValue = useMemo(() => {
        if (selectedIds.length === 0) return placeholder;
        if (selectedIds.length === allOptionIds.length) return "All selected";
        if (selectedIds.length === 1) return options.find(o => o.id === selectedIds[0])?.name || placeholder;
        return `${selectedIds.length} selected`;
    }, [selectedIds, options, placeholder, allOptionIds.length]);

    return (
        <div className="relative" ref={wrapperRef}>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-left flex justify-between items-center">
                <span className="truncate">{displayValue}</span>
                <svg className={`w-5 h-5 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>

            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-lg animate-fade-in-scale-up" style={{ transformOrigin: 'top' }}>
                    <div className="p-2 border-b dark:border-slate-700">
                         <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <ul className="max-h-60 overflow-auto">
                         <li className="px-4 py-2 flex items-center hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer sticky top-0 bg-white dark:bg-slate-800 border-b dark:border-slate-700 transition-colors duration-150" onClick={handleSelectAll}>
                             <input type="checkbox" checked={selectedIds.length === allOptionIds.length} readOnly className="mr-3" />
                             <span>Select All</span>
                         </li>
                        {filteredOptions.map(option => (
                            <li key={option.id} className="px-4 py-2 flex items-center hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors duration-150" onClick={() => handleSelect(option.id)}>
                                <input type="checkbox" checked={selectedIds.includes(option.id)} readOnly className="mr-3" />
                                <span>{option.name}</span>
                            </li>
                        ))}
                         {filteredOptions.length === 0 && <li className="px-4 py-2 text-slate-500">No results found</li>}
                    </ul>
                </div>
            )}
        </div>
    );
};

export const SkeletonLoader: FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`skeleton-loader rounded ${className}`}></div>
);

export const EmptyState: FC<{
    icon: React.ReactNode;
    title: string;
    message: string;
    action?: React.ReactNode;
}> = ({ icon, title, message, action }) => (
    <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg animate-fade-in-up">
        <div className="mx-auto w-fit text-slate-400">{icon}</div>
        <h3 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        {action && <div className="mt-6">{action}</div>}
    </div>
);
