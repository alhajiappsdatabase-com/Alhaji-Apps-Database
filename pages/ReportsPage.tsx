
import React, { FC, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, Spinner, MultiSearchableSelect, SearchableSelect } from '../components/ui';
import { useAppContext } from '../types';
import { Branch, Agent, ServiceType, Settings, CommissionSummaryItem, Transaction } from '../types';
import CommissionReportView from '../components/CommissionReportView';
import FinancialReportView, { ReportTable } from '../components/FinancialReportView';
import { DownloadIcon, FileExcelIcon, PrinterIcon, CloseIcon, LoadingSpinnerIcon } from '../components/icons';

const serviceTypes: ServiceType[] = ['ria', 'moneyGram', 'westernUnion', 'afro'];

const serviceNames: Record<ServiceType, string> = {
    ria: 'Ria', moneyGram: 'MoneyGram', westernUnion: 'Western Union', afro: 'Afro'
};

type ReportType = 'dailyBalance' | 'commission';

type DailyBalanceReportItem = {
    entityType: 'Branch' | 'Agent'; id: string; name: string; openingBalance: number;
    cashReceived: number; cashPaid: number; closingBalance: number;
};

type MonthlyStatementItem = {
    date: string;
    ria: number;
    moneyGram: number;
    westernUnion: number;
    afro: number;
    totalPaid: number;
};

type CommissionReportData = {
    entityId: string;
    entityName: string;
    entityType: 'Branch' | 'Agent';
    monthlyData: {
        [monthYear: string]: {
            totalNonAfro: number;
            totalAfro: number;
            totalPayment: number;
            monthlyCommission: number;
        }
    }
}[];

type ReportForPrinting = {
    summary: CommissionSummaryItem;
    entity: Branch | Agent;
};


