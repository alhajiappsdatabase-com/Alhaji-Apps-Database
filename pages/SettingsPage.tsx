
import React, { FC, useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../types';
import { Card, ConfirmationModal } from '../components/ui';
import { Settings, ServiceType, Agent, CommissionSummaryItem } from '../types';
import CommissionReportView from '../components/CommissionReportView';
import { DownloadIcon, LockClosedIcon, CheckIcon, CloseIcon, LoadingSpinnerIcon, PrinterIcon } from '../components/icons';

const currencies = [
  { code: 'AED', name: 'United Arab Emirates Dirham (د.إ)' }, { code: 'AFN', name: 'Afghan Afghani (؋)' },
  { code: 'ALL', name: 'Albanian Lek (L)' }, { code: 'AMD', name: 'Armenian Dram (֏)' },
  { code: 'ANG', name: 'Netherlands Antillean Guilder (ƒ)' }, { code: 'AOA', name: 'Angolan Kwanza (Kz)' },
  { code: 'ARS', name: 'Argentine Peso ($)' }, { code: 'AUD', name: 'Australian Dollar (A$)' },
  { code: 'AWG', name: 'Aruban Florin (ƒ)' }, { code: 'AZN', name: 'Azerbaijani Manat (₼)' },
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark (KM)' }, { code: 'BBD', name: 'Barbadian Dollar ($)' },
  { code: 'BDT', name: 'Bangladeshi Taka (৳)' }, { code: 'BGN', name: 'Bulgarian Lev (лв)' },
  { code: 'BHD', name: 'Bahraini Dinar (.د.ب)' }, { code: 'BIF', name: 'Burundian Franc (FBu)' },
  { code: 'BMD', name: 'Bermudan Dollar ($)' }, { code: 'BND', name: 'Brunei Dollar ($)' },
  { code: 'BOB', name: 'Bolivian Boliviano ($b)' }, { code: 'BRL', name: 'Brazilian Real (R$)' },
  { code: 'BSD', name: 'Bahamian Dollar ($)' }, { code: 'BTN', name: 'Bhutanese Ngultrum (Nu.)' },
  { code: 'BWP', name: 'Botswanan Pula (P)' }, { code: 'BYN', name: 'Belarusian Ruble (Br)' },
  { code: 'BZD', name: 'Belize Dollar (BZ$)' }, { code: 'CAD', name: 'Canadian Dollar (C$)' },
  { code: 'CDF', name: 'Congolese Franc (FC)' }, { code: 'CHF', name: 'Swiss Franc (CHF)' },
  { code: 'CLP', name: 'Chilean Peso ($)' }, { code: 'CNY', name: 'Chinese Yuan (¥)' },
  { code: 'COP', name: 'Colombian Peso ($)' }, { code: 'CRC', name: 'Costa Rican Colón (₡)' },
  { code: 'CUP', name: 'Cuban Peso (₱)' }, { code: 'CVE', name: 'Cape Verdean Escudo ($)' },
  { code: 'CZK', name: 'Czech Republic Koruna (Kč)' }, { code: 'DJF', name: 'Djiboutian Franc (Fdj)' },
  { code: 'DKK', name: 'Danish Krone (kr)' }, { code: 'DOP', name: 'Dominican Peso (RD$)' },
  { code: 'DZD', name: 'Algerian Dinar (دج)' }, { code: 'EGP', name: 'Egyptian Pound (£)' },
  { code: 'ERN', name: 'Eritrean Nakfa (Nfk)' }, { code: 'ETB', name: 'Ethiopian Birr (Br)' },
  { code: 'EUR', name: 'Euro (€)' }, { code: 'FJD', name: 'Fijian Dollar ($)' },
  { code: 'FKP', name: 'Falkland Islands Pound (£)' }, { code: 'GBP', name: 'British Pound (£)' },
  { code: 'GEL', name: 'Georgian Lari (₾)' }, { code: 'GGP', name: 'Guernsey Pound (£)' },
  { code: 'GHS', name: 'Ghanaian Cedi (GH₵)' }, { code: 'GIP', name: 'Gibraltar Pound (£)' },
  { code: 'GMD', name: 'Gambian Dalasi (D)' }, { code: 'GNF', name: 'Guinean Franc (FG)' },
  { code: 'GTQ', name: 'Guatemalan Quetzal (Q)' }, { code: 'GYD', name: 'Guyanaese Dollar ($)' },
  { code: 'HKD', name: 'Hong Kong Dollar (HK$)' }, { code: 'HNL', name: 'Honduran Lempira (L)' },
  { code: 'HRK', name: 'Croatian Kuna (kn)' }, { code: 'HTG', name: 'Haitian Gourde (G)' },
  { code: 'HUF', name: 'Hungarian Forint (Ft)' }, { code: 'IDR', name: 'Indonesian Rupiah (Rp)' },
  { code: 'ILS', name: 'Israeli New Sheqel (₪)' }, { code: 'IMP', name: 'Manx pound (£)' },
  { code: 'INR', name: 'Indian Rupee (₹)' }, { code: 'IQD', name: 'Iraqi Dinar (ع.د)' },
  { code: 'IRR', name: 'Iranian Rial (﷼)' }, { code: 'ISK', name: 'Icelandic Króna (kr)' },
  { code: 'JEP', name: 'Jersey Pound (£)' }, { code: 'JMD', name: 'Jamaican Dollar (J$)' },
  { code: 'JOD', name: 'Jordanian Dinar (JD)' }, { code: 'JPY', name: 'Japanese Yen (¥)' },
  { code: 'KES', name: 'Kenyan Shilling (KSh)' }, { code: 'KGS', name: 'Kyrgystani Som (лв)' },
  { code: 'KHR', name: 'Cambodian Riel (៛)' }, { code: 'KMF', name: 'Comorian Franc (CF)' },
  { code: 'KPW', name: 'North Korean Won (₩)' }, { code: 'KRW', name: 'South Korean Won (₩)' },
  { code: 'KWD', name: 'Kuwaiti Dinar (KD)' }, { code: 'KYD', name: 'Cayman Islands Dollar ($)' },
  { code: 'KZT', name: 'Kazakhstani Tenge (₸)' }, { code: 'LAK', name: 'Laotian Kip (₭)' },
  { code: 'LBP', name: 'Lebanese Pound (£)' }, { code: 'LKR', name: 'Sri Lankan Rupee (₨)' },
  { code: 'LRD', name: 'Liberian Dollar ($)' }, { code: 'LSL', name: 'Lesotho Loti (L)' },
  { code: 'LYD', name: 'Libyan Dinar (LD)' }, { code: 'MAD', name: 'Moroccan Dirham (MAD)' },
  { code: 'MDL', name: 'Moldovan Leu (L)' }, { code: 'MGA', name: 'Malagasy Ariary (Ar)' },
  { code: 'MKD', name: 'Macedonian Denar (ден)' }, { code: 'MMK', name: 'Myanma Kyat (K)' },
  { code: 'MNT', name: 'Mongolian Tugrik (₮)' }, { code: 'MOP', name: 'Macanese Pataca (MOP$)' },
  { code: 'MRU', name: 'Mauritanian Ouguiya (UM)' }, { code: 'MUR', name: 'Mauritian Rupee (₨)' },
  { code: 'MVR', name: 'Maldivian Rufiyaa (Rf)' }, { code: 'MWK', name: 'Malawian Kwacha (MK)' },
  { code: 'MXN', name: 'Mexican Peso ($)' }, { code: 'MYR', name: 'Malaysian Ringgit (RM)' },
  { code: 'MZN', name: 'Mozambican Metical (MT)' }, { code: 'NAD', name: 'Namibian Dollar ($)' },
  { code: 'NGN', name: 'Nigerian Naira (₦)' }, { code: 'NIO', name: 'Nicaraguan Córdoba (C$)' },
  { code: 'NOK', name: 'Norwegian Krone (kr)' }, { code: 'NPR', name: 'Nepalese Rupee (₨)' },
  { code: 'NZD', name: 'New Zealand Dollar (NZ$)' }, { code: 'OMR', name: 'Omani Rial (﷼)' },
  { code: 'PAB', name: 'Panamanian Balboa (B/.)' }, { code: 'PEN', name: 'Peruvian Nuevo Sol (S/.)' },
  { code: 'PGK', name: 'Papua New Guinean Kina (K)' }, { code: 'PHP', name: 'Philippine Peso (₱)' },
  { code: 'PKR', name: 'Pakistani Rupee (₨)' }, { code: 'PLN', name: 'Polish Zloty (zł)' },
  { code: 'PYG', name: 'Paraguayan Guarani (Gs)' }, { code: 'QAR', name: 'Qatari Rial (﷼)' },
  { code: 'RON', name: 'Romanian Leu (lei)' }, { code: 'RSD', name: 'Serbian Dinar (Дин.)' },
  { code: 'RUB', name: 'Russian Ruble (₽)' }, { code: 'RWF', name: 'Rwandan Franc (R₣)' },
  { code: 'SAR', name: 'Saudi Riyal (﷼)' }, { code: 'SBD', name: 'Solomon Islands Dollar ($)' },
  { code: 'SCR', name: 'Seychellois Rupee (₨)' }, { code: 'SDG', name: 'Sudanese Pound (ج.س.)' },
  { code: 'SEK', name: 'Swedish Krona (kr)' }, { code: 'SGD', name: 'Singapore Dollar (S$)' },
  { code: 'SHP', name: 'Saint Helena Pound (£)' }, { code: 'SLE', name: 'Sierra Leonean Leone (Le)' },
  { code: 'SOS', name: 'Somali Shilling (S)' }, { code: 'SRD', name: 'Surinamese Dollar ($)' },
  { code: 'SSP', name: 'South Sudanese Pound (£)' }, { code: 'STN', name: 'São Tomé and Príncipe Dobra (Db)' },
  { code: 'SVC', name: 'Salvadoran Colón ($)' }, { code: 'SYP', name: 'Syrian Pound (£)' },
  { code: 'SZL', name: 'Swazi Lilangeni (L)' }, { code: 'THB', name: 'Thai Baht (฿)' },
  { code: 'TJS', name: 'Tajikistani Somoni (SM)' }, { code: 'TMT', name: 'Turkmenistani Manat (T)' },
  { code: 'TND', name: 'Tunisian Dinar (DT)' }, { code: 'TOP', name: 'Tongan Paʻanga (T$)' },
  { code: 'TRY', name: 'Turkish Lira (₺)' }, { code: 'TTD', name: 'Trinidad and Tobago Dollar (TT$)' },
  { code: 'TWD', name: 'New Taiwan Dollar (NT$)' }, { code: 'TZS', name: 'Tanzanian Shilling (TSh)' },
  { code: 'UAH', name: 'Ukrainian Hryvnia (₴)' }, { code: 'UGX', name: 'Ugandan Shilling (USh)' },
  { code: 'USD', name: 'United States Dollar ($)' }, { code: 'UYU', name: 'Uruguayan Peso ($U)' },
  { code: 'UZS', name: 'Uzbekistan Som (лв)' }, { code: 'VES', name: 'Venezuelan Bolívar Soberano (Bs.S)' },
  { code: 'VND', name: 'Vietnamese Dong (₫)' }, { code: 'VUV', name: 'Vanuatu Vatu (VT)' },
  { code: 'WST', name: 'Samoan Tala (WS$)' }, { code: 'XAF', name: 'CFA Franc BEAC (FCFA)' },
  { code: 'XCD', name: 'East Caribbean Dollar ($)' }, { code: 'XDR', name: 'Special Drawing Rights (XDR)' },
  { code: 'XOF', name: 'CFA Franc BCEAO (CFA)' }, { code: 'XPF', name: 'CFP Franc (₣)' },
  { code: 'YER', name: 'Yemeni Rial (﷼)' }, { code: 'ZAR', name: 'South African Rand (R)' },
  { code: 'ZMW', name: 'Zambian Kwacha (ZK)' }, { code: 'ZWL', name: 'Zimbabwean Dollar ($)' },
];

const serviceTypes: ServiceType[] = ['ria', 'moneyGram', 'westernUnion', 'afro'];
const serviceNames: Record<ServiceType, string> = {
    ria: 'Ria', moneyGram: 'MoneyGram', westernUnion: 'Western Union', afro: 'Afro'
};

const mockPreviewSummary: CommissionSummaryItem = {
    entityId: 'preview-agent-1',
    entityName: 'Agent or Branch Name',
    entityType: 'Agent',
    totalRia: 20000,
    totalMoneyGram: 30000,
    totalWesternUnion: 25000,
    totalAfro: 35000,
    totalPayment: 110000,
    totalCommission: 2000,
    totalPrincipalCommission: 2200,
};

const SettingsPage: FC = () => {
    const { api, settings, fetchSettings, showToast, currentUser, lockDate, setLockDate, isInstallable, installApp } = useAppContext();
    const [formData, setFormData] = useState<Settings | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [localLockDate, setLocalLockDate] = useState(lockDate || '');
    const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
    const [checkMessage, setCheckMessage] = useState('');

    // Preview Modal States
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (settings) {
            setFormData(JSON.parse(JSON.stringify(settings)));
            return;
        }
        
        // Fallback: If settings are not loaded yet, force a fetch or set defaults after timeout
        if (currentUser) {
            fetchSettings();
            const timer = setTimeout(() => {
                setFormData(prev => prev || {
                    companyId: currentUser.companyId,
                    companyName: '', 
                    defaultRates: { branch: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 }, agent: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 } },
                    principalRates: { ria: 0, moneyGram: 0, westernUnion: 0, afro: 0 },
                    currency: 'USD',
                    dateFormat: 'YYYY-MM-DD',
                    signatureTitle: '',
                    signatureImage: null,
                    commissionTemplateNote: '',
                    commissionTemplateThankYou: '',
                    companyLogo: null,
                    companyLogoSize: 60,
                    companyAddress: '',
                    companyEmail: '',
                    companyPhone: '',
                    dormancyThresholdDays: 7,
                    showQRCodeOnReport: true
                });
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [settings, currentUser, fetchSettings]);

    const handleInputChange = (field: keyof Settings, value: any) => {
        if (formData) {
            setFormData({ ...formData, [field]: value });
        }
    };

    const handleRateChange = (entityType: 'branch' | 'agent', service: ServiceType, value: string) => {
        if (formData) {
            const newRates = {
                ...formData.defaultRates,
                [entityType]: {
                    ...formData.defaultRates[entityType],
                    [service]: parseFloat(value) || 0
                }
            };
            setFormData({ ...formData, defaultRates: newRates });
        }
    };

    const handlePrincipalRateChange = (service: ServiceType, value: string) => {
        if (formData) {
            const newRates = {
                ...formData.principalRates,
                [service]: parseFloat(value) || 0
            };
            setFormData({ ...formData, principalRates: newRates });
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleInputChange('companyLogo', reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleInputChange('signatureImage', reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!formData || !currentUser) return;
        setIsSaving(true);
        try {
            await api.updateSettings(formData.companyId, currentUser, formData);
            await fetchSettings();
            showToast("Settings saved successfully!", "success");
        } catch (error: any) {
            console.error("Failed to save settings", error);
            let msg = "Failed to save settings.";
            
            if (typeof error === 'string') {
                msg = error;
            } else if (error instanceof Error) {
                msg = error.message;
            } else if (error && typeof error === 'object') {
                msg = error.message || error.error_description || JSON.stringify(error);
                if (msg === '{}' || msg === '[object Object]') {
                    msg = "An unknown error occurred while saving settings.";
                }
            }
            
            showToast(msg, "error");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleSeedDatabase = async () => {
        if (!currentUser) return;
        setIsSeeding(true);
        try {
            await api.seedDatabase(currentUser.companyId, currentUser);
            showToast("Database seeded with sample data!", "success");
            setIsSeedModalOpen(false);
        } catch (error: any) {
            showToast(error.message || "Failed to seed database.", "error");
        } finally {
            setIsSeeding(false);
        }
    };

    const handleExportBackup = async () => {
        if (!currentUser) return;
        setIsExporting(true);
        try {
            const backupData = await api.getFullBackup(currentUser.companyId);
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fintrack_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("Backup exported successfully.", "success");
        } catch (error: any) {
            showToast("Failed to export backup.", "error");
            console.error(error);
        } finally {
            setIsExporting(false);
        }
    };
    
    const handleUpdateLockDate = () => {
        setLockDate(localLockDate || null);
        showToast(localLockDate ? `Transactions locked before ${localLockDate}` : 'Transactions unlocked', 'success');
    };

    const handleConnectionCheck = async () => {
        setCheckStatus('checking');
        const result = await api.checkConnection();
        if (result.success) {
            setCheckStatus('success');
            setCheckMessage(result.message);
        } else {
            setCheckStatus('error');
            setCheckMessage(result.message);
        }
    };

    const handlePrintPreview = () => {
        setIsPreviewModalOpen(true);
    };

    const handleClosePreview = () => {
        setIsPreviewModalOpen(false);
    };

    const handlePrint = () => {
        setIsPrinting(true);
    };

    const handleDownloadPdf = async () => {
        if (!window.jspdf || !window.html2canvas || !previewRef.current) return;
        setIsGeneratingPdf(true);
        try {
            const element = previewRef.current.querySelector('.commission-report-page') as HTMLElement;
            if (!element) throw new Error("Report content not found");

            const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
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
            doc.save(`commission-report-preview.pdf`);
        } catch (e) {
            console.error(e);
            showToast("Failed to generate PDF", "error");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    // Effect for actual printing
    useEffect(() => {
        if (isPrinting) {
             const handleAfterPrint = () => {
                document.body.classList.remove('is-printing');
                setIsPrinting(false);
                window.removeEventListener('afterprint', handleAfterPrint);
            };

            window.addEventListener('afterprint', handleAfterPrint);
            document.body.classList.add('is-printing');

            const timer = setTimeout(() => {
                window.print();
            }, 500);

            return () => {
                clearTimeout(timer);
                if (document.body.classList.contains('is-printing')) {
                    document.body.classList.remove('is-printing');
                }
                window.removeEventListener('afterprint', handleAfterPrint);
            };
        }
    }, [isPrinting]);
    
    const formatPreviewCurrency = useCallback((amount: number) => {
        if (!formData) return String(amount);
        try {
             return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: formData.currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(amount);
        } catch {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(amount);
        }
    }, [formData]);

    if (!formData) {
        return <Card><div className="flex items-center justify-center p-8"><LoadingSpinnerIcon className="w-8 h-8 animate-spin text-primary-600"/></div></Card>;
    }
    
    const mockPreviewAgent: Agent = {
        id: 'preview-agent-1',
        companyId: formData.companyId,
        name: 'Agent or Branch Name',
        location: 'Preview Location',
        rates: formData.defaultRates.agent,
        isActive: true,
        editHistory: [],
    };

    return (
        <>
            {/* Hidden Print Container */}
            <div className="print-only-container">
                {isPrinting && (
                    <CommissionReportView
                        summary={mockPreviewSummary}
                        dateRangeText="Commission for the month of [Month Year]"
                        entity={mockPreviewAgent}
                        settings={formData}
                        formatCurrency={formatPreviewCurrency}
                    />
                )}
            </div>

            {/* Preview Modal */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-fade-in">
                    {/* Actions Bar */}
                    <div className="flex items-center gap-6 mb-6">
                        <button 
                            onClick={handlePrint} 
                            disabled={isPrinting || isGeneratingPdf}
                            className="flex flex-col items-center gap-1 text-white hover:text-blue-400 transition-colors"
                        >
                            <div className="p-3 bg-slate-800 rounded-full hover:bg-slate-700">
                                <PrinterIcon className="w-6 h-6" />
                            </div>
                            <span className="text-xs">Print</span>
                        </button>

                        <button 
                            onClick={handleDownloadPdf} 
                            disabled={isPrinting || isGeneratingPdf}
                            className="flex flex-col items-center gap-1 text-white hover:text-green-400 transition-colors"
                        >
                            <div className="p-3 bg-slate-800 rounded-full hover:bg-slate-700">
                                {isGeneratingPdf ? <LoadingSpinnerIcon className="w-6 h-6 animate-spin" /> : <DownloadIcon className="w-6 h-6" />}
                            </div>
                            <span className="text-xs">PDF</span>
                        </button>

                        <button 
                            onClick={handleClosePreview} 
                            className="flex flex-col items-center gap-1 text-white hover:text-red-400 transition-colors"
                        >
                            <div className="p-3 bg-slate-800 rounded-full hover:bg-slate-700">
                                <CloseIcon className="w-6 h-6" />
                            </div>
                            <span className="text-xs">Close</span>
                        </button>
                    </div>

                    {/* Preview Content */}
                    <div ref={previewRef} className="overflow-y-auto max-h-[80vh] w-full flex justify-center p-4">
                        <div className="transform scale-90 sm:scale-100 origin-top">
                            <CommissionReportView
                                summary={mockPreviewSummary}
                                dateRangeText="Commission for the month of [Month Year]"
                                entity={mockPreviewAgent}
                                settings={formData}
                                formatCurrency={formatPreviewCurrency}
                            />
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="screen-only max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start pb-20">
                <div className="space-y-6">
                     {/* Connection Doctor */}
                     <Card>
                        <h2 className="text-xl font-bold mb-2">System Health Check</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Verify your connection to Supabase and database integrity.
                        </p>
                        <div className="flex items-center gap-3 mb-2">
                            <button 
                                type="button"
                                onClick={handleConnectionCheck}
                                disabled={checkStatus === 'checking'}
                                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-sm font-semibold"
                            >
                                {checkStatus === 'checking' ? 'Checking...' : 'Run Diagnostics'}
                            </button>
                            {checkStatus === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckIcon className="w-5 h-5" /> Connected</span>}
                            {checkStatus === 'error' && <span className="text-red-600 flex items-center gap-1"><CloseIcon className="w-5 h-5" /> Issue Found</span>}
                        </div>
                        {checkMessage && (
                            <div className={`p-3 rounded text-sm ${checkStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                {checkMessage}
                            </div>
                        )}
                    </Card>

                    {/* Security Controls */}
                    <Card className="border-l-4 border-red-500">
                        <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                            <LockClosedIcon className="w-5 h-5 text-red-500" /> Transaction Locking
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                            Prevent changes to historical data by setting a lock date. Users cannot add, edit, or delete transactions on or before this date.
                        </p>
                        <div className="flex items-end gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lock Data Before</label>
                                <input 
                                    type="date" 
                                    value={localLockDate} 
                                    onChange={e => setLocalLockDate(e.target.value)} 
                                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={handleUpdateLockDate}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
                            >
                                Set Lock
                            </button>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="text-2xl font-bold mb-6 border-b pb-4 dark:border-slate-600">General Settings</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company Name</label>
                                <input type="text" id="companyName" value={formData.companyName} onChange={(e) => handleInputChange('companyName', e.target.value)}
                                 required
                                 className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div>
                             <div>
                                <label htmlFor="currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Default Currency</label>
                                <select id="currency" value={formData.currency} onChange={(e) => handleInputChange('currency', e.target.value)}
                                 className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                                     {currencies.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                                 </select>
                            </div>
                            <div>
                                <label htmlFor="dormancyThreshold" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dormancy Threshold (Days)</label>
                                <input 
                                    type="number" 
                                    id="dormancyThreshold" 
                                    value={formData.dormancyThresholdDays || ''} 
                                    onChange={(e) => handleInputChange('dormancyThresholdDays', parseInt(e.target.value, 10) || 0)}
                                    className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Days an entity can be inactive before showing in the Dormant Accounts widget. Set to 0 to disable.</p>
                            </div>
                             {/* Install App Button */}
                             {isInstallable && (
                                <div className="pt-2">
                                    <button 
                                        type="button" 
                                        onClick={installApp}
                                        className="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                        Install Application
                                    </button>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center">Install this app on your device for faster access.</p>
                                </div>
                            )}
                        </div>
                    </Card>
                    
                    {/* Developer Zone */}
                    <Card className="border-l-4 border-amber-500">
                        <h2 className="text-xl font-bold mb-2 text-amber-600 dark:text-amber-400">Developer Zone</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                            Use these tools to test your integration or secure your data.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <button 
                                type="button" 
                                onClick={() => setIsSeedModalOpen(true)} 
                                className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50 text-sm font-semibold"
                            >
                                Seed Database (Demo Data)
                            </button>
                            <button 
                                type="button" 
                                onClick={handleExportBackup} 
                                disabled={isExporting}
                                className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50 text-sm font-semibold flex items-center gap-2"
                            >
                                <DownloadIcon className="w-4 h-4" />
                                {isExporting ? "Exporting..." : "Export Full Database Backup"}
                            </button>
                        </div>
                    </Card>

                     <Card>
                        <h2 className="text-2xl font-bold mb-6 border-b pb-4 dark:border-slate-600">Report & Branding</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <div>
                                    <label htmlFor="companyAddress" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company Address</label>
                                    <input type="text" id="companyAddress" value={formData.companyAddress} onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                                    className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                                </div>
                                 <div>
                                    <label htmlFor="companyPhone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company Phone</label>
                                    <input type="text" id="companyPhone" value={formData.companyPhone} onChange={(e) => handleInputChange('companyPhone', e.target.value)}
                                    className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="companyEmail" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company Email</label>
                                <input type="email" id="companyEmail" value={formData.companyEmail} onChange={(e) => handleInputChange('companyEmail', e.target.value)}
                                className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div>
                            <div className="flex items-center gap-4">
                                <div>
                                    <label htmlFor="companyLogo" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company Logo</label>
                                    <input type="file" id="companyLogo" accept="image/*" onChange={handleLogoUpload} className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/50 dark:file:text-primary-300 dark:hover:file:bg-primary-900"/>
                                </div>
                                {formData.companyLogo && <img src={formData.companyLogo} alt="Logo Preview" className="h-16 w-auto object-contain rounded-md bg-slate-200 dark:bg-slate-700 p-1" />}
                            </div>
                            <div>
                                <label htmlFor="companyLogoSize" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Logo Height on Report (px)</label>
                                <input type="range" id="companyLogoSize" min="20" max="150" value={formData.companyLogoSize} onChange={(e) => handleInputChange('companyLogoSize', parseInt(e.target.value))} className="mt-1 w-full"/>
                            </div>
                             <div className="flex items-center gap-4">
                                 <div>
                                    <label htmlFor="signatureImage" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Signature Image</label>
                                    <input type="file" id="signatureImage" accept="image/*" onChange={handleSignatureUpload} className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/50 dark:file:text-primary-300 dark:hover:file:bg-primary-900"/>
                                 </div>
                                 {formData.signatureImage && <img src={formData.signatureImage} alt="Signature Preview" className="h-12 w-auto object-contain rounded-md bg-slate-200 dark:bg-slate-700 p-1" />}
                             </div>
                             <div>
                                <label htmlFor="signatureTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Signature Title</label>
                                <input type="text" id="signatureTitle" value={formData.signatureTitle} onChange={(e) => handleInputChange('signatureTitle', e.target.value)} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div>
                            <div>
                                <label htmlFor="commissionTemplateNote" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Commission Report Note</label>
                                <textarea id="commissionTemplateNote" value={formData.commissionTemplateNote} onChange={(e) => handleInputChange('commissionTemplateNote', e.target.value)} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" rows={2}></textarea>
                            </div>
                            <div>
                                <label htmlFor="commissionTemplateThankYou" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Commission Report Closing Note</label>
                                <input type="text" id="commissionTemplateThankYou" value={formData.commissionTemplateThankYou} onChange={(e) => handleInputChange('commissionTemplateThankYou', e.target.value)} className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                 <input type="checkbox" id="showQRCode" checked={formData.showQRCodeOnReport} onChange={(e) => handleInputChange('showQRCodeOnReport', e.target.checked)} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500"/>
                                <label htmlFor="showQRCode" className="text-sm font-medium text-slate-700 dark:text-slate-300">Show QR Code of Rates on Commission Report</label>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="text-2xl font-bold mb-6 border-b pb-4 dark:border-slate-600">Default Commission Rates (%)</h2>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">Branch Rates</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {serviceTypes.map(service => (
                                    <div key={service}>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{serviceNames[service]}</label>
                                        <input type="number" step="0.1" value={formData.defaultRates.branch[service]} onChange={e => handleRateChange('branch', service, e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-6">
                            <h3 className="text-lg font-semibold mb-3">Agent Rates</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {serviceTypes.map(service => (
                                    <div key={service}>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{serviceNames[service]}</label>
                                        <input type="number" step="0.1" value={formData.defaultRates.agent[service]} onChange={e => handleRateChange('agent', service, e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="text-2xl font-bold mb-6 border-b pb-4 dark:border-slate-600">Principal Commission Rates (%)</h2>
                         <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This is the commission your company earns from the principal services (Ria, MoneyGram, etc.). It's used to calculate your Net Commission in reports.</p>
                        <div className="grid grid-cols-2 gap-4">
                            {serviceTypes.map(service => (
                                <div key={service}>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{serviceNames[service]}</label>
                                    <input type="number" step="0.1" value={formData.principalRates[service]} onChange={e => handlePrincipalRateChange(service, e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" />
                                </div>
                            ))}
                        </div>
                    </Card>
                    <div className="sticky bottom-0 py-4 bg-slate-100 dark:bg-slate-900 z-10">
                        <button type="submit" disabled={isSaving} className="w-full bg-primary-600 text-white p-3 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 text-lg font-bold">
                            {isSaving ? "Saving..." : "Save All Settings"}
                        </button>
                    </div>
                </div>

                <div className="lg:sticky lg:top-6">
                    <div className="flex items-center justify-center gap-3 mb-2 relative">
                        <h3 className="text-xl font-bold text-center">Commission Report Preview</h3>
                         <button 
                            type="button"
                            onClick={handlePrintPreview}
                            className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 absolute right-0"
                            title="Print Preview"
                        >
                            <PrinterIcon className="w-5 h-5" />
                        </button>
                    </div>
                     <div className="border-4 border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden transform scale-90 -translate-y-8 origin-top">
                        <CommissionReportView
                            summary={mockPreviewSummary}
                            dateRangeText="Commission for the month of [Month Year]"
                            entity={mockPreviewAgent}
                            settings={formData}
                            formatCurrency={formatPreviewCurrency}
                        />
                    </div>
                </div>
            </form>

             {/* Modals are outside the screen-only form, but we ensure they have proper classes if needed, mostly they are portals/overlays so handled by UI library */}
            <div className="screen-only">
                <ConfirmationModal 
                    isOpen={isSeedModalOpen} 
                    onClose={() => setIsSeedModalOpen(false)} 
                    onConfirm={handleSeedDatabase} 
                    title="Confirm Data Seeding" 
                    message="This will insert sample branches, agents, and transactions into your database. This is useful for testing. Do you want to proceed?" 
                    confirmText={isSeeding ? "Seeding..." : "Yes, Seed Data"}
                />
            </div>
        </>
    );
};

export default SettingsPage;
