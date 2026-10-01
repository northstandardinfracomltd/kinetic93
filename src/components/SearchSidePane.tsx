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
      `}</style>
      <div
        className="relative w-full sm:w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out"
        id={paneId}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: '100vh',
          minHeight: '100dvh',
          maxHeight: '100dvh',
          borderLeft: '1px solid #e2e8f0',
        }}
      >
        {/* Search field at the very top - No title, No line divider */}
        <div className="p-4 pt-5 pb-3 bg-white shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            style={{
              width: '100%',
              padding: '13px 18px',
              borderRadius: '13px',
              border: '1px solid rgb(201, 191, 205)',
              fontSize: '18px',
              color: '#000000',
              outline: 'none',
              backgroundColor: '#ffffff',
              fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
            }}
            className="w-full text-black placeholder:text-black placeholder:text-[18px] placeholder:opacity-100 focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {allowEmpty && (
            <div
              onClick={() => {
                if (onSelectEmpty) onSelectEmpty();
                onClose();
                setSearch('');
              }}
              className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                emptySelected
                  ? 'bg-[#ffecf8] border-[#fe4eba]'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
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
            filteredItems.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                    setSearch('');
                  }}
                  className={`p-3.5 rounded-xl cursor-pointer transition-all border flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#ffecf8] border-[#fe4eba]'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
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

        {/* Floating Black "Fermer" Button at Bottom */}
        <div className="p-4 bg-gradient-to-t from-white via-white/95 to-transparent shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onClose();
              setSearch('');
            }}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-white transition-all hover:opacity-90 active:scale-[0.99] shadow-lg flex items-center justify-center font-sans"
            style={{
              backgroundColor: '#000000',
              color: '#ffffff',
              fontSize: '18px',
              border: 'none',
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
