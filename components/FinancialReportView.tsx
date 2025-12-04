
import React, { FC, useState, useEffect } from 'react';
import { Settings } from '../types';

export type ReportTable = {
    title: string;
    columns: string[];
    rows: (string | number)[][];
    footer?: { label: string; value: string }[];
};

type FinancialReportViewProps = {
    title: string;
    dateRangeText: string;
    settings: Settings;
    tables: ReportTable[];
    summary: { label: string; value: string; highlight?: boolean; color?: string }[];
    isForPrint?: boolean;
};

const FinancialReportView: FC<FinancialReportViewProps> = ({ title, dateRangeText, settings, tables, summary, isForPrint = false }) => {
    const containerClass = isForPrint
        ? "bg-white w-full text-black font-sans"
        : "bg-white p-8 shadow-lg mx-auto max-w-3xl border border-slate-200 text-black font-sans my-4";

    // Image Preloading State
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [sigSrc, setSigSrc] = useState<string | null>(null);

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

    return (
        <div className={containerClass}>
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
                <p className="text-sm mt-1 text-slate-900">{settings.companyAddress}</p>
                <p className="text-sm text-slate-900">{settings.companyEmail} / {settings.companyPhone}</p>
            </header>
            
            <div className="border-t-2 border-slate-800 my-6"></div>

            {/* Report Title */}
            <div className="text-center my-6">
                <h2 className="text-2xl font-bold uppercase tracking-wider text-black">{title}</h2>
                <div className="inline-block bg-slate-100 text-slate-800 text-sm font-semibold px-4 py-1 rounded-md mt-2">
                    {dateRangeText}
                </div>
            </div>

            {/* Summary Section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200">
                {summary.map((item, index) => (
                    <div key={index} className="text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{item.label}</p>
                        <p className={`text-lg font-mono font-bold ${item.color || 'text-slate-900'}`}>
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Tables */}
            <div className="space-y-8">
                {tables.map((table, tIndex) => (
                    <div key={tIndex}>
                        <h3 className="text-lg font-bold mb-2 border-b-2 border-slate-300 pb-1 text-black">{table.title}</h3>
                        {table.rows.length > 0 ? (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100">
                                    <tr>
                                        {table.columns.map((col, cIndex) => (
                                            <th key={cIndex} className={`p-2 font-semibold text-slate-800 ${cIndex > 1 ? 'text-right' : ''}`}>
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {table.rows.map((row, rIndex) => (
                                        <tr key={rIndex}>
                                            {row.map((cell, cIndex) => (
                                                <td key={cIndex} className={`p-2 text-slate-800 ${cIndex > 1 ? 'text-right font-mono' : ''}`}>
                                                    {cell}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-slate-500 italic text-sm p-2">No records found for this period.</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer / Signature */}
            <div className="mt-16">
                <div className="flex justify-end">
                    <div className="text-center w-48">
                        {sigSrc && (
                            <img
                                src={sigSrc}
                                alt="Signature"
                                className="h-12 w-auto mx-auto mb-1 object-contain"
                            />
                        )}
                        <div className="border-t border-slate-400 pt-2">
                            <p className="text-sm font-semibold text-black">{settings.signatureTitle}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <footer className="mt-8 text-center text-xs text-slate-400">
                Generated on {new Date().toLocaleString()}
            </footer>
        </div>
    );
};

export default FinancialReportView;
