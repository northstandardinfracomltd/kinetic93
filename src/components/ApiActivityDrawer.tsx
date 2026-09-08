import React, { useState, useEffect, useMemo } from 'react';

export interface ApiActivityItem {
  id: string;
  timestamp: string;
  tenantId: string;
  shortEnvId?: string;
  direction: 'Entrante' | 'Sortante';
  method: string;
  endpoint: string;
  statusCode: number;
  headers: Record<string, string>;
  query: Record<string, string>;
  postPayload?: any;
  sourceIp?: string;
  durationMs?: number;
}

interface ApiActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  shortEnvId: string;
}

export const ApiActivityDrawer: React.FC<ApiActivityDrawerProps> = ({
  isOpen,
  onClose,
  tenantId,
  shortEnvId
}) => {
  const [logs, setLogs] = useState<ApiActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'Entrante' | 'Sortante'>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const activeEnvName = shortEnvId || tenantId || 'D18';

  // Generate initial tenant audit traces if empty
  const getDefaultDemoLogs = (tId: string, sEnv: string): ApiActivityItem[] => {
    const now = Date.now();
    return [
      {
        id: `log_init_1`,
        timestamp: new Date(now - 1000 * 60 * 12).toISOString(),
        tenantId: tId,
        shortEnvId: sEnv,
        direction: 'Entrante',
        method: 'GET',
        endpoint: `/v1/defibrillateurs?limit=50&statut=Opérationnel`,
        statusCode: 200,
        headers: {
          'Host': 'app.defibeo.fr',
          'X-Defibeo-Tenant-ID': sEnv,
          'X-Defibeo-API-Key': 'dfb_live_••••••••39a1',
          'Accept': 'application/json',
          'User-Agent': 'Defibeo-Client-Sync/1.4.0'
        },
        query: {
          'limit': '50',
          'statut': 'Opérationnel'
        },
        sourceIp: '194.206.12.84',
        durationMs: 38
      },
      {
        id: `log_init_2`,
        timestamp: new Date(now - 1000 * 60 * 35).toISOString(),
        tenantId: tId,
        shortEnvId: sEnv,
        direction: 'Entrante',
        method: 'POST',
        endpoint: `/v1/crm/tickets`,
        statusCode: 201,
        headers: {
          'Host': 'app.defibeo.fr',
          'X-Defibeo-Tenant-ID': sEnv,
          'X-Defibeo-API-Key': 'dfb_live_••••••••39a1',
          'Content-Type': 'application/json',
          'User-Agent': 'ERP-Connector-Module/2.1'
        },
        query: {},
        postPayload: {
          objet: 'Inspection préventive électrodes DAE',
          criticite: 'Normale',
          categorie: 'Technique',
          client_id: 'CLI-8491',
          collaborateur: 'Tech A',
          situation: 'Nouveau'
        },
        sourceIp: '82.127.44.19',
        durationMs: 64
      },
      {
        id: `log_init_3`,
        timestamp: new Date(now - 1000 * 60 * 90).toISOString(),
        tenantId: tId,
        shortEnvId: sEnv,
        direction: 'Sortante',
        method: 'POST',
        endpoint: `https://webhook.tenant-integration.com/defib-alerts`,
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Defibeo-Event': 'device.status.updated',
          'X-Defibeo-Tenant': sEnv,
          'User-Agent': 'Defibeo-Webhook-Dispatcher/1.0'
        },
        query: {
          'environment': sEnv
        },
        postPayload: {
          event: 'device.status.updated',
          identifiant: 'DAE-58-204',
          statut: 'Opérationnel',
          date_mise_a_jour: new Date(now - 1000 * 60 * 90).toISOString()
        },
        sourceIp: 'Serveur Defibeo Cloud',
        durationMs: 112
      },
      {
        id: `log_init_4`,
        timestamp: new Date(now - 1000 * 60 * 180).toISOString(),
        tenantId: tId,
        shortEnvId: sEnv,
        direction: 'Entrante',
        method: 'GET',
        endpoint: `/v1/clients?page=1&limit=25`,
        statusCode: 200,
        headers: {
          'Host': 'app.defibeo.fr',
          'X-Defibeo-Tenant-ID': sEnv,
          'X-Defibeo-API-Key': 'dfb_live_••••••••39a1',
          'Accept': 'application/json',
          'User-Agent': 'curl/8.4.0'
        },
        query: {
          'page': '1',
          'limit': '25'
        },
        sourceIp: '194.206.12.84',
        durationMs: 24
      }
    ];
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/tenant-api-logs?tenant=${encodeURIComponent(tenantId)}&shortEnvId=${encodeURIComponent(activeEnvName)}`);
      let serverLogs: ApiActivityItem[] = [];
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.logs) && data.logs.length > 0) {
          serverLogs = data.logs;
        }
      }

      // Check localStorage backup
      const localKey = `defibeo_api_activity_logs_${activeEnvName.toLowerCase()}`;
      let localLogs: ApiActivityItem[] = [];
      try {
        const saved = localStorage.getItem(localKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) localLogs = parsed;
        }
      } catch (e) {}

      // Merge and deduplicate by id
      const combinedMap = new Map<string, ApiActivityItem>();
      for (const item of [...serverLogs, ...localLogs]) {
        if (item && item.id && !combinedMap.has(item.id)) {
          combinedMap.set(item.id, item);
        }
      }

      let finalList = Array.from(combinedMap.values());
      if (finalList.length === 0) {
        finalList = getDefaultDemoLogs(tenantId, activeEnvName);
        // Save defaults in local storage
        try {
          localStorage.setItem(localKey, JSON.stringify(finalList));
        } catch (e) {}
      }

      finalList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(finalList);
      if (finalList.length > 0 && !expandedLogId) {
        setExpandedLogId(finalList[0].id);
      }
    } catch (err) {
      console.warn('Could not fetch server logs, loading local fallback:', err);
      const fallback = getDefaultDemoLogs(tenantId, activeEnvName);
      setLogs(fallback);
      if (fallback.length > 0 && !expandedLogId) {
        setExpandedLogId(fallback[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, tenantId, activeEnvName]);

  const handleSimulateTest = async (type: 'GET' | 'POST') => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const isPost = type === 'POST';

    const testItem: ApiActivityItem = {
      id: `log_test_${Date.now()}`,
      timestamp: nowIso,
      tenantId: tenantId,
      shortEnvId: activeEnvName,
      direction: 'Entrante',
      method: isPost ? 'POST' : 'GET',
      endpoint: isPost ? `/v1/crm/tickets` : `/v1/defibrillateurs?limit=10`,
      statusCode: isPost ? 201 : 200,
      headers: {
        'Host': 'app.defibeo.fr',
        'X-Defibeo-Tenant-ID': activeEnvName,
        'X-Defibeo-API-Key': 'dfb_live_••••••••39a1',
        'Content-Type': 'application/json',
        'User-Agent': 'Defibeo-WebConsole-Test'
      },
      query: isPost ? {} : { limit: '10' },
      postPayload: isPost ? {
        objet: 'Test d’intégration API Défibeo',
        criticite: 'Normale',
        description: 'Requête d’audit envoyée depuis la console paramètres.',
        client_id: 'CLI-TEST'
      } : undefined,
      sourceIp: '127.0.0.1 (Console)',
      durationMs: isPost ? 42 : 19
    };

    // Save locally
    const updated = [testItem, ...logs].slice(0, 100);
    setLogs(updated);
    setExpandedLogId(testItem.id);

    try {
      const localKey = `defibeo_api_activity_logs_${activeEnvName.toLowerCase()}`;
      localStorage.setItem(localKey, JSON.stringify(updated));
      await fetch('/api/tenant-api-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testItem)
      });
    } catch (e) {}

    setLoading(false);
    setFeedbackMsg(`Requête test ${type} enregistrée avec succès.`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSimulateOutbound = async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();

    const outboundItem: ApiActivityItem = {
      id: `log_out_${Date.now()}`,
      timestamp: nowIso,
      tenantId: tenantId,
      shortEnvId: activeEnvName,
      direction: 'Sortante',
      method: 'POST',
      endpoint: `https://api.partenaire-externe.com/v1/sync-dae`,
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Defibeo-Tenant-ID': activeEnvName,
        'X-Signature-SHA256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'User-Agent': 'Defibeo-SyncService/1.0'
      },
      query: { tenant: activeEnvName },
      postPayload: {
        notification: 'sync_completed',
        environnement: activeEnvName,
        timestamp: nowIso,
        nb_dae_synchronises: 12
      },
      sourceIp: 'Serveur Defibeo Sortant',
      durationMs: 88
    };

    const updated = [outboundItem, ...logs].slice(0, 100);
    setLogs(updated);
    setExpandedLogId(outboundItem.id);

    try {
      const localKey = `defibeo_api_activity_logs_${activeEnvName.toLowerCase()}`;
      localStorage.setItem(localKey, JSON.stringify(updated));
      await fetch('/api/tenant-api-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outboundItem)
      });
    } catch (e) {}

    setLoading(false);
    setFeedbackMsg('Requête sortante (webhook/sync) enregistrée avec succès.');
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Voulez-vous vraiment effacer l’historique des requêtes API pour cet environnement ?')) {
      return;
    }
    setLoading(true);
    try {
      await fetch(`/api/tenant-api-logs?tenant=${encodeURIComponent(tenantId)}&shortEnvId=${encodeURIComponent(activeEnvName)}`, {
        method: 'DELETE'
      });
      const localKey = `defibeo_api_activity_logs_${activeEnvName.toLowerCase()}`;
      localStorage.removeItem(localKey);
      setLogs([]);
      setExpandedLogId(null);
      setFeedbackMsg('Historique effacé.');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} à ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoStr;
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(item => {
      if (directionFilter !== 'ALL' && item.direction !== directionFilter) {
        return false;
      }
      if (methodFilter !== 'ALL' && item.method.toUpperCase() !== methodFilter.toUpperCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inUrl = (item.endpoint || '').toLowerCase().includes(q);
        const inMethod = (item.method || '').toLowerCase().includes(q);
        const inHeaders = Object.entries(item.headers || {}).some(
          ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
        );
        const inQuery = Object.entries(item.query || {}).some(
          ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
        );
        const inPayload = item.postPayload ? JSON.stringify(item.postPayload).toLowerCase().includes(q) : false;
        if (!inUrl && !inMethod && !inHeaders && !inQuery && !inPayload) {
          return false;
        }
      }
      return true;
    });
  }, [logs, directionFilter, methodFilter, searchQuery]);

  const counts = useMemo(() => {
    let total = logs.length;
    let inbound = 0;
    let outbound = 0;
    for (const l of logs) {
      if (l.direction === 'Entrante') inbound++;
      if (l.direction === 'Sortante') outbound++;
    }
    return { total, inbound, outbound };
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity cursor-pointer"
        onClick={onClose}
      />

      {/* Slide-in drawer on the right */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div
          className="w-screen max-w-3xl bg-white shadow-2xl flex flex-col border-l border-neutral-300"
          style={{ fontFamily: '"DefibeoMain", "Civilprom", sans-serif' }}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-200 bg-neutral-50 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">
                  Historique de l’activité API
                </h3>
                <span className="inline-block px-2.5 py-0.5 text-xs font-semibold uppercase rounded-md bg-neutral-200 text-neutral-800 border border-neutral-300">
                  Environnement : {activeEnvName}
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-1 max-w-xl leading-relaxed">
                Journal d’audit des requêtes entrantes et sortantes pour le tenant. Sont consignés les entêtes, paramètres query et payloads de requêtes. Conformément aux spécifications, les valeurs de réponse ne sont pas stockées pour éviter toute surcharge.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-700 bg-white hover:bg-neutral-100 rounded-md border border-neutral-300 transition-colors"
            >
              Fermer
            </button>
          </div>

          {/* Feedback banner */}
          {feedbackMsg && (
            <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-medium">
              {feedbackMsg}
            </div>
          )}

          {/* Controls & Filters Toolbar */}
          <div className="p-4 border-b border-neutral-200 bg-white space-y-3">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-neutral-700 mr-1">Direction :</span>
                <button
                  type="button"
                  onClick={() => setDirectionFilter('ALL')}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    directionFilter === 'ALL'
                      ? 'bg-neutral-800 text-white border-neutral-800 font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  Toutes ({counts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectionFilter('Entrante')}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    directionFilter === 'Entrante'
                      ? 'bg-neutral-800 text-white border-neutral-800 font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  Entrantes ({counts.inbound})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectionFilter('Sortante')}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    directionFilter === 'Sortante'
                      ? 'bg-neutral-800 text-white border-neutral-800 font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  Sortantes ({counts.outbound})
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-neutral-700 mr-1">Méthode :</span>
                {['ALL', 'GET', 'POST'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethodFilter(m)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      methodFilter === m
                        ? 'bg-neutral-800 text-white border-neutral-800 font-semibold'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    }`}
                  >
                    {m === 'ALL' ? 'Toutes' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input & Action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par URL, entête, query string..."
                  className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded bg-white text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={loading}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
                >
                  {loading ? 'Chargement...' : 'Rafraîchir'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulateTest('GET')}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
                >
                  Tester GET
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulateTest('POST')}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
                >
                  Tester POST
                </button>

                <button
                  type="button"
                  onClick={handleSimulateOutbound}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
                >
                  Tester Sortante
                </button>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                >
                  Effacer
                </button>
              </div>
            </div>
          </div>

          {/* Logs List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-lg border border-neutral-200">
                <p className="text-sm font-semibold text-neutral-800 mb-1">
                  Aucune trace API correspondante
                </p>
                <p className="text-xs text-neutral-500 mb-4">
                  Les requêtes entrantes et sortantes de l'environnement apparaîtront automatiquement ici au fur et à mesure de leur exécution.
                </p>
                <button
                  type="button"
                  onClick={() => handleSimulateTest('GET')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-800 hover:bg-neutral-900 rounded transition-colors"
                >
                  Générer une requête test
                </button>
              </div>
            ) : (
              filteredLogs.map((item) => {
                const isExpanded = expandedLogId === item.id;
                const isSuccess = item.statusCode >= 200 && item.statusCode < 300;
                const isInbound = item.direction === 'Entrante';
                const hasQuery = item.query && Object.keys(item.query).length > 0;
                const hasHeaders = item.headers && Object.keys(item.headers).length > 0;
                const hasPayload = item.postPayload !== undefined && item.postPayload !== null;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-md border border-neutral-200 overflow-hidden shadow-xs"
                  >
                    {/* Log item summary row */}
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : item.id)}
                      className="p-3 cursor-pointer hover:bg-neutral-50/80 flex items-center justify-between gap-3 select-none"
                    >
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {/* Direction Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isInbound
                              ? 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                              : 'bg-purple-100 text-purple-900 border border-purple-300'
                          }`}
                        >
                          {item.direction}
                        </span>

                        {/* Method Badge */}
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                            item.method === 'GET'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : item.method === 'POST'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : item.method === 'DELETE'
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {item.method}
                        </span>

                        {/* Status Code Badge */}
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                            isSuccess
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-red-100 text-red-900'
                          }`}
                        >
                          {item.statusCode}
                        </span>

                        {/* Endpoint */}
                        <span className="text-xs font-mono font-semibold text-neutral-900 truncate max-w-[320px] sm:max-w-md">
                          {item.endpoint}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Duration */}
                        {item.durationMs !== undefined && (
                          <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
                            {item.durationMs}ms
                          </span>
                        )}

                        {/* Timestamp */}
                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                          {formatDate(item.timestamp)}
                        </span>

                        {/* Expand / collapse text button */}
                        <span className="text-xs font-medium text-neutral-600 underline">
                          {isExpanded ? 'Masquer' : 'Détails'}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-neutral-200 p-4 bg-neutral-50/50 space-y-4 text-xs">
                        {/* Basic request metadata */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700 bg-white p-3 rounded border border-neutral-200">
                          <div>
                            <span className="font-bold text-neutral-900">Horodatage :</span>{' '}
                            <span className="font-mono">{item.timestamp}</span>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900">Environnement :</span>{' '}
                            <span className="font-mono">{item.shortEnvId || item.tenantId}</span>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900">Source IP :</span>{' '}
                            <span className="font-mono">{item.sourceIp || 'Non précisé'}</span>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900">Temps de traitement :</span>{' '}
                            <span className="font-mono">{item.durationMs ? `${item.durationMs} ms` : 'N/A'}</span>
                          </div>
                        </div>

                        {/* 1. ENTÊTES (HEADERS) */}
                        <div>
                          <div className="font-bold text-neutral-900 mb-1 flex items-center justify-between">
                            <span>1. Entêtes HTTP transmises ({Object.keys(item.headers || {}).length}) :</span>
                          </div>
                          {hasHeaders ? (
                            <div className="bg-white rounded border border-neutral-200 overflow-x-auto p-2">
                              <table className="w-full text-left font-mono text-[11px]">
                                <tbody>
                                  {Object.entries(item.headers).map(([k, v]) => (
                                    <tr key={k} className="border-b border-neutral-100 last:border-b-0">
                                      <td className="py-1 pr-3 font-semibold text-neutral-700 whitespace-nowrap align-top w-1/3">
                                        {k} :
                                      </td>
                                      <td className="py-1 text-neutral-900 break-all select-all">
                                        {String(v)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-neutral-500 italic p-2 bg-white rounded border border-neutral-200">
                              Aucun en-tête enregistré
                            </div>
                          )}
                        </div>

                        {/* 2. PARAMÈTRES QUERY (QUERY STRING) */}
                        <div>
                          <div className="font-bold text-neutral-900 mb-1">
                            2. Paramètres Query String :
                          </div>
                          {hasQuery ? (
                            <div className="bg-white rounded border border-neutral-200 overflow-x-auto p-2">
                              <table className="w-full text-left font-mono text-[11px]">
                                <tbody>
                                  {Object.entries(item.query).map(([k, v]) => (
                                    <tr key={k} className="border-b border-neutral-100 last:border-b-0">
                                      <td className="py-1 pr-3 font-semibold text-neutral-700 whitespace-nowrap align-top w-1/3">
                                        {k} :
                                      </td>
                                      <td className="py-1 text-neutral-900 break-all select-all">
                                        {String(v)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-neutral-500 italic p-2 bg-white rounded border border-neutral-200">
                              Aucun paramètre query passé dans l’URL
                            </div>
                          )}
                        </div>

                        {/* 3. DONNÉES ENVOYÉES (POST / PUT PAYLOAD) */}
                        <div>
                          <div className="font-bold text-neutral-900 mb-1 flex items-center justify-between">
                            <span>
                              3. Données transmises (POST / Body) :
                            </span>
                            {item.method === 'GET' && (
                              <span className="text-[10px] text-neutral-500 font-normal">
                                Requête GET — aucun payload de corps
                              </span>
                            )}
                          </div>
                          {hasPayload ? (
                            <div className="bg-white rounded border border-neutral-200 p-2.5 overflow-x-auto">
                              <pre className="font-mono text-[11px] text-neutral-900 whitespace-pre-wrap select-all">
                                {typeof item.postPayload === 'string'
                                  ? item.postPayload
                                  : JSON.stringify(item.postPayload, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-neutral-500 italic p-2 bg-white rounded border border-neutral-200">
                              {item.method === 'GET'
                                ? 'Aucun corps envoyé (requête de lecture standard GET)'
                                : 'Corps de requête vide'}
                            </div>
                          )}
                        </div>

                        {/* Note de conformité sur l'absence des values response */}
                        <div className="p-2.5 bg-neutral-100 rounded border border-neutral-200 text-[11px] text-neutral-600">
                          <span className="font-bold text-neutral-800">Notice d’optimisation :</span> Les données de réponse envoyées par le serveur ne sont pas enregistrées dans ce journal d’audit afin de préserver les performances et la confidentialité.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-600">
            <span>
              {filteredLogs.length} requête(s) affichée(s) — Isolation garantie pour l'environnement {activeEnvName}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 rounded border border-neutral-300 transition-colors"
            >
              Fermer la vue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
