import { useState, useEffect } from 'react';
import { supabase, Driver } from '../lib/supabase';
import { User, Phone, FileText, PenTool } from 'lucide-react';

export default function DriversList() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error('Erro ao carregar motoristas:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="text-center py-12">
        <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600">Nenhum motorista cadastrado</h3>
        <p className="text-gray-500 mt-2">Comece cadastrando um novo motorista</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Motoristas Cadastrados</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map((driver) => (
          <div
            key={driver.id}
            className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              {driver.signature_url && (
                <div className="bg-green-100 p-2 rounded-lg">
                  <PenTool className="w-4 h-4 text-green-600" />
                </div>
              )}
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              {driver.name}
            </h3>

            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-600">
                <FileText className="w-4 h-4 mr-2" />
                <span>{driver.document}</span>
              </div>

              {driver.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  <span>{driver.phone}</span>
                </div>
              )}
            </div>

            {driver.signature_url && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Assinatura:</p>
                <img
                  src={driver.signature_url}
                  alt="Assinatura"
                  className="w-full h-20 object-contain bg-white border border-gray-200 rounded"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
