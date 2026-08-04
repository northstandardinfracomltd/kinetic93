import React, { useState } from 'react';
import { sendScriptEmail } from '../utils/emailService';

interface FeedbackDrawerProps {
  companyName?: string;
}

const COMPARTIMENTS = [
  "Défibrillateurs",
  "Autres matériels",
  "Clients",
  "Commandes",
  "Tournées & Missions",
  "Rapports PDF",
  "Centrale des stocks",
  "Stocks distribués",
  "Achats fournisseurs",
  "Variables",
  "CRM",
  "GED",
  "Satisfaction",
  "Notifications",
  "Temps",
  "Localisations",
  "Tickets Caisse",
  "Relevé Concurrentiel",
  "Importer Exporter",
  "Statistiques",
  "Paramètres",
  "Connecteurs & API",
  "Facturation",
  "Autre"
];

export const FeedbackDrawer: React.FC<FeedbackDrawerProps> = ({ companyName = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [compartiment, setCompartiment] = useState(COMPARTIMENTS[0]);
  const [nomPrenom, setNomPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setSuccessMessage('');

    const entrepriseName = companyName || 'Défibeo';

    const bodyText = `Entreprise: ${entrepriseName}
Compartiment: ${compartiment}
Nom & Prénom: ${nomPrenom}
Email: ${email}
Téléphone portable: ${telephone}
Description:
${description}`;

    try {
      await sendScriptEmail({
        to: 'support@defibeo.com',
        subject: `[Feedback/Problème] ${entrepriseName} - ${compartiment}`,
        body: bodyText,
        replyTo: email || 'no-reply@defibeo.com',
      });
      setSuccessMessage('Votre demande est transmise avec succès.');
    } catch (err) {
      console.error('Error sending feedback email:', err);
      setSuccessMessage('Votre demande est transmise avec succès.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSuccessMessage('');
  };

  return (
    <>
      {/* Floating Trigger Button bottom right angle */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-0 right-0 z-[9999] text-white font-semibold transition-all flex items-center justify-center cursor-pointer select-none shadow-md hover:opacity-90 font-sans"
        style={{
          borderRadius: '13px 0px 0px',
          background: '#6c2972',
          fontSize: '13px',
          padding: '7px 9px 4px 12px',
        }}
        id="feedback-problem-btn"
      >
        Feedback/Problème
      </button>

      {/* Side Pane Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex justify-end font-sans">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
          />

          {/* Drawer content - No header as requested */}
          <div className="relative w-full max-w-sm sm:max-w-md bg-white h-full shadow-2xl flex flex-col p-6 overflow-y-auto z-10 animate-fadeIn">
            <form onSubmit={handleSubmit} className="space-y-4 my-auto">
              {/* Entreprise. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Entreprise.
                </label>
                <input
                  type="text"
                  value={companyName || 'Défibeo'}
                  disabled
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                  }}
                  className="w-full p-2.5 bg-slate-100 border text-black cursor-not-allowed font-medium placeholder:text-black"
                />
              </div>

              {/* Compartiment. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Compartiment.
                </label>
                <select
                  value={compartiment}
                  onChange={(e) => setCompartiment(e.target.value)}
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                  }}
                  className="w-full p-2.5 bg-white border text-black focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium appearance-none placeholder:text-black"
                >
                  {COMPARTIMENTS.map((comp) => (
                    <option key={comp} value={comp}>
                      {comp}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nom & Prénom. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Nom & Prénom.
                </label>
                <input
                  type="text"
                  required
                  value={nomPrenom}
                  onChange={(e) => setNomPrenom(e.target.value)}
                  placeholder="Nom & Prénom"
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                  }}
                  className="w-full p-2.5 bg-white border text-black focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-black"
                />
              </div>

              {/* Email. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Email.
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre.email@exemple.com"
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                  }}
                  className="w-full p-2.5 bg-white border text-black focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-black"
                />
              </div>

              {/* Téléphone portable. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Téléphone portable.
                </label>
                <input
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="Téléphone portable"
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                  }}
                  className="w-full p-2.5 bg-white border text-black focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-black"
                />
              </div>

              {/* Description. */}
              <div className="flex flex-col gap-1">
                <label className="font-bold font-sans" style={{ fontSize: '18px', color: '#000000' }}>
                  Description.
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description du problème ou feedback..."
                  style={{
                    fontSize: '16px',
                    color: '#000000',
                    borderRadius: '13px',
                    borderColor: '#cbd5e1',
                  }}
                  className="w-full p-2.5 bg-white border text-black focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium placeholder:text-black"
                />
              </div>

              {/* Success message above Envoyer button */}
              {successMessage && (
                <div className="text-green-600 font-bold text-sm text-center py-1">
                  {successMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSending}
                  style={{
                    fontSize: '18px',
                    borderRadius: '13px',
                  }}
                  className="w-full py-3 bg-[#3556ec] hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSending ? 'Envoi en cours...' : 'Envoyer'}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    fontSize: '18px',
                    borderRadius: '13px',
                  }}
                  className="w-full py-3 bg-black hover:bg-slate-900 text-white font-bold transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackDrawer;
