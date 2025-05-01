import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users, Clock, AlertCircle, Loader2, Shield } from 'lucide-react';

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  freeUsers: number;
  paidUsers: number;
}

interface UserDetail {
  id: string;
  email: string;
  full_name: string | null;
  subscription_tier: string;
  minutes_used: number;
  monthly_minutes: number;
  minutes_remaining: number;
  created_at: string;
}

export function AdminTools() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    activeUsers: 0,
    freeUsers: 0,
    paidUsers: 0
  });
  const [users, setUsers] = useState<UserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadAdminData();
  }, [user, navigate]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user's role to verify admin access
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user?.id)
        .single();

      if (userError) throw userError;

      if (!userData || !['admin', 'superadmin'].includes(userData.role)) {
        navigate('/app');
        return;
      }

      // Get current period
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Get all users with their subscription details
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          subscription_tier,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Get subscription plans
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*');

      if (plansError) throw plansError;

      // Get current subscriptions
      const { data: subscriptionsData, error: subscriptionsError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .gte('current_period_end', periodStart.toISOString())
        .lte('current_period_start', periodEnd.toISOString());

      if (subscriptionsError) throw subscriptionsError;

      // Calculate stats
      const totalUsers = usersData?.length || 0;
      const activeUsers = usersData?.filter(u => u.subscription_tier !== 'free').length || 0;
      const freeUsers = usersData?.filter(u => u.subscription_tier === 'free').length || 0;
      const paidUsers = totalUsers - freeUsers;

      setStats({
        totalUsers,
        activeUsers,
        freeUsers,
        paidUsers
      });

      // Transform user data
      const transformedUsers = usersData?.map(user => {
        const plan = plansData?.find(p => p.name === user.subscription_tier);
        const subscription = subscriptionsData?.find(s => s.user_id === user.id);
        const minutesUsed = subscription?.minutes_used || 0;
        const monthlyMinutes = plan?.monthly_minutes || 30;

        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          subscription_tier: user.subscription_tier,
          minutes_used: minutesUsed,
          monthly_minutes: monthlyMinutes,
          minutes_remaining: Math.max(0, monthlyMinutes - minutesUsed),
          created_at: user.created_at
        };
      }) || [];

      setUsers(transformedUsers);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-8">
        <Shield className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Users</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.activeUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Free Users</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.freeUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Paid Users</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.paidUsers}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">User Accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Minutes Used
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Minutes Remaining
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || 'No Name'}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                      ${user.subscription_tier === 'free' ? 'bg-gray-100 text-gray-800' :
                        user.subscription_tier === 'basic' ? 'bg-blue-100 text-blue-800' :
                        user.subscription_tier === 'advanced' ? 'bg-purple-100 text-purple-800' :
                        'bg-green-100 text-green-800'}`}>
                      {user.subscription_tier}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {user.minutes_used} / {user.monthly_minutes}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.minutes_remaining} minutes
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}