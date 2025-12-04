
import React, { FC, useRef, useState, useEffect } from 'react';
import { Settings } from '../types';
import { DownloadIcon, CloseIcon, PrinterIcon } from './icons';

// Define ShareIcon locally since it's not in icons.tsx yet
const ShareIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
);

const TicketIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
    </svg>
);

export type ReceiptData = {
    title: string;
    date: string;
    entityName?: string;
    details: { label: string; value: string; bold?: boolean }[];
    totalAmount?: string;
    note?: string;
};

type ReceiptViewProps = {
    data: ReceiptData;
    settings: Settings;
    onClose?: () => void;
};

const ReceiptView: FC<ReceiptViewProps> = ({ data, settings, onClose }) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Image Preloading State
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [sigSrc, setSigSrc] = useState<string | null>(null);

    useEffect(() => {
        const preloadImage = async (url: string | null, setter: React.Dispatch<React.SetStateAction<string | null>>) => {
            if (!url) {
                setter(null);
                return;
            }
            if (url.startsWith('data:')) {
                setter(url);
                return;
            }
            try {
                // Fetch the image as a blob to bypass CORS issues in html2canvas
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) throw new Error('Network response was not ok');
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => setter(reader.result as string);
                reader.readAsDataURL(blob);
            } catch (error) {
                console.warn("Image preload failed, falling back to URL:", url, error);
                // Fallback: try using the URL directly, though html2canvas might fail
                setter(url);
            }
        };

        preloadImage(settings.companyLogo, setLogoSrc);
        preloadImage(settings.signatureImage, setSigSrc);
    }, [settings.companyLogo, settings.signatureImage]);

    const generateImage = async (): Promise<string | null> => {
        if (!receiptRef.current || !window.html2canvas) return null;
        try {
            const canvas = await window.html2canvas(receiptRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            return canvas.toDataURL('image/png');
        } catch (e) {
            console.error("Image generation failed", e);
            return null;
        }
    };

    const handleDownloadPdf = async () => {
        if (!window.jspdf) return;
        setIsGenerating(true);
        try {
            const imgData = await generateImage();
            if (imgData) {
                const { jsPDF } = window.jspdf;
                // 80mm width matches the receipt style
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [80, 200] }); 
                
                const pdfWidth = 80;
                const props = doc.getImageProperties(imgData);
                const pdfHeight = (props.height * pdfWidth) / props.width;

                doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                doc.save(`receipt-${data.date.split('T')[0]}.pdf`);
            }
        } catch (e) {
            alert("Failed to generate PDF");
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePOSPrint = () => {
        if (!receiptRef.current) return;
        setIsGenerating(true);

        // 1. Clone the receipt element to isolate it
        // This prevents layout issues where the receipt is deep inside the DOM tree
        const clone = receiptRef.current.cloneNode(true) as HTMLElement;
        clone.classList.add('printable-clone');
        
        // 2. Append to body directly so it's top-level
        document.body.appendChild(clone);
        
        // 3. Add the class that hides everything else in CSS
        document.body.classList.add('pos-print-mode');

        const cleanup = () => {
            document.body.classList.remove('pos-print-mode');
            if (document.body.contains(clone)) {
                document.body.removeChild(clone);
            }
            setIsGenerating(false);
            window.removeEventListener('afterprint', cleanup);
        };

        window.addEventListener('afterprint', cleanup);

        // 4. Trigger Print with a slight delay to ensure render
        setTimeout(() => {
            window.print();
        }, 100);
    };

    const handleShare = async () => {
        setIsGenerating(true);
        try {
            // Strategy 1: Web Share API with File (Mobile)
            if (navigator.share && window.html2canvas) {
                const canvas = await window.html2canvas(receiptRef.current!, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        const file = new File([blob], "receipt.png", { type: "image/png" });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            try {
                                await navigator.share({
                                    files: [file],
                                    title: 'Receipt',
                                    text: `Receipt from ${settings.companyName}`
                                });
                                setIsGenerating(false);
                                return;
                            } catch (shareError) {
                                // Share cancelled or failed, fall through
                            }
                        }
                    }
                    // Fallback if blob share failed
                    fallbackToWhatsAppText();
                });
            } else {
                fallbackToWhatsAppText();
            }
        } catch (e) {
            fallbackToWhatsAppText();
        }
    };

    const fallbackToWhatsAppText = () => {
        setIsGenerating(false);
        const text = `*RECEIPT*\n${settings.companyName}\n\nDate: ${new Date(data.date).toLocaleString()}\n${data.entityName ? `To: ${data.entityName}\n` : ''}\n*${data.title}*\n\n${data.details.map(d => `${d.label}: ${d.value}`).join('\n')}\n\n*TOTAL: ${data.totalAmount || ''}*\n\n${data.note || ''}`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-fade-in">
            {/* Actions Bar */}
            <div className="flex items-center gap-3 mb-6 flex-wrap justify-center">
                <button 
                    onClick={handlePOSPrint} 
                    disabled={isGenerating}
                    className="flex flex-col items-center gap-1 text-white hover:text-yellow-400 transition-colors"
                    title="Print to POS Thermal Printer"
                >
                    <div className="p-3 bg-slate-800 rounded-full border border-slate-600">
                        <TicketIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs">POS Print</span>
                </button>

                <button 
                    onClick={handleDownloadPdf} 
                    disabled={isGenerating}
                    className="flex flex-col items-center gap-1 text-white hover:text-blue-400 transition-colors"
                >
                    <div className="p-3 bg-slate-800 rounded-full">
                        <DownloadIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs">PDF</span>
                </button>

                <button 
                    onClick={handleShare}
                    disabled={isGenerating}
                    className="flex flex-col items-center gap-1 text-white hover:text-green-400 transition-colors"
                >
                    <div className="p-3 bg-slate-800 rounded-full">
                        <ShareIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs">Share</span>
                </button>

                <button 
                    onClick={onClose} 
                    className="flex flex-col items-center gap-1 text-white hover:text-red-400 transition-colors"
                >
                    <div className="p-3 bg-slate-800 rounded-full">
                        <CloseIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs">Close</span>
                </button>
            </div>

            {/* Receipt Preview */}
            <div className="overflow-y-auto max-h-[70vh] rounded-sm shadow-2xl">
                <div ref={receiptRef} className="bg-white text-black font-mono text-xs p-4 mx-auto pos-receipt-content" style={{ width: '80mm', minHeight: '100mm' }}>
                    {/* Header */}
                    <div className="text-center mb-6">
                        {logoSrc && (
                            <img
                                src={logoSrc}
                                alt="Logo"
                                className="h-12 w-auto mx-auto mb-2 object-contain grayscale"
                                // No crossOrigin needed for data URI, but safe to keep or remove
                            />
                        )}
                        <h2 className="font-bold text-sm uppercase tracking-wider">{settings.companyName}</h2>
                        <p className="text-[10px] mt-1">{settings.companyAddress}</p>
                        <p className="text-[10px]">{settings.companyPhone}</p>
                        <p className="text-[10px]">{settings.companyEmail}</p>
                    </div>

                    <div className="border-b-2 border-dashed border-black mb-4"></div>

                    {/* Meta */}
                    <div className="mb-4 text-[10px] space-y-1">
                        <p className="flex justify-between">
                            <span>DATE:</span>
                            <span>{new Date(data.date).toLocaleDateString()}</span>
                        </p>
                        <p className="flex justify-between">
                            <span>TIME:</span>
                            <span>{new Date().toLocaleTimeString()}</span>
                        </p>
                        {data.entityName && (
                             <p className="flex justify-between">
                                <span>TO:</span>
                                <span className="font-bold uppercase">{data.entityName}</span>
                            </p>
                        )}
                    </div>

                    {/* Title */}
                    <div className="text-center mb-4">
                         <span className="bg-black text-white px-2 py-1 font-bold text-sm uppercase rounded-sm">{data.title}</span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 mb-4">
                        {data.details.map((item, idx) => (
                            <div key={idx} className={`flex justify-between border-b border-dotted border-gray-300 pb-1 ${item.bold ? 'font-bold text-[11px]' : ''}`}>
                                <span>{item.label}</span>
                                <span>{item.value}</span>
                            </div>
                        ))}
                    </div>

                    {data.totalAmount && (
                        <div className="border-t-2 border-black pt-2 mb-4">
                            <div className="flex justify-between font-bold text-base">
                                <span>TOTAL</span>
                                <span>{data.totalAmount}</span>
                            </div>
                        </div>
                    )}
                    
                    {data.note && (
                        <div className="mb-6 text-[10px] italic text-center border p-2 rounded border-gray-300">
                            "{data.note}"
                        </div>
                    )}

                    {/* Signature Line */}
                    <div className="mt-12 mb-4 pt-2 border-t border-black w-3/4 mx-auto text-center">
                         {sigSrc && (
                            <img src={sigSrc} className="h-8 mx-auto -mt-10 mb-2 bg-white" alt="Sig"/>
                         )}
                         <p className="text-[9px] uppercase">Authorized Signature</p>
                    </div>
                    
                    <div className="text-center mt-6">
                        <p className="text-[9px] font-bold">*** THANK YOU ***</p>
                        <p className="text-[8px] mt-1 text-gray-500">Generated by FinTrack Pro</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceiptView;
