import React, { useState, useEffect } from 'react';
import { RefreshCw, FileSpreadsheet } from 'lucide-react';
import { SpreadsheetFieldKey, CompanyInfo, getTenantSpreadsheetUrl, openTenantSpreadsheetUrl } from '../types';
import { t } from '../utils/translate';

interface TableSubHeaderButtonsProps {
  spreadsheetKey: SpreadsheetFieldKey;
  idSuffix: string;
  companyInfo?: Partial<CompanyInfo> | null;
  isRefreshing?: boolean;
  onRefreshData?: () => Promise<void> | void;
}

export const TableSubHeaderButtons: React.FC<TableSubHeaderButtonsProps> = ({
  spreadsheetKey,
  idSuffix,
  companyInfo,
  isRefreshing = false,
  onRefreshData,
}) => {
  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const effectiveRefreshing = isRefreshing || isLocalRefreshing;

  useEffect(() => {
    const handleSpreadsheetUpdated = () => setVersion((v) => v + 1);
    window.addEventListener('defib-tenant-spreadsheets-updated', handleSpreadsheetUpdated);
    window.addEventListener('storage', handleSpreadsheetUpdated);
    return () => {
      window.removeEventListener('defib-tenant-spreadsheets-updated', handleSpreadsheetUpdated);
      window.removeEventListener('storage', handleSpreadsheetUpdated);
    };
  }, []);

  const resolvedSpreadsheetUrl = React.useMemo(() => {
    return getTenantSpreadsheetUrl(spreadsheetKey, companyInfo);
  }, [spreadsheetKey, companyInfo, version]);

  const handleRefreshClick = async () => {
    if (effectiveRefreshing) return;
    setIsLocalRefreshing(true);
    try {
      if (onRefreshData) {
        await onRefreshData();
      } else {
        window.dispatchEvent(
          new CustomEvent('defib-manual-refresh-spreadsheet', {
            detail: { spreadsheetKey, idSuffix },
          })
        );
      }
    } catch (err) {
      console.warn(`Manual refresh error (${idSuffix}):`, err);
    } finally {
      setTimeout(() => setIsLocalRefreshing(false), 600);
    }
  };

  return (
    <div
      className="flex items-center justify-start gap-4 flex-wrap"
      style={{ maxWidth: '98%', margin: '0 auto', marginTop: '10px', padding: '0px' }}
    >
      <button
        type="button"
        id={`btn-refresh-data-${idSuffix}`}
        onClick={handleRefreshClick}
        disabled={effectiveRefreshing}
        style={{
          fontSize: '9px',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
          fontWeight: 100,
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          padding: '2px 4px',
          color: '#000000',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          textDecoration: 'none',
          transition: 'all 0.15s ease',
        }}
        className="hover:opacity-80 transition-all select-none cursor-pointer"
        title={t("Actualiser les données")}
      >
        <RefreshCw size={10} className={`shrink-0 text-black ${effectiveRefreshing ? 'animate-spin' : ''}`} color="#000000" />
        <span style={{ color: '#000000' }}>
          {effectiveRefreshing ? t("Actualisation...") : t("Actualiser les données")}
        </span>
      </button>

      <button
        type="button"
        id={`btn-open-spreadsheet-editor-${idSuffix}`}
        onClick={() => openTenantSpreadsheetUrl(resolvedSpreadsheetUrl)}
        disabled={!resolvedSpreadsheetUrl}
        style={{
          fontSize: '9px',
          fontFamily: '"DefibeoMain", "Civilprom", sans-serif',
          fontWeight: 100,
          cursor: resolvedSpreadsheetUrl ? 'pointer' : 'not-allowed',
          opacity: resolvedSpreadsheetUrl ? 1 : 0.4,
          background: 'transparent',
          border: 'none',
          padding: '2px 4px',
          color: '#000000',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          textDecoration: 'none',
          transition: 'all 0.15s ease',
        }}
        className={
          resolvedSpreadsheetUrl
            ? 'hover:opacity-80 transition-all select-none cursor-pointer'
            : 'opacity-40 transition-all select-none cursor-not-allowed'
        }
        title={t("Ouvrir l'éditeur SpreadSheets")}
      >
        <FileSpreadsheet size={10} className="shrink-0 text-black" color="#000000" />
        <span style={{ color: '#000000' }}>{t("Ouvrir l'éditeur SpreadSheets")}</span>
      </button>
    </div>
  );
};
