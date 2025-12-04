
import React, { useState, FC, useRef, useEffect } from 'react';
// Fix: Import useAppContext from types.ts to avoid circular dependency with App.tsx
import { useAppContext } from '../types';
import { Modal } from './ui';
import { AiAnalystIcon, LoadingSpinnerIcon, TrashIcon } from './icons';
import { GoogleGenAI } from '@google/genai';

type Message = {
    role: 'user' | 'model' | 'loading' | 'error';
    content: string;
    isStreaming?: boolean;
};

const AiAnalyst: FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const { transactions, branches, agents, cashIns, cashOuts, incomes, expenses, settings, showToast } = useAppContext();
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const initialMessage: Message = {
        role: 'model',
        content: `Hello! I'm your AI Financial Analyst. I have access to your company's data. Ask me anything about it.`
    };

    useEffect(() => {
        if (isModalOpen && messages.length === 0) {
            setMessages([initialMessage]);
            setInput('');
        }
    }, [isModalOpen]);

    useEffect(() => {
        if (chatContainerRef.current) {
            const { scrollHeight, scrollTop, clientHeight } = chatContainerRef.current;
            // Auto-scroll only if user is already near the bottom
            if (scrollHeight - scrollTop - clientHeight < 100) {
                chatContainerRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' });
            }
        }
    }, [messages]);
    
    const handleClearChat = () => {
        setMessages([initialMessage]);
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isGenerating) return;

        const userMessage: Message = { role: 'user', content: input };
        // Placeholder for the model response that we will stream into
        const modelMessage: Message = { role: 'model', content: '', isStreaming: true };
        
        setMessages(prev => [...prev, userMessage, modelMessage]);
        setInput('');
        setIsGenerating(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            // Optimize Context: Map to lighter objects to save tokens
            const slimTransactions = transactions.slice(0, 300).map(t => ({
                d: t.date,
                e: t.entityId, // ID is shorter, model can map via agent list
                t: Math.round(t.totalCashPaid),
                // Only include breakdowns if non-zero to save space
                s: Object.entries(t.cashPaidByService).reduce((acc, [key, val]) => {
                    const v = val as { total: number };
                    if (v.total > 0) acc[key] = Math.round(v.total);
                    return acc;
                }, {} as any)
            }));

            const dataContext = {
                meta: {
                    today: new Date().toISOString().split('T')[0],
                    currency: settings?.currency || 'USD'
                },
                entities: [
                    ...branches.map(b => ({ id: b.id, name: b.name, type: 'Branch', rates: b.rates })),
                    ...agents.map(a => ({ id: a.id, name: a.name, type: 'Agent', rates: a.rates }))
                ],
                txs: slimTransactions,
                capital: { 
                    in: cashIns.slice(0, 50).map(c => ({ d: c.date, a: c.amount, src: c.source })), 
                    out: cashOuts.slice(0, 50).map(c => ({ d: c.date, a: c.amount, to: c.entityId })) 
                },
                petty: { 
                    in: incomes.slice(0, 50).map(i => ({ d: i.date, a: i.amount, cat: i.category })), 
                    out: expenses.slice(0, 50).map(e => ({ d: e.date, a: e.amount, cat: e.category })) 
                }
            };

            const contextString = `DATA CONTEXT (JSON):\n${JSON.stringify(dataContext)}\n\nUSER QUESTION:\n${userMessage.content}`;
            
            const systemInstruction = `You are an expert financial analyst for '${settings?.companyName || 'the company'}'. Use the provided JSON data to answer questions.
            
            **Data Keys:**
            - txs: Transactions (d=date, e=entityId, t=totalPaid, s=serviceBreakdown)
            - entities: Branches/Agents (match 'e' in txs to 'id' here for names/rates)
            - capital: Cash flow (in/out)
            - petty: Petty cash (in/out)

            **Rules:**
            1. **Think deeply** before answering. Verify calculations.
            2. **Format nicely**: Use **bold** for amounts/entities, *italics* for emphasis, and lists for breakdowns.
            3. **Be concise**: Give the answer directly. Explain calculation only if asked or complex.
            4. **Commission Calc**: For a transaction, commission = sum(service_amount * (entity_rate / 100)).
            `;
            
            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: contextString,
                config: {
                    systemInstruction: systemInstruction,
                    thinkingConfig: { thinkingBudget: 2048 } 
                }
            });

            let fullText = '';
            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const lastIndex = newMessages.length - 1;
                        newMessages[lastIndex] = { ...newMessages[lastIndex], content: fullText };
                        return newMessages;
                    });
                }
            }
            
            setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                newMessages[lastIndex] = { ...newMessages[lastIndex], isStreaming: false };
                return newMessages;
            });

        } catch (error) {
            console.error("AI Analyst Error:", error);
            showToast("An error occurred while analyzing your request.", "error");
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isStreaming);
                newMessages.push({ role: 'error', content: 'Sorry, I was unable to process your request. Please try again later.' });
                return newMessages;
            });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const examplePrompts = [
        "Calculate commission for [Agent Name] this month.",
        "Who paid the most this week?",
        "Total cash-in from 'Bank' this month?",
        "Summarize petty expenses."
    ];
    
     const renderMarkdown = (text: string) => {
        if (!text) return null;
        
        // Improved Markdown Parser
        const lines = text.split('\n');
        return lines.map((line, i) => {
            // Headers
            if (line.startsWith('### ')) return <h4 key={i} className="text-md font-bold mt-2 mb-1 text-primary-700 dark:text-primary-400">{renderInlineStyles(line.substring(4))}</h4>;
            if (line.startsWith('## ')) return <h3 key={i} className="text-lg font-bold mt-3 mb-1 text-slate-900 dark:text-white">{renderInlineStyles(line.substring(3))}</h3>;
            if (line.startsWith('# ')) return <h2 key={i} className="text-xl font-bold mt-4 mb-2 text-slate-900 dark:text-white">{renderInlineStyles(line.substring(2))}</h2>;

            // Lists
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return (
                    <div key={i} className="ml-4 flex items-start gap-2 my-0.5">
                        <span className="mt-2 w-1.5 h-1.5 bg-slate-400 rounded-full flex-shrink-0"></span>
                        <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{renderInlineStyles(line.trim().substring(2))}</span>
                    </div>
                );
            }
            
            // Numbered Lists (Basic support)
            if (/^\d+\.\s/.test(line.trim())) {
                 return (
                    <div key={i} className="ml-4 flex items-start gap-2 my-0.5">
                        <span className="font-bold text-slate-500 dark:text-slate-400 text-sm mt-0.5">{line.trim().split('.')[0]}.</span>
                        <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{renderInlineStyles(line.trim().substring(line.trim().indexOf(' ') + 1))}</span>
                    </div>
                );
            }

            // Empty lines
            if (!line.trim()) return <div key={i} className="h-2"></div>;

            // Paragraphs
            return <div key={i} className="mb-1 leading-relaxed text-slate-800 dark:text-slate-200">{renderInlineStyles(line)}</div>;
        });
    };

    const renderInlineStyles = (text: string) => {
        // Split by bold (**text**) then by italic (*text*)
        // Note: This is a simplified parser.
        const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={index} className="italic text-slate-700 dark:text-slate-300">{part.slice(1, -1)}</em>;
            }
            return part;
        });
    };

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-24 md:bottom-6 right-4 md:right-6 bg-primary-600 text-white p-3 md:p-4 rounded-full shadow-lg hover:bg-primary-700 transition-transform transform hover:scale-110 z-50 animate-fade-in"
                aria-label="Open AI Financial Analyst"
            >
                <AiAnalystIcon className="w-6 h-6" />
            </button>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="AI Financial Analyst" size="lg">
                <div className="flex flex-col h-[70vh]">
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-900 rounded-md space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-lg shadow-sm ${
                                    msg.role === 'user' ? 'bg-primary-600 text-white' : 
                                    msg.role === 'model' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700' : 
                                    msg.role === 'error' ? 'bg-red-500 text-white' : 
                                    'bg-slate-200 dark:bg-slate-600'
                                }`}>
                                    {msg.role === 'model' && msg.content === '' && msg.isStreaming ? (
                                        <div className="flex items-center gap-2">
                                            <LoadingSpinnerIcon className="w-4 h-4 animate-spin text-primary-600 dark:text-primary-400" />
                                            <span className="text-slate-500 dark:text-slate-400 text-sm italic">Thinking...</span>
                                        </div>
                                    ) : (
                                        <div className="text-sm">{renderMarkdown(msg.content)}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {messages.length <= 1 && (
                         <div className="p-4 border-t dark:border-slate-700">
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Try asking:</p>
                            <div className="flex flex-wrap gap-2">
                                {examplePrompts.map(prompt => (
                                    <button key={prompt} onClick={() => setInput(prompt)} className="text-xs px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                        "{prompt}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask about your financial data..."
                            disabled={isGenerating}
                            className="flex-1 p-2 border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500"
                        />
                         <button onClick={handleClearChat} disabled={isGenerating} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" aria-label="Clear chat">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                        <button onClick={handleSendMessage} disabled={isGenerating || !input.trim()} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                            {isGenerating ? <LoadingSpinnerIcon className="w-4 h-4 animate-spin" /> : <span>Send</span>}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default AiAnalyst;
