
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Define types for global libraries loaded from CDN
declare global {
    interface Window {
        Recharts: any;
        jspdf: any;
        Papa: any;
        XLSX: any;
        QRCode: any;
        html2canvas: any;
    }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
