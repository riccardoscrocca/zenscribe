import React, { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, PlusCircle, History, ChevronLeft, ChevronRight, FileText, Pill, DollarSign, BarChart2, MessageSquare, Settings, CreditCard, X, Bot as Lotus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (user?.id) {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          setUserRole(data.role);
        } else {
          setUserRole('doctor');
        }
      }
    };

    fetchUserRole();
  }, [user]);

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  const menuItems = [
    {
      group: 'PRINCIPALE',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', to: '/app' },
        { icon: Users, label: 'Pazienti', to: '/app/patients' },
        { icon: PlusCircle, label: 'Nuova Consultazione', to: '/app/new-consultation' },
        { icon: History, label: 'Storico', to: '/app/history' },
        { icon: CreditCard, label: 'Abbonamento', to: '/app/subscription' }
      ]
    },
    {
      group: 'CLINICA',
      items: [
        { icon: Pill, label: 'Medicazioni', to: '/app/medications' },
        { icon: FileText, label: 'Ordini & Risultati', to: '/app/orders' }
      ]
    },
    ...(isAdmin ? [{
      group: 'AMMINISTRAZIONE',
      items: [
        { icon: DollarSign, label: 'Fatturazione', to: '/app/billing' },
        { icon: BarChart2, label: 'Report', to: '/app/reports' },
        { icon: MessageSquare, label: 'Comunicazioni', to: '/app/communication' },
        { icon: Settings, label: 'Strumenti Admin', to: '/app/admin' }
      ]
    }] : [])
  ];

  return (
    <aside className="h-full flex flex-col bg-white border-r border-gray-200">
      <div className="p-4 flex items-center justify-between border-b border-gray-200">
        <div className={`flex items-center transition-all duration-300 ${
          isCollapsed ? 'scale-0 w-0' : 'w-auto'
        }`}>
          <Lotus className="h-6 w-6 text-teal-600" />
          <h1 className="font-bold text-2xl ml-2">
            <span className="text-teal-600">Zen</span>
            <span className="text-gray-700">Scribe</span>
            <span className="text-gray-500 text-xl">.ai</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:block p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronLeft className="h-5 w-5 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {menuItems.map((group, groupIndex) => (
          <div key={groupIndex}>
            {!isCollapsed && (
              <h2 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.group}
              </h2>
            )}
            <div className="space-y-1">
              {group.items.map((item, itemIndex) => (
                <NavLink
                  key={itemIndex}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-teal-50 text-teal-700' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                >
                  <item.icon className={`flex-shrink-0 ${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'}`} />
                  <span className={`transition-all duration-300 ${
                    isCollapsed ? 'w-0 opacity-0' : 'opacity-100'
                  }`}>
                    {item.label}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}