
import React, { useState, FC, useMemo, useEffect, useRef } from 'react';
// Fix: Import useAppContext from types.ts to avoid circular dependency with App.tsx
import { useAppContext } from '../types';
import { Card, Modal, ConfirmationModal, EmptyState, Pagination } from '../components/ui';
import { CashIn, CashOut, EditLog } from '../types';
import { PlusIcon, EditIcon, TrashIcon, IncomeIcon, EyeIcon, EyeSlashIcon, DownloadIcon, PrinterIcon, LockClosedIcon, CalculatorIcon } from '../components/icons';
import FinancialReportView, { ReportTable } from '../components/FinancialReportView';
import ReceiptView, { ReceiptData } from '../components/ReceiptView';
import CashCountModal from '../components/CashCountModal';

const getISODateString = (date: Date) => date.toISOString().split('T')[0];
const ITEMS_PER_PAGE = 10;

const CashFlowPage: FC = () => {
    const { api, branches, agents, cashIns, cashOuts, fetchCashFlowData, fetchManagementData, fetchTransactions, formatCurrency, showToast, settings, currentUser, lockDate } = useAppContext();
    const [isCashInModalOpen, setIsCashInModalOpen] = useState(false);
    const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isCashCountModalOpen, setIsCashCountModalOpen] = useState(false);
    const [cashCountTarget, setCashCountTarget] = useState<'in' | 'out'>('in');
    
    const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'cashIn' | 'cashOut' } | null>(null);
    
    // SINGLE DATE SELECTION
    const [selectedDate, setSelectedDate] = useState(getISODateString(new Date()));

    const [editingCashIn, setEditingCashIn] = useState<CashIn | null>(null);
    const [editingCashOut, setEditingCashOut] = useState<CashOut | null>(null);
    const [viewingHistory, setViewingHistory] = useState<{ recordType: string; record: CashIn | CashOut } | null>(null);
    
    const cashInInputRef = useRef<HTMLInputElement>(null);
    const cashOutInputRef = useRef<HTMLSelectElement>(null);

    const [cashInCurrentPage, setCashInCurrentPage] = useState(1);
    const [cashOutCurrentPage, setCashOutCurrentPage] = useState(1);

    const [isCashInVisible, setIsCashInVisible] = useState(true);
    const [isCashOutVisible, setIsCashOutVisible] = useState(true);

    // Print & PDF States
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [reportData, setReportData] = useState<{ tables: ReportTable[], summary: any[] } | null>(null);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

    const hasWriteAccess = currentUser?.role !== 'Clerk';

    // Moved state definitions up here to resolve "used before declaration" error
    const initialCashInState: Omit<CashIn, 'id' | 'editHistory' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'companyId'> = { date: selectedDate, amount: 0, source: '', note: '' };
    const [cashInForm, setCashInForm] = useState(initialCashInState);
    
    const initialCashOutState: Omit<CashOut, 'id' | 'editHistory' | 'createdAt' | 'createdByUserId' | 'createdByName' | 'companyId'> = { date: selectedDate, entityId: '', entityType: 'agent', amount: 0, note: '' };
    const [cashOutForm, setCashOutForm] = useState(initialCashOutState);

    // Lock logic
    const isRecordLocked = (date: string) => {
        if (!lockDate) return false;
        return date <= lockDate;
    };
    
    useEffect(() => {
        // Fetch data required for this page
        Promise.all([
            fetchCashFlowData(),
            fetchManagementData() // For entity names in dropdowns and tables
        ]);
    }, [fetchCashFlowData, fetchManagementData]);

    // Update form dates when selection changes
    useEffect(() => {
        setCashInForm(prev => ({ ...prev, date: selectedDate }));
        setCashOutForm(prev => ({ ...prev, date: selectedDate }));
    }, [selectedDate]);

    useEffect(() => {
        setCashInCurrentPage(1);
        setCashOutCurrentPage(1);
    }, [selectedDate]);

    useEffect(() => {
        if (isCashInModalOpen) {
            setTimeout(() => cashInInputRef.current?.focus(), 100);
        }
    }, [isCashInModalOpen]);

    useEffect(() => {
        if (isCashOutModalOpen) {
            setTimeout(() => cashOutInputRef.current?.focus(), 100);
        }
    }, [isCashOutModalOpen]);

    const cashOutEntityList = useMemo(() => {
        const list = cashOutForm.entityType === 'branch' ? branches : agents;
        return list.filter(e => e.isActive);
    }, [cashOutForm.entityType, branches, agents]);

    // Filter strictly by the selected date
    const filteredCashIns = useMemo(() => cashIns.filter(ci => ci.date === selectedDate), [cashIns, selectedDate]);
    const filteredCashOuts = useMemo(() => cashOuts.filter(co => co.date === selectedDate), [cashOuts, selectedDate]);
    
    const cashInTotalPages = Math.ceil(filteredCashIns.length / ITEMS_PER_PAGE);
    const paginatedCashIns = useMemo(() => {
        const startIndex = (cashInCurrentPage - 1) * ITEMS_PER_PAGE;
        return filteredCashIns.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredCashIns, cashInCurrentPage]);

    const cashOutTotalPages = Math.ceil(filteredCashOuts.length / ITEMS_PER_PAGE);
    const paginatedCashOuts = useMemo(() => {
        const startIndex = (cashOutCurrentPage - 1) * ITEMS_PER_PAGE;
        return filteredCashOuts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredCashOuts, cashOutCurrentPage]);

    const summary = useMemo(() => {
        // Opening = Sum of all history BEFORE this date
        const priorCashIn = cashIns
            .filter(ci => ci.date < selectedDate)
            .reduce((sum, ci) => sum + ci.amount, 0);
        const priorCashOut = cashOuts
            .filter(co => co.date < selectedDate)
            .reduce((sum, co) => sum + co.amount, 0);
        const openingBalance = priorCashIn - priorCashOut;
        
        // Current Day
        const totalCashIn = filteredCashIns.reduce((sum, ci) => sum + ci.amount, 0);
        const totalCashOut = filteredCashOuts.reduce((sum, co) => sum + co.amount, 0);

        const closingBalance = openingBalance + totalCashIn - totalCashOut;

        return { openingBalance, totalCashIn, totalCashOut, closingBalance };
    }, [cashIns, cashOuts, filteredCashIns, filteredCashOuts, selectedDate]);

    
    const handleSaveCashIn = async () => {
        if (isRecordLocked(cashInForm.date)) {
             showToast('Cannot save: This date is locked.', "error");
             return;
        }
        if (cashInForm.amount <= 0 || !cashInForm.source) {
            showToast('Please provide a valid amount and source.', "error");
            return;
        }
        if (!currentUser) return;
        try {
            if (editingCashIn) {
                await api.updateCashIn(currentUser.companyId, currentUser, { ...editingCashIn, ...cashInForm });
                showToast('Cash In record updated!', 'success');
            } else {
                await api.addCashIn(currentUser.companyId, currentUser, cashInForm);
                showToast('Cash In recorded!', 'success');
            }
            await fetchCashFlowData();
            setIsCashInModalOpen(false);
        } catch (error: any) {
            showToast(error.message || 'Failed to save record.', 'error');
        }
    };

    const handleSaveCashOut = async () => {
        if (isRecordLocked(cashOutForm.date)) {
             showToast('Cannot save: This date is locked.', "error");
             return;
        }
        if (cashOutForm.amount <= 0 || !cashOutForm.entityId) {
            showToast('Please select an entity and provide a valid amount.', "error");
            return;
        }
        if (!currentUser) return;
        try {
            if (editingCashOut) {
                await api.updateCashOut(currentUser.companyId, currentUser, { ...editingCashOut, ...cashOutForm });
                showToast('Cash Out record updated!', 'success');
            } else {
                await api.addCashOut(currentUser.companyId, currentUser, cashOutForm);
                showToast('Cash Out distributed!', 'success');
            }
            await Promise.all([fetchCashFlowData(), fetchTransactions()]);
            setIsCashOutModalOpen(false);
        } catch (error: any) {
            showToast(error.message || 'Failed to save record.', 'error');
        }
    };
    
    const openDeleteConfirmation = (id: string, type: 'cashIn' | 'cashOut', date: string) => {
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
            if (itemToDelete.type === 'cashIn') {
                await api.deleteCashIn(currentUser.companyId, currentUser, itemToDelete.id);
                showToast('Cash In record deleted.', 'success');
            } else {
                await api.deleteCashOut(currentUser.companyId, currentUser, itemToDelete.id);
                showToast('Cash Out record deleted.', 'success');
            }
            await Promise.all([fetchCashFlowData(), fetchTransactions()]);
        } catch (error: any) {
            showToast(error.message || 'Failed to delete record.', 'error');
            console.error(error);
        } finally {
            setIsConfirmModalOpen(false);
            setItemToDelete(null);
        }
    };
    
    const handleOpenAddCashInModal = () => { setEditingCashIn(null); setCashInForm({ ...initialCashInState, date: selectedDate }); setIsCashInModalOpen(true); };
    const handleOpenEditCashInModal = (record: CashIn) => { setEditingCashIn(record); setCashInForm({ date: record.date, amount: record.amount, source: record.source, note: record.note }); setIsCashInModalOpen(true); };
    const handleOpenAddCashOutModal = () => { setEditingCashOut(null); setCashOutForm({ ...initialCashOutState, date: selectedDate }); setIsCashOutModalOpen(true); };
    const handleOpenEditCashOutModal = (record: CashOut) => { setEditingCashOut(record); setCashOutForm({ date: record.date, amount: record.amount, entityId: record.entityId, entityType: record.entityType, note: record.note }); setIsCashOutModalOpen(true); };
    const handleOpenHistoryModal = (record: CashIn | CashOut, recordType: 'Cash In' | 'Cash Out') => { setViewingHistory({ recordType, record }); setIsHistoryModalOpen(true); };

    const handleOpenCashCount = (target: 'in' | 'out') => {
        setCashCountTarget(target);
        setIsCashCountModalOpen(true);
    };

    const handleCashCountConfirm = (total: number) => {
        if (cashCountTarget === 'in') {
            setCashInForm(prev => ({ ...prev, amount: total }));
        } else {
            setCashOutForm(prev => ({ ...prev, amount: total }));
        }
    };

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

    
    // --- Receipt Generation ---
    const handlePrintReceipt = (type: 'in' | 'out', record: any) => {
        let data: ReceiptData;
        
        if (type === 'in') {
            const r = record as CashIn;
            data = {
                title: 'Cash In Receipt',
                date: r.createdAt || r.date,
                details: [
                    { label: 'Source', value: r.source },
                    { label: 'Amount', value: formatCurrency(r.amount), bold: true },
                ],
                totalAmount: formatCurrency(r.amount),
                note: r.note
            };
        } else {
            const r = record as CashOut;
            const entity = r.entityType === 'branch' ? branches.find(b => b.id === r.entityId) : agents.find(a => a.id === r.entityId);
            data = {
                title: 'Cash Out Receipt',
                date: r.createdAt || r.date,
                entityName: entity?.name || 'Unknown',
                details: [
                    { label: 'Entity Type', value: r.entityType },
                    { label: 'Amount', value: formatCurrency(r.amount), bold: true },
                ],
                totalAmount: formatCurrency(r.amount),
                note: r.note
            };
        }
        setReceiptData(data);
    };

    // --- Print & PDF Logic (Standard Report) ---
    const generateReportData = () => {
        const cashInTable: ReportTable = {
            title: 'Cash In Records',
            columns: ['Date', 'Source', 'Note', 'Amount'],
            rows: filteredCashIns.map(ci => [
                new Date(ci.date).toLocaleDateString(),
                ci.source,
                ci.note || '-',
                formatCurrency(ci.amount)
            ])
        };
        const cashOutTable: ReportTable = {
            title: 'Cash Out Records',
            columns: ['Date', 'To Entity', 'Note', 'Amount'],
            rows: filteredCashOuts.map(co => {
                const entity = co.entityType === 'branch' ? branches.find(b => b.id === co.entityId) : agents.find(a => a.id === co.entityId);
                return [
                    new Date(co.date).toLocaleDateString(),
                    entity ? `${entity.name} (${co.entityType})` : 'Unknown',
                    co.note || '-',
                    formatCurrency(co.amount)
                ];
            })
        };
        
        const summaryData = [
            { label: 'Opening Balance', value: formatCurrency(summary.openingBalance) },
            { label: 'Total Cash In', value: formatCurrency(summary.totalCashIn), color: 'text-green-600' },
            { label: 'Total Cash Out', value: formatCurrency(summary.totalCashOut), color: 'text-orange-500' },
            { label: 'Closing Balance', value: formatCurrency(summary.closingBalance), color: summary.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600' },
        ];
        
        setReportData({ tables: [cashInTable, cashOutTable], summary: summaryData });
    };

    const handlePrint = () => {
        generateReportData();
    };
    
    const handleExportPDF = () => {
        generateReportData();
        setIsExportingPDF(true);
    };

    // --- CSV Export Logic ---
    const handleExportCashInCSV = () => {
        if (!window.Papa) {
            showToast("CSV export library not loaded.", "error");
            return;
        }
        const dataToExport = filteredCashIns.map(({ date, source, note, amount }) => ({
            Date: date,
            Source: source,
            Note: note,
            Amount: amount,
        }));
        const csv = window.Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `capital-cash-in_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportCashOutCSV = () => {
        if (!window.Papa) {
            showToast("CSV export library not loaded.", "error");
            return;
        }
        const allEntities = [...branches, ...agents];
        const dataToExport = filteredCashOuts.map(({ date, entityId, entityType, note, amount }) => {
            const entity = allEntities.find(e => e.id === entityId);
            return {
                Date: date,
                "Entity Name": entity ? entity.name : 'Unknown',
                "Entity Type": entityType,
                Note: note,
                Amount: amount,
            };
        });
        const csv = window.Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `capital-cash-out_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Effect for Printing (Report)
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
                const element = document.getElementById('financial-report-pdf-target');
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
                    doc.save(`report-${selectedDate}.pdf`);
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
            {/* NEW: Interactive Receipt Modal */}
            {receiptData && settings && (
                <ReceiptView 
                    data={receiptData} 
                    settings={settings} 
                    onClose={() => setReceiptData(null)} 
                />
            )}

            <div className="print-only-container">
                {reportData && settings && (
                     <FinancialReportView
                        title="Capital Management Report"
                        dateRangeText={`Date: ${new Date(selectedDate).toLocaleDateString()}`}
                        settings={settings}
                        tables={reportData.tables}
                        summary={reportData.summary}
                        isForPrint={true}
                    />
                )}
            </div>
            
            <div className="pdf-render-container" style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                {isExportingPDF && reportData && settings && (
                     <div id="financial-report-pdf-target" style={{ width: '210mm', minHeight: '297mm', padding: '10mm', background: 'white' }}>
                        <FinancialReportView
                            title="Capital Management Report"
                            dateRangeText={`Date: ${new Date(selectedDate).toLocaleDateString()}`}
                            settings={settings}
                            tables={reportData.tables}
                            summary={reportData.summary}
                            isForPrint={true}
                        />
                    </div>
                )}
            </div>

            <div className="screen-only space-y-6">
                 <Card>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
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
                             <button onClick={handleExportCashInCSV} disabled={isExportingPDF} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 text-sm">
                                <DownloadIcon className="w-4 h-4" /> CSV (In)
                            </button>
                            <button onClick={handleExportCashOutCSV} disabled={isExportingPDF} className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 text-sm">
                                <DownloadIcon className="w-4 h-4" /> CSV (Out)
                            </button>
                            <button onClick={handlePrint} disabled={isExportingPDF} className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:bg-slate-400 text-sm">Print Report</button>
                            <button onClick={handleExportPDF} disabled={isExportingPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400 text-sm">PDF</button>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Opening Balance</h3><p className="text-3xl font-bold text-primary-600">{formatCurrency(summary.openingBalance)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Total Cash In (Today)</h3><p className="text-3xl font-bold text-green-600">{formatCurrency(summary.totalCashIn)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Total Cash Out (Today)</h3><p className="text-3xl font-bold text-orange-500">{formatCurrency(summary.totalCashOut)}</p></Card>
                    <Card className="interactive-card"><h3 className="text-slate-500 dark:text-slate-400">Closing Balance</h3><p className={`text-3xl font-bold ${summary.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(summary.closingBalance)}</p></Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-2">
                        <Card className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Cash In (Capital)</h2>
                                {hasWriteAccess && <button onClick={handleOpenAddCashInModal} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"><PlusIcon className="w-5 h-5" /> Add Cash In</button>}
                            </div>
                            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isCashInVisible ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                {filteredCashIns.length > 0 ? (
                                    <>
                                        <div className="overflow-x-auto flex-grow">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b dark:border-slate-700">
                                                        <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                                        <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                                                        <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                                                        <th className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedCashIns.map((item, index) => (
                                                        <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                                            <td className="p-2 text-slate-700 dark:text-slate-300">{new Date(item.date).toLocaleDateString()}</td>
                                                            <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{item.source}</td>
                                                            <td className="p-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(item.amount)}</td>
                                                            <td className="p-2 text-center flex justify-center gap-1">
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => isRecordLocked(item.date) ? showToast('Record is locked', 'error') : handleOpenEditCashInModal(item)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-primary-600'}`} title="Edit"><EditIcon className="w-5 h-5" /></button>
                                                                )}
                                                                {hasWriteAccess && (
                                                                    <button onClick={() => openDeleteConfirmation(item.id, 'cashIn', item.date)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-red-600'}`} title="Delete"><TrashIcon className="w-5 h-5" /></button>
                                                                )}
                                                                <button onClick={() => handlePrintReceipt('in', item)} className="text-slate-500 hover:text-blue-600 p-1" title="Print Receipt" aria-label="Print receipt"><PrinterIcon className="w-5 h-5" /></button>
                                                                {isRecordLocked(item.date) && <LockClosedIcon className="w-4 h-4 text-red-400" />}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <Pagination currentPage={cashInCurrentPage} totalPages={cashInTotalPages} onPageChange={setCashInCurrentPage} />
                                    </>
                                ) : (
                                    <EmptyState icon={<IncomeIcon className="w-12 h-12" />} title="No Cash In Records" message="No capital injections found for this date." action={hasWriteAccess ? <button onClick={handleOpenAddCashInModal} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 mx-auto"><PlusIcon className="w-5 h-5" /> Add First Cash In</button> : undefined} />
                                )}
                            </div>
                        </Card>
                        <div className="flex justify-center">
                            <button onClick={() => setIsCashInVisible(prev => !prev)} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                {isCashInVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                <span>{isCashInVisible ? 'Hide Cash In' : 'Show Cash In'}</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Card className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Cash Out (Distribution)</h2>
                                {hasWriteAccess && <button onClick={handleOpenAddCashOutModal} className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-600"><PlusIcon className="w-5 h-5" /> Add Cash Out</button>}
                            </div>
                            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isCashOutVisible ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                {filteredCashOuts.length > 0 ? (
                                    <>
                                        <div className="overflow-x-auto flex-grow">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b dark:border-slate-700">
                                                        <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                                        <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">To Entity</th>
                                                        <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                                                        <th className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedCashOuts.map((item, index) => {
                                                        const entity = item.entityType === 'branch' ? branches.find(b => b.id === item.entityId) : agents.find(a => a.id === item.entityId);
                                                        return (
                                                            <tr key={item.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                                                <td className="p-2 text-slate-700 dark:text-slate-300">{new Date(item.date).toLocaleDateString()}</td>
                                                                <td className="p-2 font-medium text-slate-800 dark:text-slate-200">
                                                                    {entity ? entity.name : 'Unknown'} <span className="text-xs text-slate-500">({item.entityType})</span>
                                                                </td>
                                                                <td className="p-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(item.amount)}</td>
                                                                <td className="p-2 text-center flex justify-center gap-1">
                                                                    {hasWriteAccess && (
                                                                         <button onClick={() => isRecordLocked(item.date) ? showToast('Record is locked', 'error') : handleOpenEditCashOutModal(item)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-primary-600'}`} title="Edit"><EditIcon className="w-5 h-5" /></button>
                                                                    )}
                                                                    {hasWriteAccess && (
                                                                        <button onClick={() => openDeleteConfirmation(item.id, 'cashOut', item.date)} className={`text-slate-500 p-1 ${isRecordLocked(item.date) ? 'opacity-50 cursor-not-allowed' : 'hover:text-red-600'}`} title="Delete"><TrashIcon className="w-5 h-5" /></button>
                                                                    )}
                                                                    <button onClick={() => handlePrintReceipt('out', item)} className="text-slate-500 hover:text-blue-600 p-1" title="Print Receipt" aria-label="Print receipt"><PrinterIcon className="w-5 h-5" /></button>
                                                                    {isRecordLocked(item.date) && <LockClosedIcon className="w-4 h-4 text-red-400" />}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <Pagination currentPage={cashOutCurrentPage} totalPages={cashOutTotalPages} onPageChange={setCashOutCurrentPage} />
                                    </>
                                ) : (
                                    <EmptyState icon={<IncomeIcon className="w-12 h-12" />} title="No Cash Out Records" message="No distributions recorded for this date." action={hasWriteAccess ? <button onClick={handleOpenAddCashOutModal} className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-600 mx-auto"><PlusIcon className="w-5 h-5" /> Distribute First Cash</button> : undefined} />
                                )}
                            </div>
                        </Card>
                        <div className="flex justify-center">
                             <button onClick={() => setIsCashOutVisible(prev => !prev)} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                {isCashOutVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                <span>{isCashOutVisible ? 'Hide Cash Out' : 'Show Cash Out'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <Modal isOpen={isCashInModalOpen} onClose={() => setIsCashInModalOpen(false)} title={editingCashIn ? "Edit Cash In" : "Add Cash In"}>
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveCashIn(); }}>
                        <div className="space-y-4">
                            <input type="date" value={cashInForm.date} onChange={e => setCashInForm({...cashInForm, date: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <div className="flex gap-2">
                                <input ref={cashInInputRef} type="number" placeholder="Amount" value={cashInForm.amount || ''} onChange={e => setCashInForm({...cashInForm, amount: parseFloat(e.target.value) || 0})} required min="0.01" step="0.01" className="flex-1 p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                                <button type="button" onClick={() => handleOpenCashCount('in')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600" title="Count Cash"><CalculatorIcon className="w-5 h-5" /></button>
                            </div>
                            <input type="text" placeholder="Source (e.g., Bank Withdrawal)" value={cashInForm.source} onChange={e => setCashInForm({...cashInForm, source: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <textarea placeholder="Note (Optional)" value={cashInForm.note} onChange={e => setCashInForm({...cashInForm, note: e.target.value})} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">Save Cash In</button>
                        </div>
                    </form>
                </Modal>
                
                <Modal isOpen={isCashOutModalOpen} onClose={() => setIsCashOutModalOpen(false)} title={editingCashOut ? "Edit Cash Out" : "Distribute Cash Out"}>
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveCashOut(); }}>
                        <div className="space-y-4">
                            <input type="date" value={cashOutForm.date} onChange={e => setCashOutForm({...cashOutForm, date: e.target.value})} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                             <div className="grid grid-cols-2 gap-4">
                                <select value={cashOutForm.entityType} onChange={e => setCashOutForm({ ...cashOutForm, entityType: e.target.value as any, entityId: '' })} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                                    <option value="agent">Agent</option>
                                    <option value="branch">Branch</option>
                                </select>
                                <select ref={cashOutInputRef} value={cashOutForm.entityId} onChange={e => setCashOutForm({ ...cashOutForm, entityId: e.target.value })} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                                    <option value="">Select Entity</option>
                                    {cashOutEntityList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <input type="number" placeholder="Amount" value={cashOutForm.amount || ''} onChange={e => setCashOutForm({...cashOutForm, amount: parseFloat(e.target.value) || 0})} required min="0.01" step="0.01" className="flex-1 p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                                <button type="button" onClick={() => handleOpenCashCount('out')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600" title="Count Cash"><CalculatorIcon className="w-5 h-5" /></button>
                            </div>
                            <textarea placeholder="Note (Optional)" value={cashOutForm.note} onChange={e => setCashOutForm({...cashOutForm, note: e.target.value})} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            <button type="submit" className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600">Save Cash Out</button>
                        </div>
                    </form>
                </Modal>

                <CashCountModal 
                    isOpen={isCashCountModalOpen}
                    onClose={() => setIsCashCountModalOpen(false)}
                    onConfirm={handleCashCountConfirm}
                />

                <ConfirmationModal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} onConfirm={handleDelete} title="Confirm Deletion" message="Are you sure you want to delete this record? This action cannot be undone." confirmText="Delete" />
            </div>
        </div>
    );
};

export default CashFlowPage;
