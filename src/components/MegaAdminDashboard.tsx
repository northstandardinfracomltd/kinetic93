import React, { useState, useEffect } from 'react';
import { 
  getRegisteredTenants, 
  db, 
  Tenant,
  seedTenantDemoData
} from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { 
  ShieldAlert, 
  Power, 
  Building, 
  Mail, 
  Phone, 
  LogOut, 
  Search, 
  RefreshCw, 
  Activity, 
  ToggleLeft, 
  ToggleRight, 
  CheckCircle, 
  XCircle,
  HelpCircle,
  RotateCcw,
  Calendar,
  Lock,
  Key
} from 'lucide-react';

interface MegaAdminDashboardProps {
  onLogout: () => void;
}

export default function MegaAdminDashboard({ onLogout }: MegaAdminDashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [selectedTenantForPassword, setSelectedTenantForPassword] = useState<Tenant | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [passwordToastSuccess, setPasswordToastSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [paymentUrlDrafts, setPaymentUrlDrafts] = useState<Record<string, string>>({});

  const handleSavePassword = async () => {
    if (!selectedTenantForPassword) return;
    if (!newPasswordValue.trim()) {
      alert('Veuillez saisir un mot de passe valide.');
      return;
    }

    setIsSavingPassword(true);
    const tenantId = selectedTenantForPassword.id;
    const updatedList = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, adminPasswordHexOrPlain: newPasswordValue.trim() };
      }
      return t;
    });
    setTenants(updatedList);

    try {
      // Sync to Firestore
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updatedList });
      
      // Sync to local cache so other reads are coherent immediately
      localStorage.setItem('fs_cache_registered_tenants', JSON.stringify(updatedList));
      
      setPasswordToastSuccess(true);
      setTimeout(() => setPasswordToastSuccess(false), 4000);
      setSelectedTenantForPassword(null);
      setNewPasswordValue('');
    } catch (err) {
      console.error('Failed to sync tenant password update:', err);
      alert('Une erreur est survenue lors de la mise à jour du mot de passe. Rétablissement...');
      await fetchTenants();
    } finally {
      setIsSavingPassword(false);
    }
  };

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const list = await getRegisteredTenants();
      setTenants(list);
    } catch (err) {
      console.error('Error fetching environments for mega-admin:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleToggleStatus = async (tenantId: string, currentDisabledStatus: boolean) => {
    setIsSyncing(tenantId);
    
    // Update local state optimistically
    const updatedList = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, disabled: !currentDisabledStatus };
      }
      return t;
    });
    setTenants(updatedList);

    try {
      // Sync to Firestore
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updatedList });
      
      // Sync to local cache so other reads are coherent immediately
      localStorage.setItem('fs_cache_registered_tenants', JSON.stringify(updatedList));
      console.log(`Successfully toggled tenant ${tenantId} to ${!currentDisabledStatus ? 'OFF' : 'ON'}`);
    } catch (err) {
      console.error('Failed to sync tenant status update:', err);
      alert('Une erreur est survenue lors de la synchronisation avec la base de données. Rétablissement du statut initial...');
      // Rollback
      await fetchTenants();
    } finally {
      setIsSyncing(null);
    }
  };

  const handleTogglePrez = async (tenantId: string, currentBlockedStatus: boolean) => {
    setIsSyncing(tenantId);
    
    // Update local state optimistically
    const updatedList = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, blockedForPrez: !currentBlockedStatus };
      }
      return t;
    });
    setTenants(updatedList);

    try {
      // Sync to Firestore
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updatedList });
      
      // Sync to local cache so other reads are coherent immediately
      localStorage.setItem('fs_cache_registered_tenants', JSON.stringify(updatedList));
      console.log(`Successfully toggled blockedForPrez for ${tenantId} to ${!currentBlockedStatus ? 'ON' : 'OFF'}`);
    } catch (err) {
      console.error('Failed to sync tenant prez block update:', err);
      alert('Une erreur est survenue lors du basculement. Rétablissement...');
      await fetchTenants();
    } finally {
      setIsSyncing(null);
    }
  };

  const handleToggleSubscription = async (tenantId: string, currentActiveStatus: boolean) => {
    setIsSyncing(tenantId);
    
    const updatedList = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, subscriptionActive: !currentActiveStatus };
      }
      return t;
    });
    setTenants(updatedList);

    try {
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updatedList });
      localStorage.setItem('fs_cache_registered_tenants', JSON.stringify(updatedList));
      console.log(`Successfully toggled subscriptionActive for ${tenantId} to ${!currentActiveStatus}`);
    } catch (err) {
      console.error('Failed to sync tenant subscription status update:', err);
      alert('Une erreur est survenue lors de la mise à jour. Rétablissement...');
      await fetchTenants();
    } finally {
      setIsSyncing(null);
    }
  };

  const handleUpdatePaymentUrl = async (tenantId: string, newUrl: string) => {
    setIsSyncing(tenantId);
    
    const updatedList = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, paymentUrl: newUrl.trim() };
      }
      return t;
    });
    setTenants(updatedList);

    try {
      const docRef = doc(db, 'appData', 'registered_tenants');
      await setDoc(docRef, { value: updatedList });
      localStorage.setItem('fs_cache_registered_tenants', JSON.stringify(updatedList));
      alert('URL de paiement mise à jour avec succès !');
    } catch (err) {
      console.error('Failed to sync tenant payment URL update:', err);
      alert('Une erreur est survenue lors de l\'enregistrement. Rétablissement...');
      await fetchTenants();
    } finally {
      setIsSyncing(null);
    }
  };

  const [confirmResetTenantId, setConfirmResetTenantId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);

  const handleResetData = (tenantId: string) => {
    setConfirmResetTenantId(tenantId);
  };

  const handleConfirmReset = async () => {
    if (!confirmResetTenantId) return;
    const tenantId = confirmResetTenantId;
    setConfirmResetTenantId(null);
    setResettingId(tenantId);
    try {
      await seedTenantDemoData(tenantId);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 4000);
    } catch (err) {
      console.error("Failed to reset and seed tenant:", err);
      setShowErrorToast(true);
      setTimeout(() => setShowErrorToast(false), 4000);
    } finally {
      setResettingId(null);
    }
  };

  const filteredTenants = tenants.filter(t => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      (t.companyName && t.companyName.toLowerCase().includes(term)) ||
      (t.companyEmail && t.companyEmail.toLowerCase().includes(term)) ||
      (t.companyPhone && t.companyPhone.toLowerCase().includes(term)) ||
      (t.adminName && t.adminName.toLowerCase().includes(term)) ||
      (t.adminEmail && t.adminEmail.toLowerCase().includes(term)) ||
      (t.id && t.id.toLowerCase().includes(term))
    );
  });

  const activeCount = tenants.filter(t => !t.disabled).length;
  const suspendedCount = tenants.filter(t => t.disabled).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col selection:bg-pink-500 selection:text-white" id="mega-admin-container">
      {/* Header section */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between" id="mega-admin-header">
        <div className="flex items-center gap-3">
          <div className="bg-pink-600 p-2 rounded-xl text-white shadow-lg animate-pulse">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              DÉFIBEO <span className="bg-neutral-800 text-pink-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-pink-500/20">MEGA ADMIN</span>
            </h1>
            <p className="text-xs text-neutral-400 font-medium">Contrôle global des environnements et abonnements</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-white font-bold text-sm rounded-[12px] border border-neutral-700 transition-all cursor-pointer"
          id="btn-megaadmin-logout"
        >
          <LogOut className="w-4 h-4 text-neutral-400" />
          Déconnexion
        </button>
      </header>

      {/* Main content body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6" id="mega-admin-main">
        {/* Statistics and summary widget */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="mega-admin-stats">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Environnements</span>
              <p className="text-3xl font-black mt-1 text-white">{tenants.length}</p>
            </div>
            <div className="bg-neutral-800/80 p-3 rounded-xl text-neutral-300">
              <Building className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Environnements Actifs</span>
              <p className="text-3xl font-black mt-1 text-green-400">{activeCount}</p>
            </div>
            <div className="bg-green-500/10 p-3 rounded-xl text-green-400 border border-green-500/20">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Environnements Suspendus</span>
              <p className="text-3xl font-black mt-1 text-red-400">{suspendedCount}</p>
            </div>
            <div className="bg-red-500/10 p-3 rounded-xl text-red-400 border border-red-500/20">
              <XCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter and control panel */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4" id="mega-admin-controls">
          <div className="relative w-full md:max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-500">
              <Search className="w-5 h-5" />
            </span>
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-pink-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={fetchTenants}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-sm rounded-xl border border-neutral-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>
          </div>
        </div>

        {/* Informative banners about suspension logic */}
        <div className="bg-pink-950/20 border border-pink-500/20 rounded-2xl p-5 flex gap-4 items-start" id="mega-admin-info-banner">
          <Activity className="w-6 h-6 text-pink-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-pink-400">Règle de suspension de l'accès parent</h4>
            <p className="text-xs text-neutral-300 leading-relaxed font-medium">
              Si un environnement est basculé sur <span className="font-extrabold text-red-400">OFF (Désactivé)</span>, plus aucun utilisateur de cet environnement (que ce soit le Super Administrateur, ses administrateurs secondaires, techniciens de maintenance ou clients finaux) ne pourra se connecter. Ils recevront immédiatement le message de blocage d'accès suivant :
            </p>
            <div className="bg-neutral-950 border border-pink-500/10 p-3 rounded-lg text-xs font-mono text-pink-300 mt-2">
              "Votre compte est suspendu, contactez Défibeo pour réactiver votre environnement."
            </div>
          </div>
        </div>

        {/* Environments Grid List */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-400" id="mega-admin-loading">
            <RefreshCw className="w-10 h-10 animate-spin text-pink-500" />
            <span className="text-sm font-bold">Récupération des environnements...</span>
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-neutral-800 rounded-2xl" id="mega-admin-empty">
            <Building className="w-12 h-12 mx-auto text-neutral-600 mb-3" />
            <h3 className="text-base font-bold text-neutral-300">Aucun environnement trouvé</h3>
            <p className="text-xs text-neutral-500 mt-1">Essayez d'ajuster vos filtres ou de rafraîchir la liste.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="mega-admin-grid">
            {filteredTenants.map((tnt) => {
              const isOff = !!tnt.disabled;
              const isCurrentlySyncing = isSyncing === tnt.id;

              return (
                <div 
                  key={tnt.id}
                  className={`bg-neutral-900 rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isOff 
                      ? 'border-red-500/30 bg-neutral-950 shadow-red-950/5' 
                      : 'border-neutral-800 hover:border-neutral-700 shadow-black/10'
                  }`}
                >
                  {/* Top Header Card */}
                  <div className="p-5 border-b border-neutral-800/50 flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-extrabold text-base text-white truncate" title={tnt.companyName}>
                        {tnt.companyName || "Sans Nom"}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="bg-pink-950 text-pink-400 text-[11px] px-2 py-0.5 rounded-md font-mono font-bold border border-pink-500/10">
                          ID: {tnt.id}
                        </span>
                        {tnt.shortEnvId && (
                          <span className="bg-neutral-800 text-neutral-300 text-[11px] px-2 py-0.5 rounded-md font-mono font-medium">
                            Code: {tnt.shortEnvId}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ON / OFF Toggle switch */}
                    <button
                      type="button"
                      disabled={isCurrentlySyncing}
                      onClick={() => handleToggleStatus(tnt.id, isOff)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                        isOff ? 'bg-red-600' : 'bg-green-600'
                      }`}
                      aria-label="Toggle environment status"
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isOff ? 'translate-x-0' : 'translate-x-5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Body Info Details */}
                  <div className="p-5 space-y-3.5 text-sm">
                    {/* Status Badge Line */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">Statut Accès</span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                        isOff 
                          ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                          : 'bg-green-500/10 text-green-400 border-green-500/20'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isOff ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                        {isOff ? 'DESACTIVE (OFF)' : 'ACTIF (ON)'}
                      </span>
                    </div>

                    {/* Commercial Email */}
                    <div className="flex items-center gap-3 text-neutral-300">
                      <Mail className="w-4 h-4 text-neutral-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-[10px] text-neutral-500 font-bold uppercase">Email Commercial</span>
                        <a href={`mailto:${tnt.companyEmail}`} className="block text-xs font-medium hover:underline truncate">
                          {tnt.companyEmail || "—"}
                        </a>
                      </div>
                    </div>

                    {/* Commercial Phone */}
                    <div className="flex items-center gap-3 text-neutral-300">
                      <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
                      <div>
                        <span className="block text-[10px] text-neutral-500 font-bold uppercase">Téléphone</span>
                        <a href={`tel:${tnt.companyPhone}`} className="block text-xs font-medium hover:underline">
                          {tnt.companyPhone || "—"}
                        </a>
                      </div>
                    </div>

                    {/* Main Administrator */}
                    <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/40 space-y-1.5" id={`main-admin-${tnt.id}`}>
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <span className="block text-[10px] text-neutral-500 font-bold uppercase">Compte Super-Admin Parent</span>
                          <p className="text-xs font-bold text-white truncate">{tnt.adminName || "—"}</p>
                          <p className="text-[11px] text-neutral-400 font-medium truncate">{tnt.adminEmail || "—"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTenantForPassword(tnt);
                            setNewPasswordValue(tnt.adminPasswordHexOrPlain || '');
                          }}
                          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 hover:text-pink-400 text-neutral-400 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-neutral-800 self-center"
                          title="Définir un nouveau mot de passe"
                          id={`btn-edit-pass-${tnt.id}`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[10.5px] text-neutral-400 font-mono bg-neutral-900/50 px-2 py-1 rounded border border-neutral-850 flex items-center justify-between">
                        <span>Mot de passe :</span>
                        <span className="font-bold text-pink-400">{tnt.adminPasswordHexOrPlain || "—"}</span>
                      </div>
                    </div>

                    {/* Toggle "Bloqué pour RDV Prez" */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-neutral-800/50">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">Bloqué pour RDV Prez</span>
                        <span className="text-[10px] text-neutral-500 font-medium truncate">Redirige vers planification</span>
                      </div>
                      <button
                        type="button"
                        disabled={isCurrentlySyncing}
                        onClick={() => handleTogglePrez(tnt.id, !!tnt.blockedForPrez)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                          tnt.blockedForPrez ? 'bg-amber-600' : 'bg-neutral-800'
                        }`}
                        aria-label="Toggle RDV Prez block"
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            tnt.blockedForPrez ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle "Abonnement actif." */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-neutral-800/50">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">Abonnement actif.</span>
                        <span className="text-[10px] text-neutral-500 font-medium truncate">Bloque l'accès si inactif</span>
                      </div>
                      <button
                        type="button"
                        disabled={isCurrentlySyncing}
                        onClick={() => handleToggleSubscription(tnt.id, tnt.subscriptionActive !== false)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                          tnt.subscriptionActive !== false ? 'bg-green-600' : 'bg-neutral-800'
                        }`}
                        aria-label="Toggle active subscription status"
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            tnt.subscriptionActive !== false ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Payment URL Input */}
                    <div className="pt-2.5 border-t border-neutral-800/50 space-y-1.5 text-left">
                      <label className="block text-[11px] font-bold text-neutral-400 uppercase">
                        URL de paiement
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={paymentUrlDrafts[tnt.id] !== undefined ? paymentUrlDrafts[tnt.id] : (tnt.paymentUrl || '')}
                          onChange={(e) => {
                            setPaymentUrlDrafts({
                              ...paymentUrlDrafts,
                              [tnt.id]: e.target.value
                            });
                          }}
                          placeholder="https://checkout.stripe.com/..."
                          className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg py-1.5 px-2 text-xs text-white placeholder-neutral-600 focus:outline-hidden focus:border-pink-600 transition-colors"
                        />
                        <button
                          type="button"
                          disabled={isCurrentlySyncing}
                          onClick={() => handleUpdatePaymentUrl(tnt.id, paymentUrlDrafts[tnt.id] !== undefined ? paymentUrlDrafts[tnt.id] : (tnt.paymentUrl || ''))}
                          className="px-2.5 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer border-0 shrink-0 disabled:opacity-50"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>

                    {/* Reset Button */}
                    <div className="pt-2 border-t border-neutral-800/50 flex justify-end">
                      <button
                        type="button"
                        disabled={resettingId === tnt.id}
                        onClick={() => handleResetData(tnt.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-bold text-red-400 hover:text-red-300 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${resettingId === tnt.id ? 'animate-spin' : ''}`} />
                        {resettingId === tnt.id ? "Réinitialisation..." : "Remise à zéro (données démo)"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Custom Confirmation Modal */}
      {confirmResetTenantId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-neutral-950/85 backdrop-blur-sm transition-opacity"
            onClick={() => setConfirmResetTenantId(null)}
          />
          
          {/* Modal Card */}
          <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl transition-all">
            <div className="flex flex-col items-center text-center">
              {/* Warning Icon */}
              <div className="w-12 h-12 rounded-full bg-red-950/50 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              
              <h3 className="text-lg font-bold text-neutral-100 mb-2">
                Confirmation de réinitialisation
              </h3>
              
              <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
                Êtes-vous absolument sûr de vouloir vider toutes les données actuelles de cet environnement ? <br/>
                <strong className="text-red-400">Cette opération est définitive et irréversible.</strong> Les données de l'environnement seront rechargées exclusivement avec le record de démo spécifié.
              </p>
              
              {/* Buttons */}
              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setConfirmResetTenantId(null)}
                  className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-xl text-xs font-semibold text-white shadow-lg shadow-red-600/10 transition-all cursor-pointer"
                >
                  Confirmer l'exécution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Edit Modal */}
      {selectedTenantForPassword !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="modal-edit-password">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-neutral-950/85 backdrop-blur-sm transition-opacity"
            onClick={() => {
              if (!isSavingPassword) {
                setSelectedTenantForPassword(null);
                setNewPasswordValue('');
              }
            }}
          />
          
          {/* Modal Card */}
          <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl transition-all">
            <div className="flex flex-col">
              {/* Key Icon */}
              <div className="w-12 h-12 rounded-full bg-pink-950/50 border border-pink-500/30 flex items-center justify-center mb-4 text-pink-400 self-center">
                <Key className="w-6 h-6" />
              </div>
              
              <h3 className="text-lg font-bold text-neutral-100 mb-2 text-center" id="modal-edit-password-title">
                Définir un mot de passe
              </h3>
              
              <p className="text-xs text-neutral-400 mb-4 text-center">
                Définition d'un nouveau mot de passe pour le super-admin de l'environnement <strong className="text-white">{selectedTenantForPassword.companyName}</strong>.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">
                    Super-Admin
                  </label>
                  <p className="text-sm font-semibold text-neutral-200 bg-neutral-950/40 p-2.5 rounded-xl border border-neutral-800/40 truncate">
                    {selectedTenantForPassword.adminName} ({selectedTenantForPassword.adminEmail})
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="text"
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="Saisissez le nouveau mot de passe"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-pink-600 transition-colors font-mono font-bold"
                    id="input-new-password"
                    disabled={isSavingPassword}
                  />
                </div>
              </div>
              
              {/* Buttons */}
              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTenantForPassword(null);
                    setNewPasswordValue('');
                  }}
                  disabled={isSavingPassword}
                  className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-semibold text-neutral-300 transition-all cursor-pointer disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={isSavingPassword || !newPasswordValue.trim()}
                  className="flex-1 px-4 py-2.5 bg-pink-600 hover:bg-pink-500 active:bg-pink-700 rounded-xl text-xs font-semibold text-white shadow-lg shadow-pink-600/10 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  id="btn-confirm-save-password"
                >
                  {isSavingPassword ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Elegant Toast Notifications */}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 shadow-2xl animate-bounce-short">
          <div className="w-8 h-8 rounded-full bg-green-950 flex items-center justify-center text-green-400 border border-green-500/30">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-200">Succès !</h4>
            <p className="text-[10px] text-neutral-400">L'environnement a été réinitialisé avec succès.</p>
          </div>
        </div>
      )}

      {passwordToastSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 shadow-2xl animate-bounce-short" id="toast-password-success">
          <div className="w-8 h-8 rounded-full bg-green-950 flex items-center justify-center text-green-400 border border-green-500/30">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-200">Succès !</h4>
            <p className="text-[10px] text-neutral-400">Le mot de passe du super-admin a été mis à jour avec succès.</p>
          </div>
        </div>
      )}

      {showErrorToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 shadow-2xl animate-bounce-short">
          <div className="w-8 h-8 rounded-full bg-red-950 flex items-center justify-center text-red-400 border border-red-500/30">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-200">Erreur</h4>
            <p className="text-[10px] text-neutral-400">Échec de la réinitialisation des données.</p>
          </div>
        </div>
      )}
    </div>
  );
}