const ReportsPage: FC = () => {
    const { api, branches, agents, cashOuts, settings, formatCurrency, showToast, currentUser, fetchTransactions, fetchManagementData } = useAppContext();
    const [activeReport, setActiveReport] = useState<ReportType>('dailyBalance');
    const [isGenerating, setIsGenerating] = useState(false);

    // Daily Balance States
    const [balanceViewMode, setBalanceViewMode] = useState<'daily' | 'monthly'>('daily');
    const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedBalanceEntities, setSelectedBalanceEntities] = useState<string[]>([]);
    const [balanceReportData, setBalanceReportData] = useState<DailyBalanceReportItem[] | null>(null);
    
    // Monthly Statement States
    const [monthlyStatementEntityType, setMonthlyStatementEntityType] = useState<'branch' | 'agent'>('agent');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [selectedStatementEntityId, setSelectedStatementEntityId] = useState<string>('');
    const [monthlyStatementData, setMonthlyStatementData] = useState<{ entityName: string; items: MonthlyStatementItem[] } | null>(null);

    const [dailyBalancePrintData, setDailyBalancePrintData] = useState<{ tables: ReportTable[], summary: any[], title: string, dateText: string } | null>(null);
    const [isExportingDailyBalancePDF, setIsExportingDailyBalancePDF] = useState(false);


    // Commission States
    const [commissionStartDate, setCommissionStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
    const [commissionEndDate, setCommissionEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
    const [commissionReportData, setCommissionReportData] = useState<CommissionReportData | null>(null); // Full data for printing
    const [commissionSummaryData, setCommissionSummaryData] = useState<CommissionSummaryItem[] | null>(null); // Summary for UI table
    const [selectedForPrinting, setSelectedForPrinting] = useState<string[]>([]); // IDs of entities selected for printing
    const [reportsForPrinting, setReportsForPrinting] = useState<ReportForPrinting[] | null>(null); // Data passed to the print view
    const [reportsForPDF, setReportsForPDF] = useState<ReportForPrinting[] | null>(null); // Data for hidden PDF rendering
    const [isExportingPDF, setIsExportingPDF] = useState(false);

    // Ref for coordinating QR code rendering before PDF generation
    const qrRenderedCount = useRef(0);
    const totalReportsForPdf = useRef(0);

    useEffect(() => {
        // Reports need transactions and entity data
        fetchTransactions();
        fetchManagementData();
    }, [fetchTransactions, fetchManagementData]);

    const entityOptions = useMemo(() => [
        ...branches.map(b => ({ id: b.id, name: `${b.name} (Branch)` })),
        ...agents.map(a => ({ id: a.id, name: `${a.name} (Agent)` }))
    ], [branches, agents]);

    const filteredSingleEntityOptions = useMemo(() => {
        const list = monthlyStatementEntityType === 'branch' ? branches : agents;
        return list.map(e => ({ id: e.id, name: e.name }));
    }, [monthlyStatementEntityType, branches, agents]);
    
    // --- Daily Balance Logic ---
    const handleGenerateBalanceReport = useCallback(async () => {
        setIsGenerating(true);
        setBalanceReportData(null);
        setDailyBalancePrintData(null);
        setMonthlyStatementData(null);
        if (!currentUser) {
            setIsGenerating(false);
            return;
        }

        try {
            // Fetch precise transactions for this date from the server to guarantee accuracy
            // Using existing API call mechanism but targeting a single day range
            const dayTransactions = await api.getTransactionsByRange(currentUser.companyId, balanceDate, balanceDate);

            const allEntities = [...branches.map(b => ({ ...b, type: 'branch' as 'branch' | 'agent' })), ...agents.map(a => ({ ...a, type: 'agent' as 'branch' | 'agent' }))];
            
            const entitiesToProcess = selectedBalanceEntities.length > 0 
                ? allEntities.filter(e => selectedBalanceEntities.includes(e.id))
                : allEntities;

            const dailyBalances = await Promise.all(
                entitiesToProcess.map(async (entity): Promise<DailyBalanceReportItem> => {
                    const txOnDate = dayTransactions.find(t => t.entityId === entity.id && t.date === balanceDate);
                    // Fix: Ensure entityType is correctly capitalized to match DailyBalanceReportItem type.
                    const entityType: 'Branch' | 'Agent' = entity.type === 'branch' ? 'Branch' : 'Agent';
                    if (txOnDate) {
                        return { entityType, id: entity.id, name: entity.name, openingBalance: txOnDate.openingBalance, cashReceived: txOnDate.cashReceived, cashPaid: txOnDate.totalCashPaid, closingBalance: txOnDate.closingBalance };
                    } else {
                        const { openingBalance, cashReceived } = await api.getOpeningDataForEntity(currentUser.companyId, entity.id, entity.type, balanceDate);
                        return { entityType, id: entity.id, name: entity.name, openingBalance: openingBalance, cashReceived: cashReceived, cashPaid: 0, closingBalance: openingBalance + cashReceived };
                    }
                })
            );
            setTimeout(() => { setBalanceReportData(dailyBalances); setIsGenerating(false); }, 300);
        } catch (error) { console.error("Error generating report:", error); setIsGenerating(false); }
    }, [balanceDate, branches, agents, selectedBalanceEntities, currentUser, api]);

    const handleGenerateMonthlyStatement = useCallback(async () => {
        if (!selectedStatementEntityId || !currentUser) {
            alert("Please select an entity");
            return;
        }
        setIsGenerating(true);
        setBalanceReportData(null);
        setDailyBalancePrintData(null);
        setMonthlyStatementData(null);

        try {
            const entity = [...branches, ...agents].find(e => e.id === selectedStatementEntityId);
            if (!entity) throw new Error("Entity not found");

            const [year, month] = selectedMonth.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed here effectively
            
            // Calculate date range
            const startDate = `${selectedMonth}-01`;
            const endDate = `${selectedMonth}-${daysInMonth}`;

            // Fetch transactions from server for full history accuracy
            const monthTransactions = await api.getTransactionsByRange(currentUser.companyId, startDate, endDate);

            const statementItems: MonthlyStatementItem[] = [];
            
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                
                // Find transaction for this day
                const tx = monthTransactions.find(t => t.entityId === selectedStatementEntityId && t.date === dateStr);
                
                const ria = tx?.cashPaidByService.ria?.total || 0;
                const moneyGram = tx?.cashPaidByService.moneyGram?.total || 0;
                const westernUnion = tx?.cashPaidByService.westernUnion?.total || 0;
                const afro = tx?.cashPaidByService.afro?.total || 0;
                const totalPaid = ria + moneyGram + westernUnion + afro;

                statementItems.push({
                    date: dateStr,
                    ria,
                    moneyGram,
                    westernUnion,
                    afro,
                    totalPaid
                });
            }

            setTimeout(() => { 
                setMonthlyStatementData({ entityName: entity.name, items: statementItems }); 
                setIsGenerating(false); 
            }, 300);

        } catch (error) {
            console.error("Error generating monthly statement:", error);
            showToast("Failed to generate statement", "error");
            setIsGenerating(false);
        }
    }, [selectedStatementEntityId, selectedMonth, branches, agents, currentUser, api, showToast]);

    const prepareDailyBalancePrintData = () => {
        if (balanceViewMode === 'daily' && balanceReportData) {
            const totalOpening = balanceReportData.reduce((sum, item) => sum + item.openingBalance, 0);
            const totalReceived = balanceReportData.reduce((sum, item) => sum + item.cashReceived, 0);
            const totalPaid = balanceReportData.reduce((sum, item) => sum + item.cashPaid, 0);
            const totalClosing = balanceReportData.reduce((sum, item) => sum + item.closingBalance, 0);

            const table: ReportTable = {
                title: 'Entities Breakdown',
                columns: ['Type', 'Name', 'Opening', 'Received', 'Paid', 'Closing'],
                rows: balanceReportData.map(item => [
                    item.entityType,
                    item.name,
                    formatCurrency(item.openingBalance),
                    formatCurrency(item.cashReceived),
                    formatCurrency(item.cashPaid),
                    formatCurrency(item.closingBalance)
                ])
            };

            const summary = [
                { label: 'Total Opening', value: formatCurrency(totalOpening) },
                { label: 'Total Received', value: formatCurrency(totalReceived), color: 'text-green-600' },
                { label: 'Total Paid', value: formatCurrency(totalPaid), color: 'text-red-600' },
                { label: 'Total Closing', value: formatCurrency(totalClosing), color: 'text-blue-600' }
            ];

            return { tables: [table], summary, title: `Daily Balance Report`, dateText: `Date: ${new Date(balanceDate).toLocaleDateString()}` };
        } 
        else if (balanceViewMode === 'monthly' && monthlyStatementData) {
             const totalRia = monthlyStatementData.items.reduce((sum, item) => sum + item.ria, 0);
             const totalMoneyGram = monthlyStatementData.items.reduce((sum, item) => sum + item.moneyGram, 0);
             const totalWesternUnion = monthlyStatementData.items.reduce((sum, item) => sum + item.westernUnion, 0);
             const totalAfro = monthlyStatementData.items.reduce((sum, item) => sum + item.afro, 0);
             const totalOverall = monthlyStatementData.items.reduce((sum, item) => sum + item.totalPaid, 0);
             
             const table: ReportTable = {
                title: 'Daily Service Payment Breakdown',
                columns: ['Date', 'Ria', 'MoneyGram', 'Western Union', 'Afro', 'Total Paid'],
                rows: monthlyStatementData.items.map(item => [
                    new Date(item.date.replace(/-/g, '\/')).toLocaleDateString(),
                    item.ria > 0 ? formatCurrency(item.ria) : '-',
                    item.moneyGram > 0 ? formatCurrency(item.moneyGram) : '-',
                    item.westernUnion > 0 ? formatCurrency(item.westernUnion) : '-',
                    item.afro > 0 ? formatCurrency(item.afro) : '-',
                    item.totalPaid > 0 ? formatCurrency(item.totalPaid) : '-'
                ])
            };

            const summary = [
                { label: 'Total Ria', value: formatCurrency(totalRia) },
                { label: 'Total MoneyGram', value: formatCurrency(totalMoneyGram) },
                { label: 'Total Western Union', value: formatCurrency(totalWesternUnion) },
                { label: 'Total Afro', value: formatCurrency(totalAfro) },
                { label: 'Total All Services', value: formatCurrency(totalOverall), color: 'text-blue-600' }
            ];
            
            // Format Month String "2023-10" -> "October 2023"
            const [y, m] = selectedMonth.split('-');
            const dateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
            const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

            return { tables: [table], summary, title: `Monthly Payment Report - ${monthlyStatementData.entityName}`, dateText: `Period: ${monthName}` };
        }
        return null;
    };

    const handlePrintDailyBalance = () => {
        const data = prepareDailyBalancePrintData();
        if (data) {
            setDailyBalancePrintData(data);
        }
    };

    const handleExportPDFDailyBalance = () => {
        const data = prepareDailyBalancePrintData();
        if (data) {
            setDailyBalancePrintData(data);
            setIsExportingDailyBalancePDF(true);
        }
    };

    const handleExportExcelDailyBalance = () => {
        if (!window.XLSX) {
            showToast("Excel export library not loaded.", "error");
            return;
        }
        
        if (balanceViewMode === 'daily' && balanceReportData) {
            const data = balanceReportData.map(item => ({
                Type: item.entityType,
                Name: item.name,
                Opening: item.openingBalance,
                Received: item.cashReceived,
                Paid: item.cashPaid,
                Closing: item.closingBalance
            }));
            const ws = window.XLSX.utils.json_to_sheet(data);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, "Daily Balance");
            window.XLSX.writeFile(wb, `daily-balance-${balanceDate}.xlsx`);
        } else if (balanceViewMode === 'monthly' && monthlyStatementData) {
             const data = monthlyStatementData.items.map(item => ({
                Date: item.date,
                Ria: item.ria,
                MoneyGram: item.moneyGram,
                WesternUnion: item.westernUnion,
                Afro: item.afro,
                TotalPaid: item.totalPaid
            }));
            const ws = window.XLSX.utils.json_to_sheet(data);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, "Monthly Statement");
            window.XLSX.writeFile(wb, `monthly-statement-${monthlyStatementData.entityName}-${selectedMonth}.xlsx`);
        }
    };


    // --- Commission Logic ---
    const handleGenerateCommissionReport = useCallback(async () => {
        if (!settings || !currentUser) return;
        setIsGenerating(true); setCommissionSummaryData(null); setCommissionReportData(null);
        try {
            // Fetch Transactions from Server for accurate range
            const txsInRange = await api.getTransactionsByRange(currentUser.companyId, commissionStartDate, commissionEndDate);

            const entitiesToProcess: (Branch | Agent)[] = selectedEntities.length === 0
                ? [...branches, ...agents]
                : [...branches, ...agents].filter(e => selectedEntities.includes(e.id));
            
            const reportData: CommissionReportData = entitiesToProcess.map(entity => {
                const entityTxs = txsInRange.filter(t => t.entityId === entity.id);
                const monthlyData: CommissionReportData[0]['monthlyData'] = {};

                entityTxs.forEach(tx => {
                    const monthYear = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    if (!monthlyData[monthYear]) {
                        monthlyData[monthYear] = { totalNonAfro: 0, totalAfro: 0, totalPayment: 0, monthlyCommission: 0 };
                    }
                    const paidNonAfro = (Object.keys(tx.cashPaidByService) as ServiceType[]).filter(s => s !== 'afro').reduce((sum, s) => sum + (tx.cashPaidByService[s]?.total || 0), 0);
                    const paidAfro = tx.cashPaidByService.afro?.total || 0;
                    const commissionNonAfro = (Object.keys(tx.cashPaidByService) as ServiceType[]).filter(s => s !== 'afro').reduce((sum, s) => sum + (tx.cashPaidByService[s]?.total || 0) * ((entity.rates[s] || 0) / 100), 0);
                    const commissionAfro = paidAfro * ((entity.rates.afro || 0) / 100);
                    monthlyData[monthYear].totalNonAfro += paidNonAfro;
                    monthlyData[monthYear].totalAfro += paidAfro;
                    monthlyData[monthYear].totalPayment += paidNonAfro + paidAfro;
                    monthlyData[monthYear].monthlyCommission += commissionNonAfro + commissionAfro;
                });

                const entityType: 'Branch' | 'Agent' = branches.some(b => b.id === entity.id) ? 'Branch' : 'Agent';

                return {
                    entityId: entity.id,
                    entityName: entity.name,
                    entityType: entityType,
                    monthlyData
                };
            }).filter(r => Object.keys(r.monthlyData).length > 0);

            const summaryData: CommissionSummaryItem[] = reportData.map(report => {
                const totals = Object.values(report.monthlyData).reduce((acc, month) => {
                    acc.totalPayment += month.totalPayment;
                    acc.totalCommission += month.monthlyCommission;
                    return acc;
                }, { totalPayment: 0, totalCommission: 0 });

                const entityTxs = txsInRange.filter(t => t.entityId === report.entityId);
                const serviceTotals = entityTxs.reduce((acc, tx) => {
                    acc.totalRia += tx.cashPaidByService.ria?.total || 0;
                    acc.totalMoneyGram += tx.cashPaidByService.moneyGram?.total || 0;
                    acc.totalWesternUnion += tx.cashPaidByService.westernUnion?.total || 0;
                    acc.totalAfro += tx.cashPaidByService.afro?.total || 0;
                    return acc;
                }, { totalRia: 0, totalMoneyGram: 0, totalWesternUnion: 0, totalAfro: 0 });

                const principalCommission = 
                    (serviceTotals.totalRia * (settings.principalRates.ria / 100)) +
                    (serviceTotals.totalMoneyGram * (settings.principalRates.moneyGram / 100)) +
                    (serviceTotals.totalWesternUnion * (settings.principalRates.westernUnion / 100)) +
                    (serviceTotals.totalAfro * (settings.principalRates.afro / 100));

                return { 
                    entityId: report.entityId, 
                    entityName: report.entityName, 
                    entityType: report.entityType, 
                    totalPayment: totals.totalPayment, 
                    totalCommission: totals.totalCommission,
                    totalPrincipalCommission: principalCommission,
                    ...serviceTotals
                };
            });

            setTimeout(() => {
                setCommissionReportData(reportData);
                setCommissionSummaryData(summaryData);
                setSelectedForPrinting([]);
                setIsGenerating(false);
            }, 300);
        } catch (error) { console.error("Error generating commission report:", error); setIsGenerating(false); }
    }, [commissionStartDate, commissionEndDate, selectedEntities, branches, agents, settings, api, currentUser]);

    const commissionTotals = useMemo(() => {
        if (!commissionSummaryData) {
            return { principalNet: 0, branch: 0, agent: 0 };
        }
    
        const totalGrossPrincipal = commissionSummaryData.reduce((sum, item) => sum + item.totalPrincipalCommission, 0);
        const totalBranchPayout = commissionSummaryData.filter(item => item.entityType === 'Branch').reduce((sum, item) => sum + item.totalCommission, 0);
        const totalAgentPayout = commissionSummaryData.filter(item => item.entityType === 'Agent').reduce((sum, item) => sum + item.totalCommission, 0);
    
        // Calculate Net Principal Commission based on user's formula
        const principalNet = totalGrossPrincipal - totalAgentPayout;
    
        return { principalNet, branch: totalBranchPayout, agent: totalAgentPayout };
    }, [commissionSummaryData]);

    const getCommissionDateText = useCallback((start: string, end: string): string => {
        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        const startMonth = startDate.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
        const endMonth = endDate.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
        const startYear = startDate.getUTCFullYear();
        const endYear = endDate.getUTCFullYear();
    
        if (startMonth === endMonth && startYear === endYear) {
            return `Commission for the month of ${startMonth} ${startYear}`;
        }
        return `Commission from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    }, []);

    // Trigger Print Dialog (Called from Modal)
    const handlePrintTrigger = () => {
        const handleAfterPrint = () => {
            document.body.classList.remove('is-printing');
            window.removeEventListener('afterprint', handleAfterPrint);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        document.body.classList.add('is-printing');
        setTimeout(() => {
            window.print();
        }, 300);
    };


    // Effect for handling Daily Balance printing (Existing logic)
    useEffect(() => {
        if (dailyBalancePrintData && !isExportingDailyBalancePDF) {
            const handleAfterPrint = () => {
                document.body.classList.remove('is-printing');
                setDailyBalancePrintData(null);
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
    }, [dailyBalancePrintData, isExportingDailyBalancePDF]);

    
    // --- NEW PDF GENERATION LOGIC ---

    const startPdfGeneration = useCallback(async () => {
        const reportElements = document.querySelectorAll('.pdf-render-target');
        if (reportElements.length === 0) {
            setIsExportingPDF(false); setReportsForPDF(null); return;
        }
        try {
            const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            for (let i = 0; i < reportElements.length; i++) {
                const element = reportElements[i] as HTMLElement;
                // Force windowWidth to desktop size to prevent mobile layout clipping
                // Force scrollY to 0 to capture from the top of the element
                const canvas = await window.html2canvas(element, { 
                    scale: 2, 
                    useCORS: true, 
                    scrollY: 0,
                    x: 0,
                    y: 0,
                    windowWidth: 1200, // Force desktop width logic
                    width: 794 // Approx A4 width in px at 96dpi
                });
                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = 210, pdfHeight = 297;
                const ratio = canvas.width / canvas.height;
                let finalWidth = pdfWidth - 20;
                let finalHeight = finalWidth / ratio;
                if (finalHeight > pdfHeight - 20) {
                    finalHeight = pdfHeight - 20;
                    finalWidth = finalHeight * ratio;
                }
                const x = (pdfWidth - finalWidth) / 2; const y = 10;
                if (i > 0) doc.addPage();
                doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
            }
            doc.save(`commission-report-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            showToast("There was an error generating the PDF.", "error");
        } finally {
            setIsExportingPDF(false);
            setReportsForPDF(null);
        }
    }, [showToast]);

    const handleQrCodeRendered = useCallback(() => {
        qrRenderedCount.current += 1;
        if (qrRenderedCount.current === totalReportsForPdf.current) {
            // Use setTimeout to allow React to finish the current render cycle
            setTimeout(startPdfGeneration, 0);
        }
    }, [startPdfGeneration]);


    // Effect for Daily Balance / Monthly Statement PDF Generation (Single Page Fit)
    useEffect(() => {
        if (isExportingDailyBalancePDF && dailyBalancePrintData && window.jspdf && window.html2canvas) {
            const generatePdf = async () => {
                const element = document.getElementById('daily-balance-pdf-target');
                if (!element) { setIsExportingDailyBalancePDF(false); return; }

                try {
                    // Force windowWidth for reliable capture
                    const canvas = await window.html2canvas(element, { 
                        scale: 2, 
                        useCORS: true, 
                        scrollY: 0,
                        windowWidth: 1200
                    });
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
                    
                    // Scale to fit width first
                    let finalWidth = availableWidth;
                    let finalHeight = (imgHeight * availableWidth) / imgWidth;
                    
                    // If height exceeds page height, scale down further to fit
                    if (finalHeight > availableHeight) {
                        finalHeight = availableHeight;
                        finalWidth = (imgWidth * availableHeight) / imgHeight;
                    }
                    
                    const x = (pdfWidth - finalWidth) / 2; // Center horizontally
                    const y = margin;

                    doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
                    
                    doc.save(`report-${new Date().getTime()}.pdf`);
                } catch (error) {
                    console.error("PDF Generation Error", error);
                    showToast("Failed to generate PDF", "error");
                } finally {
                    setIsExportingDailyBalancePDF(false);
                    setDailyBalancePrintData(null);
                }
            };
            // Increase timeout slightly to ensure rendering
            setTimeout(generatePdf, 800);
        }
    }, [isExportingDailyBalancePDF, dailyBalancePrintData, balanceDate, showToast]);


    // --- Export & Print Logic ---
    const handlePrint = (idsToPrint: string[]) => {
        if (!commissionSummaryData || !commissionReportData) return;
        const reportsToPrint = idsToPrint.map(id => {
                const summary = commissionSummaryData.find(s => s.entityId === id);
                if (!summary) return null;
                const entity = summary.entityType === 'Branch'
                    ? branches.find(b => b.id === id)
                    : agents.find(a => a.id === id);
                if (!entity) return null;
                return { summary, entity };
            }).filter((item): item is ReportForPrinting => !!item);
        
        if (reportsToPrint.length > 0) {
            setReportsForPrinting(reportsToPrint);
            // Note: We no longer auto-trigger window.print().
            // The state change renders the Preview Modal instead.
        }
    };
    
    const handleExportPDF = (idsToExport: string[]) => {
        if (!commissionSummaryData || isExportingPDF) return;
        const reportsToExport = idsToExport.map(id => {
            const summary = commissionSummaryData.find(s => s.entityId === id);
            if (!summary) return null;
            const entity = summary.entityType === 'Branch' ? branches.find(b => b.id === id) : agents.find(a => a.id === id);
            if (!entity) return null;
            return { summary, entity };
        }).filter((item): item is ReportForPrinting => !!item);
        
        if (reportsToExport.length > 0) {
            qrRenderedCount.current = 0;
            totalReportsForPdf.current = reportsToExport.length;
            setIsExportingPDF(true);
            setReportsForPDF(reportsToExport);
            // The actual PDF generation is now triggered by handleQrCodeRendered
        }
    };

    const handleExportCSV = () => {
        if (!window.Papa || !commissionSummaryData) return;
        const csvData = commissionSummaryData.map(item => ({ 
            'Entity': item.entityName, 
            'Type': item.entityType, 
            'Ria': item.totalRia, 
            'MoneyGram': item.totalMoneyGram,
            'Western Union': item.totalWesternUnion, 
            'Afro': item.totalAfro, 
            'Total Payment': item.totalPayment, 
            'Principal Commission': item.totalPrincipalCommission,
            'Agent/Branch Commission': item.totalCommission 
        }));
        const fileName = `commission_summary_${commissionStartDate}_${commissionEndDate}.csv`;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([window.Papa.unparse(csvData)], { type: 'text/csv;charset=utf-8;' }));
        link.download = fileName;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleExportExcelCommission = () => {
        if (!window.XLSX || !commissionSummaryData) {
            showToast("Excel export library not loaded.", "error");
            return;
        }
        const data = commissionSummaryData.map(item => ({
            'Entity Name': item.entityName,
            'Type': item.entityType,
            'Ria Sales': item.totalRia,
            'MoneyGram Sales': item.totalMoneyGram,
            'Western Union Sales': item.totalWesternUnion,
            'Afro Sales': item.totalAfro,
            'Total Payment': item.totalPayment,
            'Principal Commission': item.totalPrincipalCommission,
            'Entity Commission': item.totalCommission
        }));
        const ws = window.XLSX.utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Commission Summary");
        window.XLSX.writeFile(wb, `commission_report_${commissionStartDate}_to_${commissionEndDate}.xlsx`);
    };

    const handleSelectForPrinting = (id: string) => {
        setSelectedForPrinting(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]);
    };

    const handleSelectAllForPrinting = () => {
        if (!commissionSummaryData) return;
        if (selectedForPrinting.length === commissionSummaryData.length) {
            setSelectedForPrinting([]);
        } else {
            setSelectedForPrinting(commissionSummaryData.map(item => item.entityId));
        }
    };

    const renderReportUI = () => {
        if (activeReport === 'dailyBalance') {
            return ( 
                <Card> 
                    <h2 className="text-2xl font-bold mb-4">Balance & Statement Reports</h2>
                    <div className="flex space-x-4 mb-6 border-b dark:border-slate-700 pb-4">
                        <button onClick={() => { setBalanceViewMode('daily'); setBalanceReportData(null); setMonthlyStatementData(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${balanceViewMode === 'daily' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}>Daily Summary (All)</button>
                        <button onClick={() => { setBalanceViewMode('monthly'); setBalanceReportData(null); setMonthlyStatementData(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${balanceViewMode === 'monthly' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}>Monthly Payment Report (Single Entity)</button>
                    </div>
                    
                    {balanceViewMode === 'daily' ? (
                        <div className="flex flex-col md:flex-row gap-4 items-end"> 
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select Date</label>
                                <input type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div> 
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Entities (select none for all)</label>
                                <MultiSearchableSelect selectedIds={selectedBalanceEntities} onChange={setSelectedBalanceEntities} options={entityOptions} placeholder="Select entities..."/>
                            </div>
                            <div className="w-full md:w-auto">
                                <button onClick={handleGenerateBalanceReport} disabled={isGenerating} className="w-full md:w-auto bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 transition transform hover:-translate-y-0.5">{isGenerating ? 'Generating...' : 'Generate'}</button>
                            </div> 
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-4 items-end">
                             <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                                <select value={monthlyStatementEntityType} onChange={e => { setMonthlyStatementEntityType(e.target.value as any); setSelectedStatementEntityId(''); }} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                                    <option value="agent">Agent</option>
                                    <option value="branch">Branch</option>
                                </select>
                            </div>
                            <div className="w-full md:w-1/4">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select Month</label>
                                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div> 
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select {monthlyStatementEntityType === 'branch' ? 'Branch' : 'Agent'} (Required)</label>
                                <SearchableSelect value={selectedStatementEntityId} onChange={setSelectedStatementEntityId} options={filteredSingleEntityOptions} placeholder={`Select a ${monthlyStatementEntityType}`}/>
                            </div>
                            <div className="w-full md:w-auto">
                                <button onClick={handleGenerateMonthlyStatement} disabled={isGenerating || !selectedStatementEntityId} className="w-full md:w-auto bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 transition transform hover:-translate-y-0.5">{isGenerating ? 'Generating...' : 'Generate'}</button>
                            </div> 
                        </div>
                    )}
                </Card> 
            );
        }
        if (activeReport === 'commission') {
            return ( <Card> <h2 className="text-2xl font-bold mb-4">Generate Commission Report</h2> <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"> <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start Date</label><input type="date" value={commissionStartDate} onChange={e => setCommissionStartDate(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/></div> <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">End Date</label><input type="date" value={commissionEndDate} onChange={e => setCommissionEndDate(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/></div> <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Entities (select none for all)</label><MultiSearchableSelect selectedIds={selectedEntities} onChange={setSelectedEntities} options={entityOptions} placeholder="Select entities..."/></div> </div> <div className="mt-4"><button onClick={handleGenerateCommissionReport} disabled={isGenerating} className="w-full bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 transition transform hover:-translate-y-0.5">{isGenerating ? 'Generating...' : 'Generate'}</button></div> </Card> );
        }
    };
    
    const renderReportResults = () => {
         const hasData = (activeReport === 'dailyBalance' && (balanceReportData || monthlyStatementData)) || (activeReport === 'commission' && commissionSummaryData);
         if (isGenerating) return <Spinner />;
         if (!hasData) return <Card><p className="text-center text-slate-500">Select your criteria and click "Generate" to view a report.</p></Card>;
        
         return (
            <Card>
                {activeReport === 'dailyBalance' && balanceReportData && (
                     <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Daily Balance Report for {balanceDate}</h3>
                            <div className="flex gap-2">
                                <button onClick={handlePrintDailyBalance} disabled={isExportingDailyBalancePDF} className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:bg-slate-400 transition transform hover:-translate-y-0.5">Print Report</button>
                                <button onClick={handleExportPDFDailyBalance} disabled={isExportingDailyBalancePDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400 transition transform hover:-translate-y-0.5">Export PDF</button>
                                <button onClick={handleExportExcelDailyBalance} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"><FileExcelIcon className="w-4 h-4" /> Excel</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opening</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Received</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Paid</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closing</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {balanceReportData.map((item) => (
                                        <tr key={item.id} className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="p-3 text-slate-700 dark:text-slate-300">{item.entityType}</td>
                                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{item.name}</td>
                                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(item.openingBalance)}</td>
                                            <td className="p-3 text-right font-mono text-green-500">{formatCurrency(item.cashReceived)}</td>
                                            <td className="p-3 text-right font-mono text-red-500">{formatCurrency(item.cashPaid)}</td>
                                            <td className="p-3 text-right font-mono font-bold text-primary-600 dark:text-primary-400">{formatCurrency(item.closingBalance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                
                {activeReport === 'dailyBalance' && monthlyStatementData && (
                     <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Monthly Payment Report: {monthlyStatementData.entityName}</h3>
                            <div className="flex gap-2">
                                <button onClick={handlePrintDailyBalance} disabled={isExportingDailyBalancePDF} className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:bg-slate-400 transition transform hover:-translate-y-0.5">Print Statement</button>
                                <button onClick={handleExportPDFDailyBalance} disabled={isExportingDailyBalancePDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400 transition transform hover:-translate-y-0.5">Export PDF</button>
                                <button onClick={handleExportExcelDailyBalance} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"><FileExcelIcon className="w-4 h-4" /> Excel</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ria</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">MoneyGram</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">W. Union</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Afro</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Paid</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {monthlyStatementData.items.map((item) => (
                                        <tr key={item.date} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150">
                                            <td className="p-3 text-slate-700 dark:text-slate-300">{new Date(item.date.replace(/-/g, '\/')).toLocaleDateString()}</td>
                                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.ria !== 0 ? formatCurrency(item.ria) : '-'}</td>
                                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.moneyGram !== 0 ? formatCurrency(item.moneyGram) : '-'}</td>
                                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.westernUnion !== 0 ? formatCurrency(item.westernUnion) : '-'}</td>
                                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{item.afro !== 0 ? formatCurrency(item.afro) : '-'}</td>
                                            <td className="p-3 text-right font-mono font-bold text-red-500">{item.totalPaid !== 0 ? formatCurrency(item.totalPaid) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-100 dark:bg-slate-700 font-semibold">
                                    <tr>
                                        <td className="p-3 text-slate-800 dark:text-slate-200">Total</td>
                                        <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(monthlyStatementData.items.reduce((s, i) => s + i.ria, 0))}</td>
                                        <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(monthlyStatementData.items.reduce((s, i) => s + i.moneyGram, 0))}</td>
                                        <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(monthlyStatementData.items.reduce((s, i) => s + i.westernUnion, 0))}</td>
                                        <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(monthlyStatementData.items.reduce((s, i) => s + i.afro, 0))}</td>
                                        <td className="p-3 text-right font-mono text-red-600">{formatCurrency(monthlyStatementData.items.reduce((s, i) => s + i.totalPaid, 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )}

                {activeReport === 'commission' && commissionSummaryData && (
                     <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <Card className="interactive-card">
                                <h3 className="text-slate-500 dark:text-slate-400">Net Principal Commission</h3>
                                <p className="text-3xl font-bold text-blue-600">{formatCurrency(commissionTotals.principalNet)}</p>
                                <p className="text-xs text-slate-400 mt-1">(Gross Principal - Agent Payouts)</p>
                            </Card>
                            <Card className="interactive-card">
                                <h3 className="text-slate-500 dark:text-slate-400">Total Branch Commission</h3>
                                <p className="text-3xl font-bold text-green-600">{formatCurrency(commissionTotals.branch)}</p>
                                <p className="text-xs text-slate-400 mt-1">(Paid to Branches)</p>
                            </Card>
                            <Card className="interactive-card">
                                <h3 className="text-slate-500 dark:text-slate-400">Total Agent Commission</h3>
                                <p className="text-3xl font-bold text-green-600">{formatCurrency(commissionTotals.agent)}</p>
                                <p className="text-xs text-slate-400 mt-1">(Paid to Agents)</p>
                            </Card>
                        </div>

                        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                            <h3 className="text-xl font-bold">Commission Summary</h3>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => handlePrint(commissionSummaryData.map(i => i.entityId))} className="bg-slate-500 text-white px-3 py-2 text-sm rounded-lg hover:bg-slate-600 transition transform hover:-translate-y-0.5">Print All</button>
                                <button onClick={() => handlePrint(selectedForPrinting)} disabled={selectedForPrinting.length === 0} className="bg-blue-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition transform hover:-translate-y-0.5">Print Selected ({selectedForPrinting.length})</button>
                                <button onClick={() => handleExportPDF(commissionSummaryData.map(i => i.entityId))} disabled={isExportingPDF} className="bg-red-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-red-700 disabled:bg-red-400 transition transform hover:-translate-y-0.5">{isExportingPDF ? '...' : 'PDF All'}</button>
                                <button onClick={() => handleExportPDF(selectedForPrinting)} disabled={selectedForPrinting.length === 0 || isExportingPDF} className="bg-red-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-red-700 disabled:bg-red-400 transition transform hover:-translate-y-0.5">{isExportingPDF ? '...' : `PDF Selected (${selectedForPrinting.length})`}</button>
                                <button onClick={handleExportCSV} className="bg-green-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-green-700 transition transform hover:-translate-y-0.5">Export CSV</button>
                                <button onClick={handleExportExcelCommission} className="bg-green-600 text-white px-3 py-2 text-sm rounded-lg hover:bg-green-700 flex items-center gap-2 transition transform hover:-translate-y-0.5"><FileExcelIcon className="w-4 h-4" /> Excel</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"><input type="checkbox" checked={commissionSummaryData.length > 0 && selectedForPrinting.length === commissionSummaryData.length} onChange={handleSelectAllForPrinting} /></th>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Entity Name</th>
                                        <th className="p-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Payment</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Principal Commission</th>
                                        <th className="p-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Agent/Branch Commission</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {commissionSummaryData.map((item) => (<tr key={item.entityId} className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="p-3"><input type="checkbox" checked={selectedForPrinting.includes(item.entityId)} onChange={() => handleSelectForPrinting(item.entityId)}/></td>
                                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{item.entityName}</td>
                                        <td className="p-3 text-slate-700 dark:text-slate-300">{item.entityType}</td>
                                        <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(item.totalPayment)}</td>
                                        <td className="p-3 text-right font-mono text-blue-600">{formatCurrency(item.totalPrincipalCommission)}</td>
                                        <td className="p-3 text-right font-mono text-green-600">{formatCurrency(item.totalCommission)}</td>
                                    </tr>))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Card>
         )
    };

    const handleTabChange = (reportType: ReportType) => {
        setActiveReport(reportType);
        setBalanceReportData(null);
        setMonthlyStatementData(null);
        setDailyBalancePrintData(null);
        setCommissionSummaryData(null);
    }

    return (
        <>
            <div className="print-only-container">
                {reportsForPrinting && settings && reportsForPrinting.map(({ summary, entity }) =>
                    <CommissionReportView key={summary.entityId} summary={summary} dateRangeText={getCommissionDateText(commissionStartDate, commissionEndDate)} entity={entity} settings={settings} formatCurrency={formatCurrency} />
                )}
                {dailyBalancePrintData && settings && (
                     <FinancialReportView
                        title={dailyBalancePrintData.title}
                        dateRangeText={dailyBalancePrintData.dateText}
                        settings={settings}
                        tables={dailyBalancePrintData.tables}
                        summary={dailyBalancePrintData.summary}
                        isForPrint={true}
                    />
                )}
            </div>
            
            {/* Preview Modal for Commission Reports */}
            {reportsForPrinting && settings && (
                <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/95 backdrop-blur-sm animate-fade-in">
                    {/* Toolbar */}
                    <div className="flex justify-between items-center p-4 bg-slate-800 text-white shadow-md">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            Previewing {reportsForPrinting.length} Report{reportsForPrinting.length > 1 ? 's' : ''}
                        </h2>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => handleExportPDF(reportsForPrinting.map(r => r.summary.entityId))} 
                                disabled={isExportingPDF}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExportingPDF ? <LoadingSpinnerIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button 
                                onClick={handlePrintTrigger}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                            >
                                <PrinterIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Print</span>
                            </button>
                            <button 
                                onClick={() => setReportsForPrinting(null)}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
                            >
                                <CloseIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Close</span>
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-900">
                         <div className="w-full max-w-[210mm] space-y-8">
                            {reportsForPrinting.map(({ summary, entity }) => (
                                <div key={summary.entityId} className="shadow-2xl">
                                    <CommissionReportView 
                                        summary={summary} 
                                        dateRangeText={getCommissionDateText(commissionStartDate, commissionEndDate)} 
                                        entity={entity} 
                                        settings={settings} 
                                        formatCurrency={formatCurrency} 
                                    />
                                </div>
                            ))}
                         </div>
                    </div>
                </div>
            )}

            <div className="pdf-render-container" style={{ position: 'fixed', top: 0, left: 0, zIndex: -50, width: '210mm', minHeight: '297mm', background: 'white', overflow: 'hidden', opacity: 1, pointerEvents: 'none' }}>
                {reportsForPDF && settings && reportsForPDF.map(({ summary, entity }) =>
                    <div key={summary.entityId} className="pdf-render-target" style={{ width: '210mm', minHeight: '297mm', background: 'white', padding: '10mm', position: 'absolute', top: 0, left: 0 }}>
                        <CommissionReportView 
                            onQrCodeRendered={handleQrCodeRendered} 
                            summary={summary} 
                            dateRangeText={getCommissionDateText(commissionStartDate, commissionEndDate)} 
                            entity={entity} 
                            settings={settings} 
                            formatCurrency={formatCurrency} 
                        />
                    </div>
                )}
                {isExportingDailyBalancePDF && dailyBalancePrintData && settings && (
                     <div id="daily-balance-pdf-target" style={{ width: '210mm', minHeight: '297mm', padding: '10mm', background: 'white', position: 'absolute', top: 0, left: 0 }}>
                        <FinancialReportView
                            title={dailyBalancePrintData.title}
                            dateRangeText={dailyBalancePrintData.dateText}
                            settings={settings}
                            tables={dailyBalancePrintData.tables}
                            summary={dailyBalancePrintData.summary}
                            isForPrint={true}
                        />
                    </div>
                )}
            </div>

            <div className="screen-only space-y-6">
                 <Card>
                    <div className="flex space-x-4 border-b dark:border-slate-700">
                        <button 
                            onClick={() => handleTabChange('dailyBalance')} 
                            className={`px-4 py-2 border-b-2 font-medium transition-colors ${activeReport === 'dailyBalance' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            Balance & Statements
                        </button>
                        <button 
                            onClick={() => handleTabChange('commission')} 
                            className={`px-4 py-2 border-b-2 font-medium transition-colors ${activeReport === 'commission' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            Commission Reports
                        </button>
                    </div>
                 </Card>
                 {renderReportUI()}
                 {renderReportResults()}
            </div>
        </>
    );
};

export default ReportsPage;
