import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../lib/subscriptions';
import {
  Check,
  Loader2,
  AlertCircle,
  Clock,
  FileText,
  Star,
  CreditCard,
  Shield,
  Sparkles,
  Headphones,
  Zap,
  ArrowDown,
  Building,
  Users,
  TrendingUp
} from 'lucide-react';

interface DashboardStats {
  totalPatients: number;
  notesCreated: number;
  dictationMinutes: {
    used: number;
    total: number;
    remaining: number;
  };
  recentPatients: Array<{
    id: string;
    first_name: string;
    last_name: string;
    created_at: string;
  }>;
  recentNotes: Array<{
    id: string;
    patient_id: string;
    title: string;
    created_at: string;
    patient_name: string;
    duration_seconds?: number;
    transcription?: string;
    motivo_visita?: string;
  }>;
  newPatientsThisWeek: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    notesCreated: 0,
    dictationMinutes: {
      used: 0,
      total: 0,
      remaining: 0
    },
    recentPatients: [],
    recentNotes: [],
    newPatientsThisWeek: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadDashboardStats();

    // Subscribe to user changes
    const userChannel = supabase.channel('custom-all-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        },
        () => {
          loadDashboardStats();
        }
      )
      .subscribe();

    // Subscribe to subscription changes
    const subscriptionChannel = supabase.channel('custom-subscription-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          loadDashboardStats();
        }
      )
      .subscribe();

    return () => {
      userChannel.unsubscribe();
      subscriptionChannel.unsubscribe();
    };
  }, [user, navigate]);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user?.id) throw new Error('User not authenticated');

      const subscriptionStatus = await getSubscriptionStatus(user.id);

      const { count: patientsCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get new patients from this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const { count: newPatientsCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString());

      const { data: recentPatients } = await supabase
        .from('patients')
        .select('id, first_name, last_name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: userPatients } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', user.id);

      const patientIds = userPatients?.map(p => p.id) || [];

      const { data: recentNotes } = await supabase
        .from('consultations')
        .select(`
          id,
          patient_id,
          created_at,
          motivo_visita,
          duration_seconds,
          transcription,
          patient:patients(first_name, last_name)
        `)
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalPatients: patientsCount || 0,
        notesCreated: recentNotes?.length || 0,
        dictationMinutes: {
          used: subscriptionStatus.minutesUsed,
          total: subscriptionStatus.monthlyMinutes,
          remaining: subscriptionStatus.minutesRemaining
        },
        recentPatients: recentPatients || [],
        recentNotes: (recentNotes || []).map(note => ({
          id: note.id,
          patient_id: note.patient_id,
          title: note.motivo_visita || 'Consultazione',
          created_at: note.created_at,
          patient_name: note.patient ? `${note.patient.first_name} ${note.patient.last_name}` : 'Unknown',
          duration_seconds: note.duration_seconds,
          transcription: note.transcription,
          motivo_visita: note.motivo_visita
        })),
        newPatientsThisWeek: newPatientsCount || 0
      });
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getUsagePercentage = () => {
    return Math.min(100, (stats.dictationMinutes.used / (stats.dictationMinutes.total || 1)) * 100);
  };

  const getProgressBarColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percentage >= 75) return 'bg-gradient-to-r from-yellow-500 to-red-500';
    if (percentage >= 50) return 'bg-gradient-to-r from-green-500 to-yellow-500';
    return 'bg-gradient-to-r from-green-400 to-green-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          {new Date().toLocaleDateString('it-IT', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl p-6 shadow-lg border border-blue-100 transform transition-all duration-500 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-500">Pazienti Totali</h3>
          <p className="text-2xl font-semibold text-gray-900">{stats.totalPatients}</p>
          <p className="mt-1 text-sm text-green-500">+{stats.newPatientsThisWeek} nuovi questa settimana</p>
        </div>

        <div className="bg-gradient-to-br from-white to-purple-50 rounded-xl p-6 shadow-lg border border-purple-100 transform transition-all duration-500 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500">Note Create</h3>
          <p className="text-2xl font-semibold text-gray-900">{stats.notesCreated}</p>
          <p className="mt-1 text-sm text-gray-500">0 note questo mese</p>
        </div>

        <div className="bg-gradient-to-br from-white to-green-50 rounded-xl p-6 shadow-lg border border-green-100 transform transition-all duration-500 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500">Minuti Dettatura</h3>
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-500">
                {stats.dictationMinutes.used} di {stats.dictationMinutes.total} minuti
              </span>
              <span className="text-sm font-medium text-gray-900">
                {Math.round(getUsagePercentage())}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-1000 ease-out ${getProgressBarColor()}`}
                style={{ width: `${getUsagePercentage()}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {stats.dictationMinutes.remaining} minuti rimanenti
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="col-span-1 md:col-span-1 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-lg font-medium text-gray-900">Pazienti Recenti</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentPatients.length === 0 ? (
              <div className="px-6 py-5 text-sm text-gray-500">
                Nessun paziente recente.
              </div>
            ) : (
              stats.recentPatients.map((patient) => (
                <div 
                  key={patient.id} 
                  className="px-6 py-4 hover:bg-blue-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/app/patients/${patient.id}`)}
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {patient.first_name} {patient.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(patient.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-lg font-medium text-gray-900">Consultazioni Recenti</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentNotes.length === 0 ? (
              <div className="px-6 py-5 text-sm text-gray-500">
                Nessuna consultazione recente.
              </div>
            ) : (
              stats.recentNotes.map((note) => (
                <div 
                  key={note.id} 
                  className="px-6 py-4 hover:bg-blue-50 transition-colors cursor-pointer"
                  onClick={() => {
                    navigate(`/app/patients/${note.patient_id}`, { state: { highlightNoteId: note.id } });
                  }}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {note.patient_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(note.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {note.motivo_visita || (
                          note.transcription ? (
                            note.transcription.substring(0, 100) + '...'
                          ) : 'Consultazione'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}