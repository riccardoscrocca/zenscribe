import React, { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="bg-green-50 text-green-800 rounded-lg shadow-lg p-4 flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-green-500" />
        <span>{message}</span>
      </div>
    </div>
  );
}