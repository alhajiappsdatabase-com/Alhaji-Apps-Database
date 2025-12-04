import React, { useState, FC, useRef, useEffect } from 'react';
import { useAppContext } from '../types';
import { Card, Modal, ConfirmationModal, DestructiveConfirmationModal, SkeletonLoader, EmptyState } from '../components/ui';
import { PlusIcon, EditIcon, PowerIcon, HistoryIcon, TrashIcon, UserGroupIcon, UserIcon, ManagementIcon, AgentIcon } from '../components/icons';
import { Branch, Agent, ServiceType, EditLog, User } from '../types';

const serviceTypes: ServiceType[] = ['ria', 'moneyGram', 'westernUnion', 'afro'];
const serviceNames: Record<ServiceType, string> = {
    ria: 'Ria',
    moneyGram: 'MoneyGram',
    westernUnion: 'Western Union',
    afro: 'Afro'
};

type ModalState = 
    | null 
    | { type: 'add-branch' } | { type: 'edit-branch', data: Branch } 
    | { type: 'add-agent' } | { type: 'edit-agent', data: Agent }
    | { type: 'add-user' } | { type: 'edit-user', data: User };

type ConfirmState = null | { type: 'toggle-branch', data: Branch } | { type: 'toggle-agent', data: Agent };
type DeleteConfirmState = null | { type: 'branch', data: Branch } | { type: 'agent', data: Agent };

