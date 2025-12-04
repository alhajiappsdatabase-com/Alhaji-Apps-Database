
import React, { useState, useRef, useMemo, FC } from 'react';

type ChartDataPoint = {
    date: string;
    volume: number;
    capitalOut: number;
    capitalIn: number;
};

type FinancialTrendChartProps = {
    data: ChartDataPoint[];
    formatCurrency: (val: number) => string;
    className?: string;
};

// --- SVG Path Smoothing Logic ---
const svgPath = (points: { x: number; y: number }[], command: (point: any, i: number, a: any) => string) => {
    const d = points.reduce((acc, point, i, a) => i === 0
        ? `M ${point.x},${point.y}`
        : `${acc} ${command(point, i, a)}`
    , '');
    return d;
};

const line = (pointA: any, pointB: any) => {
    const lengthX = pointB.x - pointA.x;
    const lengthY = pointB.y - pointA.y;
    return {
        length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
        angle: Math.atan2(lengthY, lengthX)
    };
};

const controlPoint = (current: any, previous: any, next: any, reverse?: boolean) => {
    const p = previous || current;
    const n = next || current;
    const smoothing = 0.15; // 0 to 1, higher is smoother
    const o = line(p, n);
    const angle = o.angle + (reverse ? Math.PI : 0);
    const length = o.length * smoothing;
    const x = current.x + Math.cos(angle) * length;
    const y = current.y + Math.sin(angle) * length;
    return { x, y };
};

const bezierCommand = (point: any, i: number, a: any) => {
    const cps = controlPoint(a[i - 1], a[i - 2], point);
    const cpe = controlPoint(point, a[i - 1], a[i + 1], true);
    return `C ${cps.x},${cps.y} ${cpe.x},${cpe.y} ${point.x},${point.y}`;
};

