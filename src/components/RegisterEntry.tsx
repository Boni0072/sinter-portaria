import { useState, useEffect, useRef } from 'react';
import { supabase, Driver, Vehicle } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export default function RegisterEntry({ onSuccess }: Props) {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [notes, setNotes] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewVehicle, setIsNewVehicle] = useState(false);

  const vehiclePhotoRef = useRef<HTMLInputElement>(null);
  const platePhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      loadVehicles(selectedDriver);
    }
  }, [selectedDriver]);

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('name');

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error('Erro ao carregar motoristas:', err);
    }
  };

  const loadVehicles = async (driverId: string) => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', driverId)
        .order('plate');

      if (error) throw error;
      setVehicles(data || []);
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    }
  };

  const uploadPhoto = async (file: File, bucket: string) => {
    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!vehiclePhoto || !platePhoto) {
        throw new Error('Por favor, adicione as fotos do veículo e da placa');
      }

      const vehiclePhotoUrl = await uploadPhoto(vehiclePhoto, 'vehicle-photos');
      const platePhotoUrl = await uploadPhoto(platePhoto, 'plate-photos');

      let vehicleId = selectedVehicle;

      if (isNewVehicle) {
        const { data: newVehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .insert({
            plate: newPlate.toUpperCase(),
            brand: vehicleBrand,
            model: vehicleModel,
            color: vehicleColor,
            driver_id: selectedDriver,
          })
          .select()
          .single();

        if (vehicleError) throw vehicleError;
        vehicleId = newVehicle.id;
      }

      const { error: entryError } = await supabase
        .from('entries')
        .insert({
          vehicle_id: vehicleId,
          driver_id: selectedDriver,
          vehicle_photo_url: vehiclePhotoUrl,
          plate_photo_url: platePhotoUrl,
          notes,
          registered_by: user?.id,
        });

      if (entryError) throw entryError;

      setSelectedDriver('');
      setSelectedVehicle('');
      setNewPlate('');
      setVehicleBrand('');
      setVehicleModel('');
      setVehicleColor('');
      setNotes('');
      setVehiclePhoto(null);
      setPlatePhoto(null);
      setIsNewVehicle(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar entrada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Registrar Entrada</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motorista
            </label>
            <select
              value={selectedDriver}
              onChange={(e) => {
                setSelectedDriver(e.target.value);
                setSelectedVehicle('');
                setIsNewVehicle(false);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Selecione um motorista</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} - {driver.document}
                </option>
              ))}
            </select>
          </div>

          {selectedDriver && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Veículo
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'new') {
                    setIsNewVehicle(true);
                    setSelectedVehicle('');
                  } else {
                    setIsNewVehicle(false);
                    setSelectedVehicle(value);
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Selecione um veículo</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate} - {vehicle.brand} {vehicle.model}
                  </option>
                ))}
                <option value="new">+ Novo Veículo</option>
              </select>
            </div>
          )}
        </div>

        {isNewVehicle && (
          <div className="bg-blue-50 p-6 rounded-lg space-y-4">
            <h3 className="font-semibold text-gray-800 mb-4">Novo Veículo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Placa
                </label>
                <input
                  type="text"
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  placeholder="ABC-1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Marca
                </label>
                <input
                  type="text"
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Toyota"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Modelo
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Corolla"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor
                </label>
                <input
                  type="text"
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Preto"
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Foto do Veículo
            </label>
            <input
              ref={vehiclePhotoRef}
              type="file"
              accept="image/*"
              onChange={(e) => setVehiclePhoto(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => vehiclePhotoRef.current?.click()}
              className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition flex flex-col items-center justify-center"
            >
              {vehiclePhoto ? (
                <>
                  <Upload className="w-8 h-8 text-green-600 mb-2" />
                  <span className="text-sm text-green-600">{vehiclePhoto.name}</span>
                </>
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">Clique para adicionar foto</span>
                </>
              )}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Foto da Placa
            </label>
            <input
              ref={platePhotoRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPlatePhoto(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => platePhotoRef.current?.click()}
              className="w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition flex flex-col items-center justify-center"
            >
              {platePhoto ? (
                <>
                  <Upload className="w-8 h-8 text-green-600 mb-2" />
                  <span className="text-sm text-green-600">{platePhoto.name}</span>
                </>
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">Clique para adicionar foto</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observações
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            placeholder="Observações adicionais..."
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          <span>{loading ? 'Salvando...' : 'Registrar Entrada'}</span>
        </button>
      </form>
    </div>
  );
}
