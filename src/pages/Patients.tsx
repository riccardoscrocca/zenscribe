import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Loader2, AlertCircle, UserPlus, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export function Patients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingTestPatient, setCreatingTestPatient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState<string>('all');

  useEffect(() => {
    loadPatients();
  }, []);

  async function loadPatients() {
    try {
      setLoading(true);
      setError(null);

      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', user?.id)
        .order('last_name', { ascending: true });

      if (patientsError) throw patientsError;
      setPatients(patientsData || []);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  const createTestPatient = async () => {
    setCreatingTestPatient(true);
    setError(null);
    
    try {
      // Generate random data for the test patient
      const randomNum = Math.floor(Math.random() * 10000);
      const testPatient = {
        user_id: user?.id,
        first_name: 'Test',
        last_name: `Patient ${randomNum}`,
        birth_date: '1990-01-01',
        gender: 'prefer_not_to_say',
        email: `test.patient${randomNum}@example.com`,
        phone: `+1555${randomNum.toString().padStart(4, '0')}`,
        notes: 'This is a test patient record.'
      };

      const { error: insertError } = await supabase
        .from('patients')
        .insert([testPatient]);

      if (insertError) throw insertError;

      // Reload the patients list
      await loadPatients();
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setCreatingTestPatient(false);
    }
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = (
      patient.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (patient.phone && patient.phone.includes(searchTerm))
    );

    const matchesGender = filterGender === 'all' || patient.gender === filterGender;

    return matchesSearch && matchesGender;
  });

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Pazienti</h1>
          <span className="ml-2 px-2.5 py-0.5 bg-blue-100 text-blue-800 text-sm rounded-full">
            {patients.length} totali
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={createTestPatient}
            disabled={creatingTestPatient}
            className="flex items-center justify-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            {creatingTestPatient ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Creazione in corso...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                <span>Crea Paziente Test</span>
              </>
            )}
          </button>
          <button
            onClick={() => navigate('/app/new-patient')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Aggiungi Paziente
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Cerca pazienti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="border border-gray-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Tutti</option>
            <option value="male">Uomini</option>
            <option value="female">Donne</option>
            <option value="other">Altro</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || filterGender !== 'all' ? 'Nessun paziente trovato.' : 'Nessun paziente registrato.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Età
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Telefono
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPatients.map((patient) => (
                  <tr 
                    key={patient.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/patients/${patient.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium">
                            {patient.first_name[0]}{patient.last_name[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {patient.first_name} {patient.last_name}
                          </div>
                          <div className="text-sm text-gray-500 sm:hidden">
                            {calculateAge(patient.birth_date)} anni
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-gray-900">{calculateAge(patient.birth_date)} anni</div>
                      <div className="text-sm text-gray-500">{new Date(patient.birth_date).toLocaleDateString('it-IT')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="text-sm text-gray-900">{patient.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="text-sm text-gray-900">{patient.phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/app/new-consultation?patient=${patient.id}`);
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Nuova Consultazione
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}