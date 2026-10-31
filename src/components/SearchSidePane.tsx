import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SearchSidePaneItem {
  id: string;
  label: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  imageUrl?: string;
  raw?: any;
}

interface SearchSidePaneProps {
  isOpen: boolean;
  onClose: () => void;
  paneId?: string;
  items: SearchSidePaneItem[];
  selectedId?: string;
  onSelect: (item: SearchSidePaneItem) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onSelectEmpty?: () => void;
  emptySelected?: boolean;
  searchPlaceholder?: string;
  searchFilter?: (item: SearchSidePaneItem, query: string) => boolean;
}

export const SearchSidePane: React.FC<SearchSidePaneProps> = ({
  isOpen,
  onClose,
  paneId = 'generic-search-side-pane',
  items,
  selectedId,
  onSelect,
  allowEmpty = false,
  emptyLabel = 'Autre',
  onSelectEmpty,
  emptySelected = false,
  searchPlaceholder = 'Entrez votre recherche',
  searchFilter,
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    if (searchFilter) {
      return items.filter((it) => searchFilter(it, q));
    }
    return items.filter((it) => {
      const l = (it.label || '').toLowerCase();
      const s = (it.subtitle || '').toLowerCase();
      const b = (it.badge || '').toLowerCase();
      return l.includes(q) || s.includes(q) || b.includes(q);
    });
  }, [items, search, searchFilter]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        minHeight: '100dvh',
        maxHeight: '100dvh',
        zIndex: 99999,
      }}
      onClick={() => {
        onClose();
        setSearch('');
      }}
    >
      <style>{`
        #${paneId} input::placeholder {
          color: #000000 !important;
          opacity: 1 !important;
          font-size: 18px !important;
        }
        #${paneId} ::-webkit-scrollbar {
          display: none !important;
          width: 0px !important;
          height: 0px !important;
        }
      `}</style>
      <div
        className="relative w-full sm:w-[480px] shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out"
        id={paneId}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: '100vh',
          minHeight: '100dvh',
          maxHeight: '100dvh',
          borderLeft: 'none',
          backgroundColor: '#F5F7FA',
        }}
      >
        {/* Search field at the very top - No title, No line divider */}
        <div
          className="px-4 pt-5 pb-3 shrink-0"
          style={{
            backgroundColor: '#F5F7FA',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: '13px 18px',
              borderRadius: '13px',
              border: '1px solid #DCE1EA',
              fontSize: '18px',
              color: '#000000',
              outline: 'none',
              backgroundColor: '#ffffff',
              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
              display: 'block',
            }}
            className="w-full text-black placeholder:text-black placeholder:text-[18px] placeholder:opacity-100 focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Item List */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-24 space-y-2"
          style={{
            backgroundColor: '#F5F7FA',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {allowEmpty && (
            <div
              onClick={() => {
                if (onSelectEmpty) onSelectEmpty();
                onClose();
                setSearch('');
              }}
              style={{
                backgroundColor: '#ffffff',
                border: 'none',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
              className="w-full p-3.5 rounded-xl cursor-pointer transition-all bg-white"
            >
              <span
                style={{
                  fontSize: '18px',
                  color: '#000000',
                  fontWeight: 600,
                  fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                }}
                className="block"
              >
                {emptyLabel}
              </span>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div
              className="text-center py-12 text-slate-500 font-sans"
              style={{ fontSize: '18px' }}
            >
              Aucun résultat trouvé.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              return (
                <div
                  key={`${item.id}_${idx}`}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                    setSearch('');
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    border: 'none',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                  }}
                  className="w-full p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.imageUrl && (
                      <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={item.imageUrl}
                          alt={item.label}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span
                        style={{
                          fontSize: '17px',
                          color: '#000000',
                          fontWeight: 600,
                          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                        }}
                        className="block truncate"
                      >
                        {item.label}
                      </span>
                      {item.subtitle && (
                        <span
                          style={{
                            fontSize: '14px',
                            color: '#64748b',
                            fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
                          }}
                          className="block truncate mt-0.5"
                        >
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
                      style={{
                        backgroundColor: item.badgeColor || '#f1f5f9',
                        color: '#0f172a',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Floating "Fermer" Button at Bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pointer-events-none z-20"
          style={{
            background: 'transparent',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              setSearch('');
            }}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-white transition-all hover:opacity-90 active:scale-[0.99] flex items-center justify-center font-sans pointer-events-auto"
            style={{
              backgroundColor: '#D22D0B',
              color: '#ffffff',
              fontSize: '18px',
              border: 'none',
              boxShadow: 'none',
              cursor: 'pointer',
              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