export const FinancialTrendChart: FC<FinancialTrendChartProps> = ({ data, formatCurrency, className = '' }) => {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Calculate Scales
    const { points } = useMemo(() => {
        if (data.length === 0) return { maxVal: 0, points: [] };

        const max = Math.max(...data.map(d => Math.max(d.volume, d.capitalOut))) * 1.15 || 1000; // Add 15% headroom
        
        // Map data to 100x100 coordinate system
        const mappedPoints = data.map((d, i) => ({
            x: i * (100 / (data.length - 1)),
            yVolume: 100 - (d.volume / max) * 100,
            yCapital: 100 - (d.capitalOut / max) * 100,
            original: d
        }));

        return { maxVal: max, points: mappedPoints };
    }, [data]);

    // 2. Generate Smooth Paths
    const volumePath = useMemo(() => {
        if (points.length === 0) return '';
        return svgPath(points.map(p => ({ x: p.x, y: p.yVolume })), bezierCommand);
    }, [points]);

    const volumeArea = useMemo(() => {
        if (points.length === 0) return '';
        return `${volumePath} L 100,100 L 0,100 Z`;
    }, [volumePath, points]);

    const capitalPath = useMemo(() => {
        if (points.length === 0) return '';
        return svgPath(points.map(p => ({ x: p.x, y: p.yCapital })), bezierCommand);
    }, [points]);

    const capitalArea = useMemo(() => {
        if (points.length === 0) return '';
        return `${capitalPath} L 100,100 L 0,100 Z`;
    }, [capitalPath, points]);

    // 3. Interaction Handler
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current || points.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const percentage = (x / width);
        const index = Math.min(Math.max(Math.round(percentage * (data.length - 1)), 0), data.length - 1);
        
        setHoverIndex(index);
    };

    const handleMouseLeave = () => {
        setHoverIndex(null);
    };

    if (data.length === 0) {
        return <div className="flex items-center justify-center h-full text-slate-400 font-medium">No data available</div>;
    }

    const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;

    return (
        <div 
            ref={containerRef} 
            className={`relative w-full h-full select-none touch-none ${className}`} 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={(e) => {
                const touch = e.touches[0];
                const rect = containerRef.current?.getBoundingClientRect();
                if(rect) {
                    const x = touch.clientX - rect.left;
                    const percentage = (x / rect.width);
                    const index = Math.min(Math.max(Math.round(percentage * (data.length - 1)), 0), data.length - 1);
                    setHoverIndex(index);
                }
            }}
        >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                    {/* Modern Gradient: Violet for Volume */}
                    <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" /> {/* violet-500 */}
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                    </linearGradient>
                    {/* Modern Gradient: Sky Blue for Capital */}
                    <linearGradient id="gradCapital" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" /> {/* sky-500 */}
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                    </linearGradient>
                    
                    {/* Glow Filter */}
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="1" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    
                    {/* Line Shadow */}
                    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.2"/>
                    </filter>
                </defs>

                {/* Grid Lines (Subtle & Dashed) */}
                {[0, 25, 50, 75, 100].map((y) => (
                    <line 
                        key={y} x1="0" y1={y} x2="100" y2={y} 
                        stroke="currentColor" 
                        strokeOpacity="0.08"
                        strokeWidth="0.5" 
                        strokeDasharray="2,2"
                        className="text-slate-900 dark:text-white"
                    />
                ))}

                {/* Area Fills */}
                <path d={volumeArea} fill="url(#gradVolume)" className="transition-all duration-300 ease-out" />
                <path d={capitalArea} fill="url(#gradCapital)" className="transition-all duration-300 ease-out" />

                {/* Curve Lines with Shadow & Glow */}
                <path 
                    d={volumePath} 
                    fill="none" 
                    stroke="#8b5cf6" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    filter="url(#shadow)"
                    vectorEffect="non-scaling-stroke"
                    className="transition-all duration-300"
                />
                <path 
                    d={capitalPath} 
                    fill="none" 
                    stroke="#0ea5e9" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    filter="url(#shadow)"
                    vectorEffect="non-scaling-stroke"
                    className="transition-all duration-300"
                />

                {/* Hover Indicator Line */}
                {hoverPoint && (
                    <line 
                        x1={hoverPoint.x} 
                        y1="0" 
                        x2={hoverPoint.x} 
                        y2="100" 
                        stroke="currentColor" 
                        strokeWidth="0.5" 
                        strokeDasharray="2" 
                        className="text-slate-400 dark:text-slate-500 transition-all duration-75"
                        vectorEffect="non-scaling-stroke"
                    />
                )}

                {/* Hover Dots with Glow Halo */}
                {hoverPoint && (
                    <>
                        <g filter="url(#glow)">
                            <circle cx={hoverPoint.x} cy={hoverPoint.yVolume} r="2" fill="#8b5cf6" stroke="white" strokeWidth="1" className="dark:stroke-slate-800" />
                        </g>
                        <g filter="url(#glow)">
                            <circle cx={hoverPoint.x} cy={hoverPoint.yCapital} r="2" fill="#0ea5e9" stroke="white" strokeWidth="1" className="dark:stroke-slate-800" />
                        </g>
                    </>
                )}
            </svg>

            {/* X Axis Labels */}
            <div className="absolute bottom-0 left-0 w-full flex justify-between text-[10px] font-medium text-slate-400 translate-y-5 pointer-events-none px-1">
                {points.map((p, i) => (
                    <div key={i} style={{ width: '0', display: 'flex', justifyContent: 'center' }}>
                       {(i === 0 || i === points.length - 1 || i % 2 === 0) && (
                           <span className="whitespace-nowrap">{new Date(p.original.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                       )}
                    </div>
                ))}
            </div>

            {/* Glassmorphism Tooltip Overlay */}
            {hoverPoint && (
                <div 
                    className="absolute z-20 backdrop-blur-md bg-white/90 dark:bg-slate-800/90 border border-slate-200/50 dark:border-slate-700/50 shadow-2xl rounded-xl p-3 text-xs pointer-events-none animate-fade-in-up ring-1 ring-black/5"
                    style={{ 
                        left: `${hoverPoint.x}%`, 
                        top: '0%', 
                        transform: `translate(${hoverPoint.x > 50 ? '-105%' : '5%'}, 10px)` 
                    }}
                >
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                        {new Date(hoverPoint.original.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.5)]"></span>
                                <span className="text-slate-500 dark:text-slate-400">Volume</span>
                            </div>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{formatCurrency(hoverPoint.original.volume)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.5)]"></span>
                                <span className="text-slate-500 dark:text-slate-400">Capital</span>
                            </div>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{formatCurrency(hoverPoint.original.capitalOut)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
