import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../lib/subscriptions';
import { SubscriptionSummary } from '../components/SubscriptionSummary';
import { fixConsultationsWithMissingUserId } from '../lib/aiAgent';
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
  TrendingUp,
  RefreshCw,
  User
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
  const [refreshing, setRefreshing] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    minutesUsed: 0,
    monthlyMinutes: 0,
    minutesRemaining: 0,
    plan: 'free',
    price: 0
  });

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

    // Sottoscrivi agli aggiornamenti in tempo reale
    const subscription = supabase
      .channel('subscription_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user?.id}`
        },
        () => {
          // Aggiorna lo stato quando ricevi una notifica
          loadDashboardStats();
        }
      )
      .subscribe();

    return () => {
      userChannel.unsubscribe();
      subscriptionChannel.unsubscribe();
      subscription.unsubscribe();
    };
  }, [user, navigate]);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user?.id) throw new Error('User not authenticated');

      // Tenta di correggere le consultazioni con user_id mancante
      const updatedCount = await fixConsultationsWithMissingUserId();
      if (updatedCount > 0) {
        console.log(`[loadDashboardStats] Fixed ${updatedCount} consultations with missing user_id`);
      }

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
      
      console.log('Loading Dashboard - Debug Info:', { 
        userId: user.id, 
        patientsCount, 
        patientIds,
        recentPatientsCount: recentPatients?.length || 0
      });

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
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('Recent notes data:', recentNotes);
      
      // Verifica consultazioni senza user_id
      const { data: notesWithoutUserId, error: notesError } = await supabase
        .from('consultations')
        .select('id, patient_id')
        .is('user_id', null)
        .limit(10);
        
      console.log('Notes without user_id:', notesWithoutUserId, notesError);

      setStats({
        totalPatients: patientsCount || 0,
        notesCreated: recentNotes?.length || 0,
        dictationMinutes: {
          used: subscriptionStatus.minutesUsed,
          total: subscriptionStatus.monthlyMinutes,
          remaining: subscriptionStatus.minutesRemaining
        },
        recentPatients: recentPatients || [],
        recentNotes: (recentNotes || []).map(note => {
          // Sicuro accesso alle proprietà del paziente
          let patientName = 'Unknown';
          try {
            // @ts-ignore - Ignoriamo il problema del typo
            if (note.patient && note.patient.first_name && note.patient.last_name) {
              // @ts-ignore
              patientName = `${note.patient.first_name} ${note.patient.last_name}`;
            }
          } catch (e) {
            console.error('Error accessing patient properties:', e);
          }
          
          return {
            id: note.id,
            patient_id: note.patient_id,
            title: note.motivo_visita || 'Consultazione',
            created_at: note.created_at,
            patient_name: patientName,
            duration_seconds: note.duration_seconds,
            transcription: note.transcription,
            motivo_visita: note.motivo_visita
          };
        }),
        newPatientsThisWeek: newPatientsCount || 0
      });

      setSubscriptionStatus(subscriptionStatus);
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
    if (subscriptionStatus.monthlyMinutes === 0) return 0;
    return Math.min(100, (subscriptionStatus.minutesUsed / subscriptionStatus.monthlyMinutes) * 100);
  };

  const getProgressBarColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percentage >= 75) return 'bg-gradient-to-r from-yellow-500 to-red-500';
    if (percentage >= 50) return 'bg-gradient-to-r from-green-500 to-yellow-500';
    return 'bg-gradient-to-r from-green-400 to-green-500';
  };

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadDashboardStats().finally(() => {
      setRefreshing(false);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Aggiorna
        </button>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
      
      {loading ? (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 bg-white rounded-lg shadow animate-pulse p-6"></div>
          ))}
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {/* Abbonamento */}
            <SubscriptionSummary />
            
            {/* Pazienti */}
            <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-gray-900">Pazienti</h3>
                <Link 
                  to="/app/patients"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Vedi tutti
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Totale pazienti</p>
                  <p className="text-2xl font-semibold">{stats.totalPatients}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-green-600">
                <ArrowDown className="h-4 w-4 mr-1 rotate-180" />
                <span>+{stats.newPatientsThisWeek} nuovi questa settimana</span>
              </div>
            </div>
            
            {/* Consultazioni */}
            <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-gray-900">Consultazioni</h3>
                <Link 
                  to="/app/history"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Vedi tutte
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Headphones className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Note create</p>
                  <p className="text-2xl font-semibold">{stats.notesCreated}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Pazienti recenti e Note recenti */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mt-6">
            
            {/* Pazienti recenti */}
            <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-medium text-gray-900">Pazienti Recenti</h3>
                <Link to="/app/patients" className="text-sm text-blue-600 hover:text-blue-800">
                  Vedi tutti
                </Link>
              </div>
              
              {stats.recentPatients.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Nessun paziente registrato.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {stats.recentPatients.map(patient => (
                    <Link
                      key={patient.id}
                      to={`/app/patients/${patient.id}`}
                      className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {patient.first_name} {patient.last_name}
                          </h4>
                          <p className="text-sm text-gray-500">
                            Registrato il {formatDate(patient.created_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            
            {/* Note consultazioni recenti */}
            <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-medium text-gray-900">Consultazioni Recenti</h3>
                <Link to="/app/history" className="text-sm text-blue-600 hover:text-blue-800">
                  Vedi tutte
                </Link>
              </div>
              
              {stats.recentNotes.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Nessuna consultazione registrata.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {stats.recentNotes.map(note => (
                    <div key={note.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{note.title}</h4>
                            <p className="text-sm text-gray-500">{note.patient_name}</p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(note.created_at)}
                        </div>
                      </div>
                      <div className="ml-13 text-sm">
                        <Link 
                          to={`/app/history`} 
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Visualizza referto
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}