const ManagementPage: FC<{ isLoading?: boolean }> = ({ isLoading }) => {
    const { api, users, branches, agents, settings, fetchManagementData, showToast, currentUser } = useAppContext();
    const [modalState, setModalState] = useState<ModalState>(null);
    const [confirmState, setConfirmState] = useState<ConfirmState>(null);
    const [deleteConfirmState, setDeleteConfirmState] = useState<DeleteConfirmState>(null);
    const [formData, setFormData] = useState<Partial<Branch & Agent & User>>({});
    
    const [viewingHistory, setViewingHistory] = useState<{ name: string; history: EditLog[] } | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const firstInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchManagementData();
    }, [fetchManagementData]);

    useEffect(() => {
        if (modalState) {
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }
    }, [modalState]);

    const isAdmin = currentUser?.role === 'Admin';

    const openModal = (state: ModalState) => {
        if (state) {
            if (state.type === 'add-branch' || state.type === 'add-agent') {
                 const defaultRates = state.type === 'add-branch'
                    ? settings?.defaultRates.branch
                    : settings?.defaultRates.agent;
                setFormData({ name: '', location: '', rates: defaultRates, initialBalance: 0 });
            } else if (state.type === 'add-user') {
                // No form data needed for add-user instruction view
            } else {
                setFormData(state.data);
            }
        }
        setModalState(state);
    };

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleRateChange = (service: ServiceType, value: string) => {
        const newRates = { ...formData.rates, [service]: parseFloat(value) || 0 };
        setFormData(prev => ({...prev, rates: newRates }));
    };

    const handleSave = async () => {
        if (!modalState || !currentUser) return;

        try {
            let message = '';
            switch (modalState.type) {
                case 'add-branch':
                    if (!formData.name || !formData.location) return;
                    await api.addBranch(currentUser.companyId, currentUser, formData as Omit<Branch, 'id' | 'companyId'>);
                    message = 'Branch added successfully!';
                    break;
                case 'edit-branch':
                    await api.updateBranch(currentUser.companyId, currentUser, formData as Branch);
                    message = 'Branch updated successfully!';
                    break;
                case 'add-agent':
                    if (!formData.name || !formData.location) return;
                    await api.addAgent(currentUser.companyId, currentUser, formData as Omit<Agent, 'id' | 'companyId'>);
                    message = 'Agent added successfully!';
                    break;
                case 'edit-agent':
                    await api.updateAgent(currentUser.companyId, currentUser, formData as Agent);
                    message = 'Agent updated successfully!';
                    break;
                case 'edit-user':
                    await api.updateUser(currentUser.companyId, currentUser, formData as User);
                    message = 'User updated successfully!';
                    break;
            }
            await fetchManagementData();
            showToast(message, 'success');
            setModalState(null);
            setFormData({});
        } catch (error: any) {
            console.error("Failed to save:", error);
            showToast(error.message || 'Failed to save changes.', 'error');
        }
    };
    
    const confirmToggleStatus = async () => {
        if (!confirmState || !currentUser) return;
        const { type, data } = confirmState;
        try {
            const updatedEntity = { ...data, isActive: !data.isActive };
            if (type === 'toggle-branch') {
                await api.updateBranch(currentUser.companyId, currentUser, updatedEntity as Branch);
            } else {
                await api.updateAgent(currentUser.companyId, currentUser, updatedEntity as Agent);
            }
            await fetchManagementData();
            showToast(`${data.name} has been ${updatedEntity.isActive ? 'activated' : 'deactivated'}.`, 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to update status.', 'error');
        } finally {
            setConfirmState(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirmState || !currentUser) return;
        const { type, data } = deleteConfirmState;
        try {
            if (type === 'branch') {
                await api.deleteBranch(currentUser.companyId, currentUser, data.id);
            } else {
                await api.deleteAgent(currentUser.companyId, currentUser, data.id);
            }
            await fetchManagementData();
            showToast(`${data.name} and all associated data has been permanently deleted.`, 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to delete entity.', 'error');
        } finally {
            setDeleteConfirmState(null);
        }
    };

    const openHistoryModal = (entity: Branch | Agent) => {
        setViewingHistory({ name: entity.name, history: entity.editHistory || [] });
        setIsHistoryModalOpen(true);
    };

    const renderChangeDetail = (log: EditLog) => {
        const oldState = log.previousState as Partial<Branch | Agent>;
        const newState = log.newState as Partial<Branch | Agent>;
        const changes: React.ReactNode[] = [];
        
        if (oldState.name !== newState.name) changes.push(<li key="name">Name changed to <span className="font-semibold text-green-500">"{newState.name}"</span></li>);
        if (oldState.location !== newState.location) changes.push(<li key="location">Location changed to <span className="font-semibold text-green-500">"{newState.location}"</span></li>);
        if (JSON.stringify(oldState.rates) !== JSON.stringify(newState.rates)) {
             changes.push(<li key="rates">Rates were updated.</li>);
        }
        return <ul className="list-disc list-inside space-y-1 text-sm">{changes}</ul>;
    };

    const renderUserModalContent = () => {
        if (!modalState) return null;
        
        if (modalState.type === 'add-user') {
             return (
                <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                        <h4 className="font-bold mb-2 flex items-center gap-2"><UserIcon className="w-4 h-4" /> How to invite a new user</h4>
                        <p className="mb-2">For security reasons, new users must sign up for their own account.</p>
                        <ol className="list-decimal list-inside space-y-1 ml-1">
                            <li>Ask the user to visit this app.</li>
                            <li>On the Login screen, click <strong>Sign Up</strong>.</li>
                            <li>They must enter your Company Name exactly:</li>
                        </ol>
                    </div>
                    <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Your Company Name</p>
                        <p className="text-xl font-bold text-slate-800 dark:text-white select-all cursor-text">{settings?.companyName || "..."}</p>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Once they sign up, they will appear in this list as a "Clerk". You can then edit their role to "Manager" or "Admin".
                    </p>
                    <button type="button" onClick={() => setModalState(null)} className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 p-2 rounded hover:bg-slate-300 dark:hover:bg-slate-600">
                        Close
                    </button>
                </div>
            );
        }
        
        if (modalState.type === 'edit-user') {
            return (
                 <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm text-slate-500 dark:text-slate-400">User</p>
                        <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded text-slate-800 dark:text-slate-200 font-semibold">
                            {formData.name}
                        </div>
                        <p className="text-xs text-slate-400">{formData.email}</p>
                    </div>
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
                        <select id="role" value={formData.role || 'Clerk'} onChange={e => handleFormChange('role', e.target.value)} required className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100">
                            <option value="Manager">Manager</option>
                            <option value="Clerk">Clerk (Data Entry)</option>
                            {modalState.data.role === 'Admin' && <option value="Admin">Admin</option>}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                            <strong>Clerk:</strong> Can enter transactions only.<br/>
                            <strong>Manager:</strong> Can manage branches/agents and view reports.<br/>
                            <strong>Admin:</strong> Full access including settings and user roles.
                        </p>
                    </div>
                    <button type="submit" className="w-full bg-primary-600 text-white p-2 rounded hover:bg-primary-700"> Save Changes </button>
                </form>
            );
        }
        return null;
    };

    const renderModalContent = () => {
        if (!modalState) return null;
        if (modalState.type.includes('user')) return renderUserModalContent();

        const isBranch = modalState.type.includes('branch');
        const entityType = isBranch ? 'Branch' : 'Agent';
        const isAdding = modalState.type === 'add-branch' || modalState.type === 'add-agent';

        return (
             <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                <input ref={firstInputRef} type="text" placeholder={`${entityType} Name`} value={formData.name || ''} onChange={e => handleFormChange('name', e.target.value)} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                <input type="text" placeholder="Location" value={formData.location || ''} onChange={e => handleFormChange('location', e.target.value)} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/>
                {isAdding && ( <div> <label htmlFor="initialBalance" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Opening Balance (Optional)</label> <input type="number" id="initialBalance" placeholder="0" value={formData.initialBalance || ''} onChange={e => handleFormChange('initialBalance', parseFloat(e.target.value) || 0)} step="0.01" className="mt-1 w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100" /> <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave blank for a zero opening balance.</p> </div> )}
                <div> <h4 className="font-semibold mb-2">Commission Rates (%)</h4> <div className="grid grid-cols-2 gap-4"> {serviceTypes.map(service => ( <div key={service}> <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{serviceNames[service]}</label> <input type="number" step="0.1" value={formData.rates?.[service] || ''} onChange={e => handleRateChange(service, e.target.value)} required className="w-full p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100"/> </div> ))} </div> </div>
                <button type="submit" className="w-full bg-primary-600 text-white p-2 rounded hover:bg-primary-700"> Save Changes </button>
            </form>
        )
    };
    
    const getModalTitle = () => {
        if (!modalState) return '';
        switch (modalState.type) { 
            case 'add-branch': return 'Add New Branch'; 
            case 'edit-branch': return `Edit ${modalState.data.name}`; 
            case 'add-agent': return 'Add New Agent'; 
            case 'edit-agent': return `Edit ${modalState.data.name}`;
            case 'add-user': return 'Invite New User';
            case 'edit-user': return `Edit ${modalState.data.name}`;
            default: return ''; 
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <ManagementIcon className="w-7 h-7 text-primary-600"/>
                            <h2 className="text-2xl font-bold">Branches</h2>
                        </div>
                        {isAdmin && <button onClick={() => openModal({ type: 'add-branch' })} className="bg-primary-600 text-white p-2 rounded-full hover:bg-primary-700"><PlusIcon className="w-5 h-5" /></button>}
                    </div>
                    {isLoading ? (
                        <div className="space-y-2">
                           {[...Array(3)].map((_, i) => <SkeletonLoader key={i} className="h-[76px] w-full" />)}
                        </div>
                    ) : branches.length > 0 ? (
                        <ul className="space-y-2">
                            {branches.map((branch, index) => (
                                <li key={branch.id} className="p-3 rounded-lg flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 interactive-card stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200">{branch.name}</p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{branch.location}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${branch.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'}`}>{branch.isActive ? 'Active' : 'Inactive'}</span>
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => openModal({ type: 'edit-branch', data: branch })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Edit"><EditIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => setConfirmState({ type: 'toggle-branch', data: branch })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={branch.isActive ? 'Deactivate' : 'Activate'}><PowerIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => openHistoryModal(branch)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="History"><HistoryIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => setDeleteConfirmState({ type: 'branch', data: branch })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Delete"><TrashIcon className="w-5 h-5 text-slate-500"/></button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState
                            icon={<ManagementIcon className="w-12 h-12" />}
                            title="No Branches Found"
                            message="Branches are your physical locations where transactions occur. Get started by adding your first one."
                            action={isAdmin ? <button onClick={() => openModal({ type: 'add-branch' })} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary-700 mx-auto"><PlusIcon className="w-5 h-5" /> Add First Branch</button> : undefined}
                        />
                    )}
                </Card>
                 <Card>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <AgentIcon className="w-7 h-7 text-primary-600"/>
                            <h2 className="text-2xl font-bold">Agents</h2>
                        </div>
                         {isAdmin && <button onClick={() => openModal({ type: 'add-agent' })} className="bg-primary-600 text-white p-2 rounded-full hover:bg-primary-700"><PlusIcon className="w-5 h-5" /></button>}
                    </div>
                     {isLoading ? (
                         <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <SkeletonLoader key={i} className="h-[76px] w-full" />)}
                         </div>
                     ) : agents.length > 0 ? (
                        <ul className="space-y-2">
                            {agents.map((agent, index) => (
                                <li key={agent.id} className="p-3 rounded-lg flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 interactive-card stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200">{agent.name}</p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{agent.location}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${agent.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'}`}>{agent.isActive ? 'Active' : 'Inactive'}</span>
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => openModal({ type: 'edit-agent', data: agent })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Edit"><EditIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => setConfirmState({ type: 'toggle-agent', data: agent })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={agent.isActive ? 'Deactivate' : 'Activate'}><PowerIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => openHistoryModal(agent)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="History"><HistoryIcon className="w-5 h-5 text-slate-500"/></button>
                                                <button onClick={() => setDeleteConfirmState({ type: 'agent', data: agent })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Delete"><TrashIcon className="w-5 h-5 text-slate-500"/></button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                     ) : (
                         <EmptyState
                             icon={<AgentIcon className="w-12 h-12" />}
                             title="No Agents Found"
                             message="Agents are individuals or sub-entities that handle transactions on your behalf."
                             action={isAdmin ? <button onClick={() => openModal({ type: 'add-agent' })} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary-700 mx-auto"><PlusIcon className="w-5 h-5" /> Add First Agent</button> : undefined}
                         />
                     )}
                </Card>
            </div>
            
            {isAdmin && (
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <UserGroupIcon className="w-7 h-7 text-primary-600"/>
                            <h2 className="text-2xl font-bold">Users</h2>
                        </div>
                        <button onClick={() => openModal({ type: 'add-user' })} className="bg-primary-600 text-white p-2 rounded-full hover:bg-primary-700" title="Invite New User">
                            <PlusIcon className="w-5 h-5" />
                        </button>
                    </div>
                     {isLoading ? (
                         <div className="space-y-3">
                            {[...Array(2)].map((_, i) => <SkeletonLoader key={i} className="h-[68px] w-full" />)}
                         </div>
                     ) : (
                        <ul className="space-y-3">
                            {users.map((user, index) => (
                                <li key={user.id} className="p-3 rounded-lg flex justify-between items-center bg-slate-100 dark:bg-slate-700 interactive-card stagger-child" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div className="flex items-center gap-3">
                                        <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full" />
                                        <div>
                                            <p className="font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-300 px-2 py-1 rounded-full">{user.role}</span>
                                        <button 
                                            onClick={() => openModal({ type: 'edit-user', data: user })} 
                                            className="text-slate-500 hover:text-primary-600 p-1 disabled:opacity-30 disabled:cursor-not-allowed" 
                                            title="Edit User Role"
                                            disabled={user.id === currentUser.id && user.role === 'Admin'}
                                        >
                                            <EditIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                     )}
                </Card>
            )}
            
            <Modal isOpen={!!modalState} onClose={() => setModalState(null)} title={getModalTitle()}>{renderModalContent()}</Modal>
            
            <ConfirmationModal 
                isOpen={!!confirmState}
                onClose={() => setConfirmState(null)}
                onConfirm={confirmToggleStatus}
                title={`Confirm Status Change`}
                message={confirmState ? `Are you sure you want to ${confirmState.data.isActive ? 'deactivate' : 'activate'} ${confirmState.data.name}?` : ''}
                confirmText={confirmState?.data.isActive ? 'Deactivate' : 'Activate'}
            />
            
            <DestructiveConfirmationModal
                isOpen={!!deleteConfirmState}
                onClose={() => setDeleteConfirmState(null)}
                onConfirm={handleDelete}
                title="Confirm Deletion"
                message={<>This will permanently delete <span className="font-bold">{deleteConfirmState?.data.name}</span> and all of its associated transactions and records. This action cannot be undone.</>}
                requiredConfirmationText={deleteConfirmState?.data.name || ''}
                confirmText="Delete"
            />

            <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title={`History for ${viewingHistory?.name}`}>
                {viewingHistory && viewingHistory.history.length > 0 ? (
                    <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {viewingHistory.history.map((log, index) => (
                            <li key={index} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    <span className="font-semibold">{log.userName}</span> made changes on <span className="font-semibold">{new Date(log.timestamp).toLocaleString()}</span>
                                </p>
                                <div className="mt-2 pl-2 border-l-2 border-slate-300 dark:border-slate-500">
                                    {renderChangeDetail(log)}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-slate-500">No edit history found.</p>
                )}
            </Modal>
        </div>
    );
};

export default ManagementPage;