import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silence benign Vite WebSocket and HMR errors/rejections in development environment
if (typeof window !== 'undefined') {
  if ((import.meta as any).env?.DEV) {
    try {
      const OriginalWebSocket = window.WebSocket;
      if (OriginalWebSocket) {
        (window as any).WebSocket = function (url: string | URL, protocols?: string | string[]) {
          const urlStr = typeof url === 'string' ? url : url.toString();
          // Check if this is Vite's HMR websocket (typically ws:// or wss://) or local
          const isViteHmr = urlStr.includes('crzmv6lws') || 
                            urlStr.includes('localhost') || 
                            urlStr.includes('127.0.0.1') || 
                            urlStr.includes('run.app') ||
                            (protocols && (protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr'))));
          
          if (isViteHmr) {
            console.log('[Vite HMR] Intercepted HMR WebSocket connection attempt. Mocking connection to prevent connection-failed exceptions.');
            
            const mockSocket = {
              url: urlStr,
              readyState: 0, // CONNECTING
              bufferedAmount: 0,
              extensions: "",
              protocol: "",
              binaryType: "blob",
              
              onopen: null as any,
              onclose: null as any,
              onerror: null as any,
              onmessage: null as any,

              addEventListener(type: string, callback: any) {
                const listeners = (this as any)._listeners = (this as any)._listeners || {};
                listeners[type] = listeners[type] || [];
                listeners[type].push(callback);
              },
              
              removeEventListener(type: string, callback: any) {
                const listeners = (this as any)._listeners || {};
                if (listeners[type]) {
                  listeners[type] = listeners[type].filter((cb: any) => cb !== callback);
                }
              },

              dispatchEvent(event: Event) {
                const listeners = (this as any)._listeners || {};
                if (listeners[event.type]) {
                  listeners[event.type].forEach((cb: any) => {
                    try {
                      cb(event);
                    } catch (err) {}
                  });
                }
                return true;
              },

              send(data: any) {},
              
              close(code?: number, reason?: string) {
                this.readyState = 3; // CLOSED
                if (this.onclose) {
                  try {
                    this.onclose({ type: 'close', code: code || 1000, reason: reason || "", wasClean: true });
                  } catch (err) {}
                }
              }
            };

            setTimeout(() => {
              mockSocket.readyState = 3; // CLOSED
              if (mockSocket.onclose) {
                try {
                  mockSocket.onclose({ type: 'close', code: 1000, reason: "HMR is disabled in this environment.", wasClean: true });
                } catch (err) {}
              }
              const closeEvent = new Event('close');
              mockSocket.dispatchEvent(closeEvent);
            }, 100);

            return mockSocket as any;
          }
          
          return new (OriginalWebSocket as any)(url, protocols);
        } as any;
        
        (window.WebSocket as any).CONNECTING = 0;
        (window.WebSocket as any).OPEN = 1;
        (window.WebSocket as any).CLOSING = 2;
        (window.WebSocket as any).CLOSED = 3;
      }
    } catch (e) {
      console.warn('[Vite HMR] Unable to override window.WebSocket due to strict browser environment settings. Falling back to error filtering.', e);
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason) {
      const msg = reason.message || (typeof reason === 'string' ? reason : '');
      if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('WS')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.warn('Silenced benign HMR WebSocket unhandled rejection:', reason);
      }
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('WS')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('Silenced benign HMR WebSocket error:', msg);
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

