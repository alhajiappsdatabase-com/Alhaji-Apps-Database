import React, { useState, useEffect, useRef, useMemo, FC } from 'react';
import { Branch, Agent } from '../types';
// Fix: Import NavItem from types.ts to avoid circular dependency with App.tsx
import { NavItem } from '../types';
import { SearchIcon, ManagementIcon, AgentIcon } from './icons';

type CommandResult = {
  id: string;
  type: 'page' | 'branch' | 'agent';
  name: string;
  details?: string;
  icon: React.ReactNode;
  group: 'Navigation' | 'Branches' | 'Agents';
};

type CommandPaletteProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: CommandResult) => void;
    navItems: NavItem[];
    branches: Branch[];
    agents: Agent[];
};

const CommandPalette: FC<CommandPaletteProps> = ({ isOpen, onClose, onSelect, navItems, branches, agents }) => {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsRef = useRef<HTMLUListElement>(null);
    const activeItemRef = useRef<HTMLLIElement>(null);

    const searchResults = useMemo((): CommandResult[] => {
        const q = query.toLowerCase();
        if (!q) return [];
        
        const pageResults: CommandResult[] = navItems
            .filter(item => item.name.toLowerCase().includes(q))
            .map(item => ({
                id: item.page,
                type: 'page',
                name: item.name,
                icon: <item.icon className="w-5 h-5 text-slate-500 dark:text-slate-400" />,
                group: 'Navigation',
            }));

        const branchResults: CommandResult[] = branches
            .filter(branch => branch.isActive && (branch.name.toLowerCase().includes(q) || branch.location.toLowerCase().includes(q)))
            .map(branch => ({
                id: branch.id,
                type: 'branch',
                name: branch.name,
                details: branch.location,
                icon: <ManagementIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />,
                group: 'Branches',
            }));
            
        const agentResults: CommandResult[] = agents
            .filter(agent => agent.isActive && (agent.name.toLowerCase().includes(q) || agent.location.toLowerCase().includes(q)))
            .map(agent => ({
                id: agent.id,
                type: 'agent',
                name: agent.name,
                details: agent.location,
                icon: <AgentIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />,
                group: 'Agents',
            }));

        return [...pageResults, ...branchResults, ...agentResults];
    }, [query, navItems, branches, agents]);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);
    
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        if (!activeItemRef.current || !resultsRef.current) return;
        activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (searchResults.length > 0) {
                    setActiveIndex(prev => (prev + 1) % searchResults.length);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (searchResults.length > 0) {
                    setActiveIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (searchResults[activeIndex]) {
                    onSelect(searchResults[activeIndex]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, searchResults, activeIndex, onClose, onSelect]);
    
    if (!isOpen) return null;

    let lastGroup: string | null = null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-lg shadow-2xl animate-fade-in-scale-up" onClick={e => e.stopPropagation()}>
                <div className="relative">
                    <SearchIcon className="absolute top-3.5 left-4 h-5 w-5 text-slate-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search for pages, branches, or agents..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full bg-transparent p-3 pl-11 text-slate-800 dark:text-slate-200 focus:outline-none"
                        autoComplete="off"
                    />
                </div>
                {query ? (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                        {searchResults.length > 0 ? (
                            <ul ref={resultsRef} className="max-h-[50vh] overflow-y-auto p-2">
                                {searchResults.map((item, index) => {
                                    const showGroupHeader = item.group !== lastGroup;
                                    lastGroup = item.group;
                                    return (
                                        <React.Fragment key={item.type + item.id}>
                                            {showGroupHeader && (
                                                <li className="px-2 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">{item.group}</li>
                                            )}
                                            <li
                                                ref={activeIndex === index ? activeItemRef : null}
                                                onClick={() => onSelect(item)}
                                                onMouseMove={() => setActiveIndex(index)}
                                                className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${activeIndex === index ? 'bg-primary-500 text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                            >
                                                <div className={`${activeIndex === index ? 'text-white' : ''}`}>{item.icon}</div>
                                                <div className="flex-grow">
                                                    <p className={`font-medium ${activeIndex === index ? 'text-white' : ''}`}>{item.name}</p>
                                                    {item.details && <p className={`text-xs ${activeIndex === index ? 'text-primary-200' : 'text-slate-500 dark:text-slate-400'}`}>{item.details}</p>}
                                                </div>
                                            </li>
                                        </React.Fragment>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="text-center p-8 text-slate-500">
                                <p>No results found for "{query}"</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center p-8 text-slate-500">
                        <p>Start typing to search...</p>
                    </div>
                )}
                 <div className="hidden sm:flex items-center gap-4 p-2 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-700">
                    <span><kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">↑</kbd> <kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">↓</kbd> to navigate</span>
                    <span><kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Enter</kbd> to select</span>
                    <span><kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Esc</kbd> to close</span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
