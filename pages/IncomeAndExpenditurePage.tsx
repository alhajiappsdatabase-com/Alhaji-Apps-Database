
import React, { FC, useState, useMemo, useEffect, useRef } from 'react';
import { Card, Modal, ConfirmationModal, EmptyState, Pagination } from '../components/ui';
import { useAppContext } from '../types';
import { Income, Expense } from '../types';
import { PlusIcon, EditIcon, TrashIcon, IncomeIcon, EyeIcon, EyeSlashIcon, DownloadIcon, LockClosedIcon } from '../components/icons';
import FinancialReportView, { ReportTable } from '../components/FinancialReportView';

const getISODateString = (date: Date) => date.toISOString().split('T')[0];
const ITEMS_PER_PAGE = 10;

const IncomeAndExpenditurePage: FC = () => {
    const { api, incomes, expenses, fetchPettyCashData, formatCurrency, showToast, settings, currentUser, lockDate } = useAppContext();
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [editingIncome, setEditingIncome] = useState<Income | null>(null);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'income' | 'expense' } | null>(null);

    // SINGLE DATE SELECTION
    const [selectedDate, setSelectedDate] = useState(getISODateString(new Date()));
    
    const incomeInputRef = useRef<HTMLInputElement>(null);
    const expenseInputRef = useRef<HTMLInputElement>(null);

    const [incomeCurrentPage, setIncomeCurrentPage] = useState(1);
    const [expenseCurrentPage, setExpenseCurrentPage] = useState(1);
    
    const [isIncomeVisible, setIsIncomeVisible] = useState(true);
    const [isExpenseVisible, setIsExpenseVisible] = useState(true);

    // Print & PDF States
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [reportData, setReportData] = useState<{ tables: ReportTable[], summary: any[] } | null>(null);

    const hasWriteAccess = currentUser?.role !== 'Clerk';

    // Check if a date is locked
    const isRecordLocked = (date: string) => {
        if (!lockDate) return false;
        return date <= lockDate;
    };

    useEffect(() => {
        fetchPettyCashData();
    }, [fetchPettyCashData]);

    useEffect(() => {
        if (isIncomeModalOpen) {
            setTimeout(() => incomeInputRef.current?.focus(), 100);
        }
    }, [isIncomeModalOpen]);

    useEffect(() => {
        if (isExpenseModalOpen) {
            setTimeout(() => expenseInputRef.current?.focus(), 100);
        }
    }, [isExpenseModalOpen]);
    
    useEffect(() => {
        setIncomeCurrentPage(1);
        setExpenseCurrentPage(1);
    }, [selectedDate]);

    // Filter strictly by selected date
    const filteredIncomes = useMemo(() => {
        return incomes.filter(i => i.date === selectedDate);
    }, [incomes, selectedDate]);

    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => e.date === selectedDate);
    }, [expenses, selectedDate]);

    const initialIncomeState: Omit<Income, 'id' | 'companyId' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'> = { date: selectedDate, category: '', amount: 0, note: '' };
    const initialExpenseState: Omit<Expense, 'id' | 'companyId' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'editHistory'> = { date: selectedDate, category: '', amount: 0, note: '' };

    const [incomeForm, setIncomeForm] = useState(initialIncomeState);
    const [expenseForm, setExpenseForm] = useState(initialExpenseState);

    // Update form dates when selection changes
    useEffect(() => {
        setIncomeForm(prev => ({ ...prev, date: selectedDate }));
        setExpenseForm(prev => ({ ...prev, date: selectedDate }));
    }, [selectedDate]);

    const summary = useMemo(() => {
        // Opening: Sum of everything BEFORE selected date
        const priorIncome = incomes
            .filter(i => i.date < selectedDate)
            .reduce((sum, i) => sum + i.amount, 0);
        const priorExpenses = expenses
            .filter(e => e.date < selectedDate)
            .reduce((sum, e) => sum + e.amount, 0);
        const openingBalance = priorIncome - priorExpenses;

        // Current Period
        const totalIncomeInPeriod = filteredIncomes.reduce((sum, item) => sum + item.amount, 0);
        const totalExpensesInPeriod = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
        
        const closingBalance = openingBalance + totalIncomeInPeriod - totalExpensesInPeriod;
        
        return { openingBalance, totalIncome: totalIncomeInPeriod, totalExpenses: totalExpensesInPeriod, closingBalance };
    }, [incomes, expenses, filteredIncomes, filteredExpenses, selectedDate]);

    const handleOpenAddIncomeModal = () => { setEditingIncome(null); setIncomeForm({...initialIncomeState, date: selectedDate }); setIsIncomeModalOpen(true); };
    const handleOpenEditIncomeModal = (income: Income) => { setEditingIncome(income); setIncomeForm({ date: income.date, category: income.category, amount: income.amount, note: income.note }); setIsIncomeModalOpen(true); };
    const handleOpenAddExpenseModal = () => { setEditingExpense(null); setExpenseForm({...initialExpenseState, date: selectedDate}); setIsExpenseModalOpen(true); };
    const handleOpenEditExpenseModal = (expense: Expense) => { setEditingExpense(expense); setExpenseForm({ date: expense.date, category: expense.category, amount: expense.amount, note: expense.note }); setIsExpenseModalOpen(true); };

    const handleSaveIncome = async () => {
        if (isRecordLocked(incomeForm.date)) {
             showToast('Cannot save: This date is locked.', "error");
             return;
        }
        if (!incomeForm.category || incomeForm.amount <= 0) { alert("Please enter a category and a valid amount."); return; }
        if (!currentUser) return;
        try {
            if (editingIncome) {
                await api.updateIncome(currentUser.companyId, currentUser, { ...editingIncome, ...incomeForm });
                showToast('Income updated successfully!', 'success');
            } else {
                await api.addIncome(currentUser.companyId, currentUser, incomeForm);
                showToast('Income added successfully!', 'success');
            }
            await fetchPettyCashData();
            setIsIncomeModalOpen(false);
        } catch (error: any) {
            showToast(error.message || 'Failed to save income.', 'error');
        }
    };
    
    const handleSaveExpense = async () => {
        if (isRecordLocked(expenseForm.date)) {
             showToast('Cannot save: This date is locked.', "error");
             return;
        }
        if (!expenseForm.category || expenseForm.amount <= 0) { alert("Please enter a category and a valid amount."); return; }
        if (!currentUser) return;
        try {
            if (editingExpense) {
                await api.updateExpense(currentUser.companyId, currentUser, { ...editingExpense, ...expenseForm });
                showToast('Expense updated successfully!', 'success');
            } else {
                await api.addExpense(currentUser.companyId, currentUser, expenseForm);
                showToast('Expense added successfully!', 'success');
            }
            await fetchPettyCashData();
            setIsExpenseModalOpen(false);
        } catch (error: any) {
            showToast(error.message || 'Failed to save expense.', 'error');
        }
    };

    const openDeleteConfirmation = (id: string, type: 'income' | 'expense', date: string) => {
         if (isRecordLocked(date)) {
             showToast('Cannot delete: This record is locked.', "error");
             return;
        }
        setItemToDelete({ id, type });
        setIsConfirmModalOpen(true);
    };
    
    const handleDelete = async () => {
        if (!itemToDelete || !currentUser) return;
        try {
            if (itemToDelete.type === 'income') {
                await api.deleteIncome(currentUser.companyId, currentUser, itemToDelete.id);
                showToast('Income record deleted.', 'success');
            } else {
                await api.deleteExpense(currentUser.companyId, currentUser, itemToDelete.id);
                showToast('Expense record deleted.', 'success');
            }
            await fetchPettyCashData();
        } catch (error: any) {
            showToast(error.message || 'Failed to delete record.', 'error');
        } finally {
            setIsConfirmModalOpen(false);
            setItemToDelete(null);
        }
    };
    
    const sortedIncomes = useMemo(() => [...filteredIncomes].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [filteredIncomes]);
    const sortedExpenses = useMemo(() => [...filteredExpenses].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [filteredExpenses]);
    
    const incomeTotalPages = Math.ceil(sortedIncomes.length / ITEMS_PER_PAGE);
    const paginatedIncomes = useMemo(() => {
        const startIndex = (incomeCurrentPage - 1) * ITEMS_PER_PAGE;
        return sortedIncomes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [sortedIncomes, incomeCurrentPage]);

    const expenseTotalPages = Math.ceil(sortedExpenses.length / ITEMS_PER_PAGE);
    const paginatedExpenses = useMemo(() => {
        const startIndex = (expenseCurrentPage - 1) * ITEMS_PER_PAGE;
        return sortedExpenses.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [sortedExpenses, expenseCurrentPage]);

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

    // --- Print & PDF Logic ---
    const generateReportData = () => {
        const incomeTable: ReportTable = {
            title: 'Petty Cash In Records',
            columns: ['Date', 'Category', 'Note', 'Amount'],
            rows: sortedIncomes.map(i => [
                new Date(i.date).toLocaleDateString(),
                i.category,
                i.note || '-',
                formatCurrency(i.amount)
            ])
        };
        const expenseTable: ReportTable = {
            title: 'Petty Cash Out Records',
            columns: ['Date', 'Category', 'Note', 'Amount'],
            rows: sortedExpenses.map(e => [
                new Date(e.date).toLocaleDateString(),
                e.category,
                e.note || '-',
                formatCurrency(e.amount)
            ])
        };
        
        const summaryData = [
            { label: 'Opening Balance', value: formatCurrency(summary.openingBalance) },
            { label: 'Total Cash In (Period)', value: formatCurrency(summary.totalIncome), color: 'text-green-600' },
            { label: 'Total Cash Out (Period)', value: formatCurrency(summary.totalExpenses), color: 'text-orange-500' },
            { label: 'Closing Balance', value: formatCurrency(summary.closingBalance), color: summary.closingBalance >= 0 ? 'text-primary-600' : 'text-red-600' },
        ];
        
        setReportData({ tables: [incomeTable, expenseTable], summary: summaryData });
    };

    const handlePrint = () => {
        generateReportData();
    };
    
    const handleExportPDF = () => {
        generateReportData();
        setIsExportingPDF(true);
    };

    // --- CSV Export Logic ---
    const handleExportIncomeCSV = () => {
        if (!window.Papa) {
            showToast("CSV export library not loaded.", "error");
            return;
        }
        const dataToExport = sortedIncomes.map(({ date, category, note, amount }) => ({
            Date: date,
            Category: category,
            Note: note,
            Amount: amount,
        }));
        const csv = window.Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `petty-cash-in_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportExpenseCSV = () => {
        if (!window.Papa) {
            showToast("CSV export library not loaded.", "error");
            return;
        }
        const dataToExport = sortedExpenses.map(({ date, category, note, amount }) => ({
            Date: date,
            Category: category,
            Note: note,
            Amount: amount,
        }));
        const csv = window.Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `petty-cash-out_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    // Effect for Printing
    useEffect(() => {
        if (reportData && !isExportingPDF) {
            const handleAfterPrint = () => {
                document.body.classList.remove('is-printing');
                setReportData(null);
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
    }, [reportData, isExportingPDF]);


    // Effect for PDF (Single Page Fit)
    useEffect(() => {
        if (isExportingPDF && reportData && window.jspdf && window.html2canvas) {
            const generatePdf = async () => {
                const element = document.getElementById('income-expense-report-pdf-target');
                if (!element) { setIsExportingPDF(false); return; }

                try {
                    const canvas = await window.html2canvas(element, { scale: 2, useCORS: true });
                    const imgData = canvas.toDataURL('image/png');
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                    
                    const pdfWidth = 210;
                    const pdfHeight = 297;
                    const margin = 10;
                    const availableWidth = pdfWidth - (2 * margin);
                    const availableHeight = pdfHeight - (2 * margin);
                    
                    const imgWidth = canvas.width;
                    const imgHeight = canvas.height;
                    
                    let finalWidth = availableWidth;
                    let finalHeight = (imgHeight * availableWidth) / imgWidth;
                    
                    if (finalHeight > availableHeight) {
                        finalHeight = availableHeight;
                        finalWidth = (imgWidth * availableHeight) / imgHeight;
                    }
                    
                    const x = (pdfWidth - finalWidth) / 2;
                    const y = margin;
                    
                    doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
                    doc.save(`income-expense-report-${selectedDate}.pdf`);
                } catch (error) {
                    console.error("PDF Generation Error", error);
                    showToast("Failed to generate PDF", "error");
                } finally {
                    setIsExportingPDF(false);
                    setReportData(null);
                }
            };
            setTimeout(generatePdf, 500);
        }
    }, [isExportingPDF, reportData, selectedDate, showToast]);


    return (
        <div className="space-y-6">
            {settings && reportData && (
                <>
                    <div className="print-only-container">
                         <FinancialReportView
                            title="Petty Cash Statement"
                            dateRangeText={`Date: ${new Date(selectedDate).toLocaleDateString()}`}
                            settings={settings}
                            tables={reportData.tables}
                            summary={reportData.summary}
                            isForPrint={true}
                        />
                    </div>
                    <div className="pdf-render-container" style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                        <div id="income-expense-report-pdf-target" style={{ width: '210mm', minHeight: '297mm', padding: '10mm', background: 'white' }}>
                            <FinancialReportView
                                title="Petty Cash Statement"
                                dateRangeText={`Date: ${new Date(selectedDate).toLocaleDateString()}`}
                                settings={settings}
                                tables={reportData.tables}
                                summary={reportData.summary}
                                isForPrint={true}
                            />
                        </div>
                    </div>
                </>
            )}

            <div className="screen-only space-y-6">
                 <Card>
                    <div className="flex flex-wrap items-end justify-between gap-4">
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
                             <button onClick={handleExportIncomeCSV} disabled={isExportingPDF} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 text-sm">
                                <DownloadIcon className="w-4 h-4" /> CSV (In)
                            </button>
                            <button onClick={handleExportExpenseCSV} disabled={isExportingPDF} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 text-sm">
                                <DownloadIcon className="w-4 h-4" /> CSV (Out)
                            </button>
                             <button onClick={handlePrint} disabled={isExportingPDF} className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:bg-slate-400 text-sm">Print</button>
                             <button onClick={handleExportPDF} disabled={isExportingPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400 text-sm">PDF</button>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Opening Balance</h3><p className="text-3xl font-bold text-primary-600">{formatCurrency(summary.openingBalance)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Total Cash In (Today)</h3><p className="text-3xl font-bold text-green-600">{formatCurrency(summary.totalIncome)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Total Cash Out (Today)</h3><p className="text-3xl font-bold text-orange-500">{formatCurrency(summary.totalExpenses)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Closing Balance</h3><p className={`text-3xl font-bold ${summary.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(summary.closingBalance)}</p></Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-2">
                        <Card className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Petty Cash In</h2>
                                {hasWriteAccess && <button onClick={handleOpenAddIncomeModal} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"><PlusIcon className="w-5 h-5" /> Record Cash In</button>}
                            </div>
                             <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isIncomeVisible ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                {sortedIncomes.length > 0 ? (
                                    <>
                                        <div className="overflow-x-auto flex-grow">
                                            <table className="w-full text-left">
                                            <thead> <tr className="border-b dark:border-slate-700">
                                                    <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                                    <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                                                    <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                                                    <th className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                                </tr> </thead>
                                                <tbody>
                                                    {paginatedIncomes.map((item, index) => (
                                                        <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                                            <td className="p-2 text-slate-700 dark:text-slate-300">{new Date(item.date).toLocaleDateString()}</td>
                                                            <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{item.category}</td>
                                                            <td className="p-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(item.amount)}</td>
                                                            <td className="p-2 text-center flex justify-center gap-1">
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => isRecordLocked(item.date) ? showToast('Record is locked', 'error') : handleOpenEditIncomeModal(item)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-primary-600'}`} title="Edit"><EditIcon className="w-5 h-5" /></button>
                                                                )}
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => openDeleteConfirmation(item.id, 'income', item.date)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-red-600'}`} title="Delete"><TrashIcon className="w-5 h-5" /></button>
                                                                )}
                                                                {isRecordLocked(item.date) && <LockClosedIcon className="w-4 h-4 text-red-400" />}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <Pagination
                                            currentPage={incomeCurrentPage}
                                            totalPages={incomeTotalPages}
                                            onPageChange={setIncomeCurrentPage}
                                        />
                                    </>
                                ) : (
                                        <EmptyState
                                        icon={<IncomeIcon className="w-12 h-12" />}
                                        title="No Petty Cash In"
                                        message="No cash-in has been recorded for this date."
                                        action={hasWriteAccess ? <button onClick={handleOpenAddIncomeModal} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 mx-auto"><PlusIcon className="w-5 h-5" /> Record First Cash In</button> : undefined}
                                    />
                                )}
                             </div>
                        </Card>
                         <div className="flex justify-center">
                            <button 
                                onClick={() => setIsIncomeVisible(prev => !prev)}
                                className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                                {isIncomeVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                <span>{isIncomeVisible ? 'Hide Cash In' : 'Show Cash In'}</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Card className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Petty Cash Out</h2>
                                {hasWriteAccess && <button onClick={handleOpenAddExpenseModal} className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-600"><PlusIcon className="w-5 h-5" /> Record Cash Out</button>}
                            </div>
                            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpenseVisible ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                {sortedExpenses.length > 0 ? (
                                    <>
                                        <div className="overflow-x-auto flex-grow">
                                            <table className="w-full text-left">
                                            <thead> <tr className="border-b dark:border-slate-700">
                                                    <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                                    <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                                                    <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                                                    <th className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                                </tr> </thead>
                                                <tbody>
                                                    {paginatedExpenses.map((item, index) => (
                                                        <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                                            <td className="p-2 text-slate-700 dark:text-slate-300">{new Date(item.date).toLocaleDateString()}</td>
                                                            <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{item.category}</td>
                                                            <td className="p-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(item.amount)}</td>
                                                            <td className="p-2 text-center flex justify-center gap-1">
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => isRecordLocked(item.date) ? showToast('Record is locked', 'error') : handleOpenEditExpenseModal(item)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-primary-600'}`} title="Edit"><EditIcon className="w-5 h-5" /></button>
                                                                )}
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => openDeleteConfirmation(item.id, 'expense', item.date)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-red-600'}`} title="Delete"><TrashIcon className="w-5 h-5" /></button>
                                                                )}
                                                                {isRecordLocked(item.date) && <LockClosedIcon className="w-4 h-4 text-red-400" />}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <Pagination
                                            currentPage={expenseCurrentPage}
                                            totalPages={expenseTotalPages}
                                            onPageChange={setExpenseCurrentPage}
                                        />
                                    </>
                                ) : (
                                    <EmptyState
                                        icon={<IncomeIcon className="w-12 h-12" />}
                                        title="No Petty Cash Out"
                                        message="No cash-out has been recorded for this date."
                                        action={hasWriteAccess ? <button onClick={handleOpenAddExpenseModal} className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-600 mx-auto"><PlusIcon className="w-5 h-5" /> Record First Cash Out</button> : undefined}
                                    />
                                )}
                            </div>
                        </Card>
                        <div className="flex justify-center">
                            <button 
                                onClick={() => setIsExpenseVisible(prev => !prev)}
                                className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                                {isExpenseVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                <span>{isExpenseVisible ? 'Hide Cash Out' : 'Show Cash Out'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <Modal isOpen={isIncomeModalOpen} onClose={() => setIsIncomeModalOpen(false)} title={editingIncome ? "Edit Petty Cash In" : "Record Petty Cash In"}>
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveIncome(); }}>
                        <div className="space-y-4">
                            <input type="date" value={incomeForm.date} onChange={e => setIncomeForm({...incomeForm, date: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <input ref={incomeInputRef} type="text" placeholder="Category (e.g., Service Sales)" value={incomeForm.category} onChange={e => setIncomeForm({...incomeForm, category: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <input type="number" placeholder="Amount" value={incomeForm.amount || ''} onChange={e => setIncomeForm({...incomeForm, amount: parseFloat(e.target.value) || 0})} required min="0.01" step="0.01" className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <textarea placeholder="Note (Optional)" value={incomeForm.note} onChange={e => setIncomeForm({...incomeForm, note: e.target.value})} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">Save Cash In</button>
                        </div>
                    </form>
                </Modal>
                
                <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title={editingExpense ? "Edit Petty Cash Out" : "Record Petty Cash Out"}>
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveExpense(); }}>
                        <div className="space-y-4">
                            <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <input ref={expenseInputRef} type="text" placeholder="Category (e.g., Rent, Salaries)" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <input type="number" placeholder="Amount" value={expenseForm.amount || ''} onChange={e => setExpenseForm({...expenseForm, amount: parseFloat(e.target.value) || 0})} required min="0.01" step="0.01" className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <textarea placeholder="Note (Optional)" value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm, note: e.target.value})} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <button type="submit" className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600">Save Cash Out</button>
                        </div>
                    </form>
                </Modal>

                <ConfirmationModal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} onConfirm={handleDelete} title="Confirm Deletion" message="Are you sure you want to delete this record? This action cannot be undone." confirmText="Delete" />
            </div>
        </div>
    );
};

export default IncomeAndExpenditurePage;
