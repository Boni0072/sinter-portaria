import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Clock, Calendar, Image as ImageIcon } from 'lucide-react';

interface EntryWithDetails {
  id: string;
  entry_time: string;
  exit_time: string | null;
  vehicle_photo_url: string;
  plate_photo_url: string;
  notes: string;
  driver: {
    name: string;
    document: string;
  };
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    color: string;
  };
}

export default function EntriesList() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('entries')
        .select(`
          *,
          driver:drivers(name, document),
          vehicle:vehicles(plate, brand, model, color)
        `)
        .order('entry_time', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Erro ao carregar registros:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterExit = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('entries')
        .update({
          exit_time: new Date().toISOString(),
          exit_registered_by: user?.id,
        })
        .eq('id', entryId);

      if (error) throw error;
      loadEntries();
    } catch (err) {
      console.error('Erro ao registrar saída:', err);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600">Nenhum registro encontrado</h3>
        <p className="text-gray-500 mt-2">Comece registrando uma entrada</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Registros de Entrada e Saída</h2>

      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`border rounded-xl p-6 transition ${
              entry.exit_time
                ? 'bg-gray-50 border-gray-200'
                : 'bg-green-50 border-green-200'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {entry.vehicle.plate}
                    </h3>
                    <p className="text-gray-600">
                      {entry.vehicle.brand} {entry.vehicle.model} - {entry.vehicle.color}
                    </p>
                    <p className="text-gray-600 mt-1">
                      Motorista: <span className="font-medium">{entry.driver.name}</span>
                    </p>
                  </div>
                  {!entry.exit_time && (
                    <span className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
                      DENTRO
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="w-4 h-4 mr-2 text-green-600" />
                    <div>
                      <span className="font-medium">Entrada:</span>{' '}
                      {formatDateTime(entry.entry_time)}
                    </div>
                  </div>

                  {entry.exit_time && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2 text-red-600" />
                      <div>
                        <span className="font-medium">Saída:</span>{' '}
                        {formatDateTime(entry.exit_time)}
                      </div>
                    </div>
                  )}
                </div>

                {entry.notes && (
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm text-gray-700">{entry.notes}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedImage(entry.vehicle_photo_url)}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Ver Foto do Veículo</span>
                  </button>

                  <button
                    onClick={() => setSelectedImage(entry.plate_photo_url)}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Ver Foto da Placa</span>
                  </button>
                </div>
              </div>

              {!entry.exit_time && (
                <button
                  onClick={() => handleRegisterExit(entry.id)}
                  className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition whitespace-nowrap"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Registrar Saída</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-4xl max-h-full">
            <img
              src={selectedImage}
              alt="Evidência"
              className="max-w-full max-h-screen rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
