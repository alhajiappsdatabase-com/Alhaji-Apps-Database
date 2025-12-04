
import React, { useEffect, useState, useRef } from 'react';
import { useAppContext } from '../types';
import { ActiveUser } from '../types';

const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

// Helper for "Online for X mins"
const timeAgoShort = (dateString: string) => {
    try {
        const diff = (new Date().getTime() - new Date(dateString).getTime()) / 1000;
        if (diff < 60) return 'Just now';
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h`;
    } catch (e) {
        return 'Online';
    }
};

export const ActiveUsers: React.FC = () => {
    const { api, currentUser, users: allUsers } = useAppContext();
    const [isHovered, setIsHovered] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Initialize with current user immediately so it shows up instantly
    const [activeUsers, setActiveUsers] = useState<ActiveUser[]>(() => {
        if (!currentUser) return [];
        return [{
            userId: currentUser.id,
            name: currentUser.name,
            avatarUrl: currentUser.avatarUrl,
            onlineAt: new Date().toISOString(),
            color: stringToColor(currentUser.id)
        }];
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!currentUser) return;

        const myColor = stringToColor(currentUser.id);
        const userState: ActiveUser = {
            userId: currentUser.id,
            name: currentUser.name,
            avatarUrl: currentUser.avatarUrl,
            onlineAt: new Date().toISOString(),
            color: myColor
        };

        // Ensure current user is always in the list initially
        setActiveUsers(prev => {
            if (prev.some(u => u.userId === currentUser.id)) return prev;
            return [...prev, userState];
        });

        const channelName = `presence-company-${currentUser.companyId}`;
        
        const subscription = api.realtime.subscribeToPresence(channelName, userState, (users: ActiveUser[]) => {
            // Filter to show unique users
            const uniqueUsers = new Map<string, ActiveUser>();
            
            // Add synced users
            users.forEach(u => uniqueUsers.set(u.userId, u));
            
            // Ensure current user is always present
            if (!uniqueUsers.has(currentUser.id)) {
                uniqueUsers.set(currentUser.id, userState);
            }
            
            // Sort: Current user first, then others alphabetically
            const sorted = Array.from(uniqueUsers.values()).sort((a, b) => {
                if (a.userId === currentUser.id) return -1;
                if (b.userId === currentUser.id) return 1;
                return a.name.localeCompare(b.name);
            });
            
            setActiveUsers(sorted);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [api, currentUser]);

    // Helper to get role (defaults to Member if user list not loaded)
    const getUserRole = (userId: string) => {
        const found = allUsers.find(u => u.id === userId);
        return found ? found.role : 'Member';
    };

    if (activeUsers.length === 0) return null;

    return (
        <div ref={containerRef} className="relative z-20">
            <button 
                className={`flex items-center gap-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full px-2 py-1.5 border transition-all duration-300 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/50 ${isOpen ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-slate-200 dark:border-slate-600 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-500'}`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => setIsOpen(!isOpen)}
                title="Click to view active users list"
            >
                {/* Avatars Row */}
                <div 
                    className={`flex items-center transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden py-1 ${isHovered ? 'space-x-1 pl-1' : '-space-x-3 px-0'}`}
                >
                    {activeUsers.slice(0, 5).map((user) => (
                        <div key={user.userId} className="relative flex-shrink-0 transition-transform duration-300 hover:z-50 hover:scale-110">
                            {/* Avatar Ring */}
                            <div className={`relative rounded-full p-[2px] bg-white dark:bg-slate-800 transition-all ${user.userId === currentUser?.id ? 'ring-2 ring-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'ring-1 ring-slate-300 dark:ring-slate-600'}`}>
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    className="w-8 h-8 rounded-full object-cover bg-slate-200"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
                                    }}
                                />
                                {/* Online Status Dot */}
                                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-800 animate-pulse"></span>
                            </div>
                        </div>
                    ))}
                    {activeUsers.length > 5 && (
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 ring-1 ring-slate-300 dark:ring-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300 z-10 shadow-sm">
                            +{activeUsers.length - 5}
                        </div>
                    )}
                </div>
                
                {/* Live Counter/Status Text */}
                <div className={`flex flex-col leading-none whitespace-nowrap pr-2 transition-opacity duration-300 ${isHovered || isOpen ? 'opacity-100' : 'opacity-90'}`}>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {activeUsers.length} {activeUsers.length === 1 ? 'Online' : 'Online'}
                        </span>
                    </div>
                </div>
            </button>

            {/* Detailed Dropdown List */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 animate-fade-in-scale-up overflow-hidden ring-1 ring-black/5 origin-top-right">
                    <div className="p-3 bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center backdrop-blur-sm">
                        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Active Team</h4>
                        <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">{activeUsers.length} Live</span>
                    </div>
                    <ul className="max-h-[300px] overflow-y-auto p-1 scrollbar-hide">
                        {activeUsers.map(user => (
                            <li key={user.userId} className="flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-default group/item">
                                <div className="relative">
                                    <img 
                                        src={user.avatarUrl} 
                                        alt={user.name} 
                                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600 bg-slate-200"
                                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`; }}
                                    />
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full shadow-sm"></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1">
                                        {user.name} 
                                        {user.userId === currentUser?.id && <span className="text-[10px] text-slate-400 font-normal border border-slate-200 dark:border-slate-600 px-1 rounded bg-slate-50 dark:bg-slate-800">You</span>}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="truncate max-w-[80px] font-medium text-primary-600 dark:text-primary-400">{getUserRole(user.userId)}</span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                        <span>{timeAgoShort(user.onlineAt)}</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
