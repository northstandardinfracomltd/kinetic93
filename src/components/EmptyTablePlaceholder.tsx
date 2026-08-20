import React, { useState, useEffect } from 'react';

interface EmptyTablePlaceholderProps {
  message?: string;
  className?: string;
}

export const EmptyTablePlaceholder: React.FC<EmptyTablePlaceholderProps> = ({
  message = "Aucun résultat.",
  className = "p-16 text-center font-sans lg:py-24"
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={className}>
      <p style={{ color: '#000000', fontSize: '16px', fontWeight: 100 }}>{message}</p>
      <p
        style={{
          color: '#6b7280',
          fontSize: '10px',
          marginTop: '6px',
          fontWeight: 400,
          letterSpacing: '0.01em'
        }}
      >
        {!isOnline
          ? "Vos données ne s’affichent pas ? Votre connexion internet semble instable ou hors réseau, vérifiez et actualisez."
          : "Vos données ne s’affichent pas ? Essayez avec Google Chrome ou vérifiez que votre navigateur est à jour."}
      </p>
    </div>
  );
};

export default EmptyTablePlaceholder;
