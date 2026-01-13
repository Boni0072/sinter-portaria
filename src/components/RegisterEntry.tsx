import { useState, useEffect, useRef } from 'react';
import { storage, Driver, Vehicle } from './firebase';
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload, User, Truck, Check, Maximize2, X } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export default function RegisterEntry({ onSuccess }: Props) {
  const { user, userProfile } = useAuth();
  const db = getFirestore();
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
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
  const [platePhotoPreview, setPlatePhotoPreview] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewVehicle, setIsNewVehicle] = useState(false);

  const vehiclePhotoRef = useRef<HTMLInputElement>(null);
  const platePhotoRef = useRef<HTMLInputElement>(null);

  const selectedDriverData = drivers.find(d => d.id === selectedDriver);

  useEffect(() => {
    if (user || userProfile) {
      loadDrivers();
    }
  }, [user, userProfile]);

  useEffect(() => {
    if (selectedDriver && (user || userProfile)) {
      loadVehicles(selectedDriver);
    }
  }, [selectedDriver, user, userProfile]);

  useEffect(() => {
    if (vehiclePhoto) {
      const url = URL.createObjectURL(vehiclePhoto);
      setVehiclePhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setVehiclePhotoPreview(null);
  }, [vehiclePhoto]);

  useEffect(() => {
    if (platePhoto) {
      const url = URL.createObjectURL(platePhoto);
      setPlatePhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPlatePhotoPreview(null);
  }, [platePhoto]);

  const loadDrivers = async () => {
    try {
      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) return;
      const q = query(collection(db, 'tenants', tenantId, 'drivers'), orderBy('name'));
      const querySnapshot = await getDocs(q);
      const loadedDrivers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Driver[];

      setDrivers(loadedDrivers);
    } catch (err) {
      console.error('Erro ao carregar motoristas:', err);
    }
  };

  const loadVehicles = async (driverId: string) => {
    try {
      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) return;
      const q = query(collection(db, 'tenants', tenantId, 'vehicles'), where('driver_id', '==', driverId), orderBy('plate'));
      const querySnapshot = await getDocs(q);
      const loadedVehicles = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];

      setVehicles(loadedVehicles);
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    }
  };

  const uploadPhoto = async (file: File, bucket: string, tenantId: string) => {
    if (!tenantId) throw new Error("Não foi possível identificar a empresa para o upload.");
    const fileName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `tenants/${tenantId}/${bucket}/${fileName}`);
    
    await uploadBytes(storageRef, file, { contentType: file.type });
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!vehiclePhoto || !platePhoto) {
        throw new Error('Por favor, adicione as fotos do veículo e da placa');
      }

      // Fallback: se não tiver tenantId no perfil, usa o UID do usuário
      const tenantId = (userProfile as any)?.tenantId || user?.uid;

      if (!tenantId) {
        throw new Error('Erro de identificação da empresa. Tente recarregar a página.');
      }

      // Otimização: Uploads e criação de veículo em paralelo
      const uploadsPromise = Promise.all([
        uploadPhoto(vehiclePhoto, 'vehicle-photos', tenantId),
        uploadPhoto(platePhoto, 'plate-photos', tenantId)
      ]);

      let vehicleIdPromise = Promise.resolve(selectedVehicle);

      if (isNewVehicle) {
        vehicleIdPromise = addDoc(collection(db, 'tenants', tenantId, 'vehicles'), {
          plate: newPlate.toUpperCase(),
          brand: vehicleBrand,
          model: vehicleModel,
          color: vehicleColor,
          driver_id: selectedDriver,
          created_at: new Date().toISOString()
        }).then(ref => ref.id);
      }

      const [[vehiclePhotoUrl, platePhotoUrl], vehicleId] = await Promise.all([
        uploadsPromise,
        vehicleIdPromise
      ]);

      // Otimização: Salvar dados desnormalizados para leitura rápida na lista
      const driverSnapshot = drivers.find(d => d.id === selectedDriver);
      const vehicleSnapshot = isNewVehicle 
        ? { plate: newPlate.toUpperCase(), brand: vehicleBrand, model: vehicleModel, color: vehicleColor }
        : vehicles.find(v => v.id === selectedVehicle);

      await addDoc(collection(db, 'tenants', tenantId, 'entries'), {
        vehicle_id: vehicleId,
        driver_id: selectedDriver,
        vehicle_photo_url: vehiclePhotoUrl,
        plate_photo_url: platePhotoUrl,
        notes,
        // Dados cacheados para performance de leitura
        cached_data: {
          driver_name: driverSnapshot?.name || 'Desconhecido',
          driver_document: driverSnapshot?.document || '',
          vehicle_plate: vehicleSnapshot?.plate || '',
          vehicle_brand: vehicleSnapshot?.brand || '',
          vehicle_model: vehicleSnapshot?.model || '',
          vehicle_color: vehicleSnapshot?.color || ''
        },
        registered_by: user?.uid,
        entry_time: new Date().toISOString()
      });

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
      console.error("Falha detalhada ao registrar entrada:", err); // Log detalhado para depuração
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Registrar Entrada</h2>
        <p className="text-gray-500">Preencha os dados do motorista e veículo para liberar o acesso.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Coluna do Motorista (Esquerda) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Identificação</h3>
              </div>
              
              <div className="space-y-6 flex-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o Motorista
                  </label>
                  <select
                    value={selectedDriver}
                    onChange={(e) => {
                      setSelectedDriver(e.target.value);
                      setSelectedVehicle('');
                      setIsNewVehicle(false);
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition-all"
                    required
                  >
                    <option value="">Selecione na lista...</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} - {driver.document}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDriverData && (
                  <div className="flex flex-col items-center justify-center py-4 animate-in fade-in duration-500">
                    <div className="relative mb-4 group">
                      {selectedDriverData.photo_url ? (
                        <div className="relative cursor-zoom-in" onClick={() => setZoomedImage(selectedDriverData.photo_url!)}>
                          <img 
                            src={selectedDriverData.photo_url} 
                            alt={selectedDriverData.name}
                            className="w-56 h-56 rounded-full object-cover border-4 border-blue-100 shadow-xl group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                            <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-56 h-56 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-200 shadow-inner">
                          <User className="w-24 h-24 text-gray-300" />
                        </div>
                      )}
                      <div className="absolute bottom-4 right-4 bg-green-500 w-6 h-6 rounded-full border-4 border-white shadow-sm" title="Motorista Ativo"></div>
                    </div>
                    
                    <div className="text-center">
                      <h4 className="text-xl font-bold text-gray-900">{selectedDriverData.name}</h4>
                      <div className="inline-flex items-center mt-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600 font-medium">
                        CPF: {selectedDriverData.document}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Coluna do Veículo (Direita) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Dados do Veículo</h3>
              </div>

              <div className="space-y-6">
                <div className={!selectedDriver ? 'opacity-50 pointer-events-none grayscale' : 'transition-all duration-300'}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o Veículo
                  </label>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'new') {
                        setIsNewVehicle(true);
                        setSelectedVehicle('new');
                      } else {
                        setIsNewVehicle(false);
                        setSelectedVehicle(value);
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition-all"
                    required
                    disabled={!selectedDriver}
                  >
                    <option value="">{selectedDriver ? 'Selecione o veículo...' : 'Aguardando seleção do motorista...'}</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate} - {vehicle.brand} {vehicle.model}
                      </option>
                    ))}
                    <option value="new" className="font-bold text-blue-600 bg-blue-50">+ Cadastrar Novo Veículo</option>
                  </select>
                </div>

                {isNewVehicle && (
                  <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 space-y-5 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        Novo Veículo
                      </h4>
                      <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded">Cadastro Rápido</span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Placa</label>
                        <input
                          type="text"
                          value={newPlate}
                          onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                          className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          required
                          placeholder="ABC-1234"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Marca</label>
                        <input
                          type="text"
                          value={vehicleBrand}
                          onChange={(e) => setVehicleBrand(e.target.value)}
                          className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="Ex: Toyota"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Modelo</label>
                        <input
                          type="text"
                          value={vehicleModel}
                          onChange={(e) => setVehicleModel(e.target.value)}
                          className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="Ex: Corolla"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Cor</label>
                        <input
                          type="text"
                          value={vehicleColor}
                          onChange={(e) => setVehicleColor(e.target.value)}
                          className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="Ex: Preto"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Seção Inferior: Fotos e Observações */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Camera className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Registro Fotográfico e Observações</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* Foto do Veículo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Foto do Veículo</label>
              <input
                ref={vehiclePhotoRef}
                type="file"
                accept="image/*"
                onChange={(e) => setVehiclePhoto(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div 
                onClick={() => vehiclePhotoRef.current?.click()}
                className={`
                  relative w-full h-52 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                  ${vehiclePhoto ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                `}
              >
                {vehiclePhoto && vehiclePhotoPreview ? (
                  <div className="relative w-full h-full group">
                    <img src={vehiclePhotoPreview} alt="Veículo" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Camera className="w-8 h-8 text-white mb-2" />
                      <span className="text-white text-sm font-medium">Clique para alterar</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoomedImage(vehiclePhotoPreview);
                      }}
                      className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="Ampliar"
                    >
                      <Maximize2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
                      <Camera className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Adicionar Foto do Veículo</span>
                    <span className="text-xs text-gray-400 mt-1">Formatos: JPG, PNG</span>
                  </div>
                )}
              </div>
            </div>

            {/* Foto da Placa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Foto da Placa</label>
              <input
                ref={platePhotoRef}
                type="file"
                accept="image/*"
                onChange={(e) => setPlatePhoto(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div 
                onClick={() => platePhotoRef.current?.click()}
                className={`
                  relative w-full h-52 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                  ${platePhoto ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                `}
              >
                {platePhoto && platePhotoPreview ? (
                  <div className="relative w-full h-full group">
                    <img src={platePhotoPreview} alt="Placa" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Camera className="w-8 h-8 text-white mb-2" />
                      <span className="text-white text-sm font-medium">Clique para alterar</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoomedImage(platePhotoPreview);
                      }}
                      className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="Ampliar"
                    >
                      <Maximize2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
                      <Camera className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Adicionar Foto da Placa</span>
                    <span className="text-xs text-gray-400 mt-1">Formatos: JPG, PNG</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Observações Adicionais</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none bg-gray-50 focus:bg-white"
              rows={3}
              placeholder="Ex: Entrega de material, visita técnica, prestador de serviço..."
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            {error}
          </div>
        )}

        <div className="flex justify-end pt-4 pb-8">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center space-x-3 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Save className="w-6 h-6" />
            <span className="text-lg font-medium">{loading ? 'Registrando Entrada...' : 'Confirmar Entrada'}</span>
          </button>
        </div>
      </form>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoom" 
            className="w-full h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 z-50 text-white/70 hover:text-white transition-colors p-2 bg-black/20 rounded-full hover:bg-black/40"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
}
