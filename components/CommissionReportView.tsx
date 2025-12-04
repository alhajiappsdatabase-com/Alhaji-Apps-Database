
import React, { FC, useEffect, useState, useRef } from 'react';
import { Settings, Branch, Agent, CommissionSummaryItem } from '../types';

type CommissionReportViewProps = {
    summary: CommissionSummaryItem;
    dateRangeText: string;
    entity: Branch | Agent;
    settings: Settings;
    formatCurrency: (amount: number) => string;
    onQrCodeRendered?: () => void;
};

const CommissionReportView: FC<CommissionReportViewProps> = ({ summary, dateRangeText, entity, settings, formatCurrency, onQrCodeRendered }) => {
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [sigSrc, setSigSrc] = useState<string | null>(null);
    
    // Use a ref to ensure we call the latest callback, but don't re-trigger effects
    const onQrCodeRenderedRef = useRef(onQrCodeRendered);
    onQrCodeRenderedRef.current = onQrCodeRendered; 

    // Preload Images for PDF Generation (CORS fix)
    useEffect(() => {
        const preloadImage = async (url: string | null, setter: React.Dispatch<React.SetStateAction<string | null>>) => {
            if (!url) { setter(null); return; }
            if (url.startsWith('data:')) { setter(url); return; }
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) throw new Error('Network error');
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => setter(reader.result as string);
                reader.readAsDataURL(blob);
            } catch (error) {
                console.warn("Image preload failed, using fallback URL", error);
                setter(url);
            }
        };
        preloadImage(settings.companyLogo, setLogoSrc);
        preloadImage(settings.signatureImage, setSigSrc);
    }, [settings.companyLogo, settings.signatureImage]);


    // Effect 1: Generate the QR code data URL
    useEffect(() => {
        if (!settings.showQRCodeOnReport) {
            setQrCodeDataUrl(''); 
            return;
        }

        setQrCodeDataUrl(null);

        if (typeof window.QRCode === 'undefined') {
            setQrCodeDataUrl('');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);
        
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let attempts = 0;

        const cleanup = () => {
            if (intervalId) clearInterval(intervalId);
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
        };

        try {
            new window.QRCode(tempDiv, {
                text: JSON.stringify(entity.rates),
                width: 256,
                height: 256,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: (window.QRCode as any).CorrectLevel.H
            });

            intervalId = setInterval(() => {
                // Strategy 1: Try getting canvas first (most reliable for immediate Data URL extraction)
                const canvas = tempDiv.querySelector('canvas');
                if (canvas) {
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        setQrCodeDataUrl(dataUrl);
                        cleanup();
                        return;
                    } catch (e) {
                        // Ignore canvas taint issues, fall through to img
                    }
                }

                // Strategy 2: Fallback to img tag
                const qrImg = tempDiv.querySelector<HTMLImageElement>('img');
                if (qrImg && qrImg.src && qrImg.src.startsWith('data:')) {
                    setQrCodeDataUrl(qrImg.src);
                    cleanup();
                } else {
                    attempts++;
                    if (attempts > 40) { // Wait up to 2 seconds
                        console.warn("QR Code generation timed out");
                        setQrCodeDataUrl('');
                        cleanup();
                    }
                }
            }, 50);
            
        } catch (error) {
            console.error("QR Code error", error);
            setQrCodeDataUrl('');
            cleanup();
        }

        return cleanup;
    }, [entity.rates, settings.showQRCodeOnReport]);


    // Effect 2: Signal readiness ONLY if QR is disabled or failed (empty string)
    // If QR is present (string), we wait for the <img> onLoad event.
    useEffect(() => {
        if (qrCodeDataUrl === '') {
            // Give a tiny buffer for general layout paint before signaling ready
            const timer = setTimeout(() => {
                onQrCodeRenderedRef.current?.();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [qrCodeDataUrl]);

    // Handler: Triggered when the QR image is fully loaded and painted
    const handleQrImageLoad = () => {
        // Add a significantly larger buffer to ensure the browser has fully composited the image onto the DOM
        // This prevents "half-rendered" images in html2canvas captures.
        setTimeout(() => {
             onQrCodeRenderedRef.current?.();
        }, 500);
    };

    return (
        <div className="commission-report-page bg-white p-8 shadow-lg mx-auto max-w-2xl border border-slate-200 text-black font-sans my-4">
            {/* Header */}
            <header className="text-center mb-6">
                {logoSrc && (
                    <img
                        src={logoSrc}
                        alt="Company Logo"
                        className="w-auto object-contain mx-auto mb-4"
                        style={{ height: `${settings.companyLogoSize}px` }}
                    />
                )}
                <h1 className="text-3xl font-extrabold text-black tracking-wide">{settings.companyName}</h1>
                <p className="text-sm mt-1">{settings.companyAddress}</p>
                <p className="text-sm">{settings.companyEmail}</p>
            </header>
            
            <div className="border-t-2 border-orange-400 my-6"></div>

            {/* Title */}
            <div className="text-center my-6">
                <h2 className="text-red-600 text-2xl font-bold">{summary.entityName}</h2>
                <div className="inline-block bg-slate-200 text-slate-800 text-sm font-semibold px-4 py-1 rounded-md mt-2">
                    {dateRangeText}
                </div>
            </div>

            {/* Payments Details */}
            <div className="max-w-md mx-auto my-8 space-y-3 text-lg">
                <div className="flex justify-between items-center">
                    <span>Ria Payments</span>
                    <span className="font-mono">{formatCurrency(summary.totalRia)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>MoneyGram Payments</span>
                    <span className="font-mono">{formatCurrency(summary.totalMoneyGram)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>Western Union Payments</span>
                    <span className="font-mono">{formatCurrency(summary.totalWesternUnion)}</span>
                </div>
                 <div className="flex justify-between items-center">
                    <span>Afro Payments</span>
                    <span className="font-mono">{formatCurrency(summary.totalAfro)}</span>
                </div>
                <div className="border-t border-slate-300 pt-3 flex justify-between items-center">
                    <span className="font-bold">Total payments</span>
                    <span className="font-mono font-bold">{formatCurrency(summary.totalPayment)}</span>
                </div>
            </div>

             <div className="border-t-4 border-slate-800 max-w-md mx-auto"></div>

            {/* Total Commission */}
             <div className="max-w-md mx-auto my-4 space-y-2 text-xl">
                <div className="flex justify-between items-center">
                    <span className="font-bold">Total Commission</span>
                    <span className="font-mono font-bold text-green-600">{formatCurrency(summary.totalCommission)}</span>
                </div>
            </div>

            {/* Signature & QR Code */}
            <div className="flex justify-between items-end mt-16 mb-8">
                <div className="text-center">
                    {settings.showQRCodeOnReport && (
                        <div className="p-1 bg-white block qr-code-container" style={{ width: '102px', height: '102px' }}>
                            {qrCodeDataUrl === null ? (
                                <div className="w-[100px] h-[100px] bg-slate-200 animate-pulse flex items-center justify-center text-center text-xs text-slate-500">
                                    Loading...
                                </div>
                            ) : qrCodeDataUrl ? (
                                <img 
                                    src={qrCodeDataUrl} 
                                    alt="Commission Rates QR Code" 
                                    width="100" 
                                    height="100" 
                                    style={{ display: 'block', width: '100px', height: '100px', objectFit: 'contain' }}
                                    onLoad={handleQrImageLoad}
                                    crossOrigin="anonymous"
                                />
                            ) : null}
                        </div>
                    )}
                </div>
                <div className="text-center">
                    {sigSrc && (
                        <img
                            src={sigSrc}
                            alt="Signature"
                            className="h-12 w-auto mx-auto mb-1 object-contain"
                        />
                    )}
                    <div className="border-t-2 border-slate-400 w-48 pt-2">
                        <p className="text-sm font-semibold">{settings.signatureTitle}</p>
                    </div>
                </div>
            </div>

            {/* Footer Notes */}
            <footer className="mt-12 p-4 bg-slate-100 rounded-lg text-xs text-slate-700 space-y-2 text-center">
                <p className="font-bold">{settings.commissionTemplateNote}</p>
                <p>{settings.companyEmail} / {settings.companyPhone}</p>
                <p className="pt-2">{settings.commissionTemplateThankYou}</p>
            </footer>

        </div>
    );
};

export default CommissionReportView;
