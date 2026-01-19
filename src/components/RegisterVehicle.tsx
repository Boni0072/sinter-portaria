import { useState, useEffect, Fragment, useRef } from 'react';
import { db, Driver } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, where, doc, getDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Save, Building2, ChevronDown, ChevronRight, Trash2, User, Truck, X, Plus, Camera, Upload } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  tenantId?: string;
}

export default function RegisterVehicle({ onSuccess, tenantId: propTenantId }: Props) {
  const { user, userProfile } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<{id: string, name: string}[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([new Date().toLocaleDateString('pt-BR')]));
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
  const [platePhotoPreview, setPlatePhotoPreview] = useState<string | null>(null);
  const vehiclePhotoRef = useRef<HTMLInputElement>(null);
  const platePhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initTenants = async () => {
      if (!user?.uid) return;
      
      const defaultId = propTenantId || (userProfile as any)?.tenantId || user.uid;
      const allowedTenants = (userProfile as any)?.allowedTenants;
      
      try {
        let list: {id: string, name: string}[] = [];

        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => getDoc(doc(db, 'tenants', id)));
          const docs = await Promise.all(promises);
          list = docs
            .filter(d => d.exists())
            .map(d => ({ id: d.id, name: d.data()?.name || 'Empresa sem nome' }));
        } else {
          const q = query(collection(db, 'tenants'), where('created_by', '==', user.uid));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            list = snapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().name || 'Empresa sem nome'
            }));
          }
        }
        
        if (list.length === 0 && defaultId) {
           const docSnap = await getDoc(doc(db, 'tenants', defaultId));
           if (docSnap.exists()) {
             list.push({ id: docSnap.id, name: docSnap.data().name || 'Minha Empresa' });
           }
        }

        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

        setTenants(list);
        
        if (list.some(t => t.id === defaultId)) {
          setCurrentTenantId(defaultId);
        } else if (list.length > 0) {
          setCurrentTenantId(list[0].id);
        } else {
          setCurrentTenantId(defaultId);
        }
      } catch (error) {
        console.error("Erro ao carregar empresas:", error);
        setCurrentTenantId(defaultId);
      }
    };
    
    initTenants();
  }, [user, userProfile, propTenantId]);

  useEffect(() => {
    if (tenants.length === 0 && !currentTenantId) {
        setDrivers([]);
        return;
    }

    const targets = tenants.length > 0 ? tenants : [{ id: currentTenantId, name: 'Current' }];
    const unsubscribes: (() => void)[] = [];
    
    let allDriversData: { [tenantId: string]: Driver[] } = {};

    targets.forEach(t => {
        const q = query(collection(db, 'tenants', t.id, 'drivers'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            allDriversData[t.id] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Driver[];
            
            const combinedDrivers = Object.values(allDriversData).flat();
            const uniqueDrivers = Array.from(new Map(combinedDrivers.map(d => [d.id, d])).values());
            uniqueDrivers.sort((a, b) => a.name.localeCompare(b.name));
            setDrivers(uniqueDrivers);

        }, (err) => {
            console.error(`Erro ao carregar motoristas de ${t.id}:`, err);
        });
        unsubscribes.push(unsubscribe);
    });

    return () => {
        unsubscribes.forEach(unsub => unsub());
    };
  }, [tenants, currentTenantId]);

  useEffect(() => {
    if (!currentTenantId) return;

    const q = query(
      collection(db, 'tenants', currentTenantId, 'vehicles'),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVehicles(list);
    });

    return () => unsubscribe();
  }, [currentTenantId]);

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

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = window.document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Erro ao processar imagem'));

          const MAX_SIZE = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = error => reject(error);
    });
  };

  const toggleGroup = (date: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const handleDeleteVehicle = async (id: string) => {
      if (window.confirm('Tem certeza que deseja excluir este veículo?')) {
          try {
              await deleteDoc(doc(db, 'tenants', currentTenantId, 'vehicles', id));
          } catch (e) {
              console.error("Erro ao excluir:", e);
              alert("Erro ao excluir veículo.");
          }
      }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!currentTenantId) {
        throw new Error('Selecione uma empresa para cadastrar o veículo.');
      }
      
      const uploadsPromise = Promise.all([
        vehiclePhoto ? convertFileToBase64(vehiclePhoto) : Promise.resolve(null),
        platePhoto ? convertFileToBase64(platePhoto) : Promise.resolve(null)
      ]);
      
      const [vehiclePhotoUrl, platePhotoUrl] = await uploadsPromise;

      await addDoc(collection(db, 'tenants', currentTenantId, 'vehicles'), {
        plate: plate.toUpperCase(),
        brand,
        model,
        color,
        driver_id: selectedDriver,
        vehicle_photo_url: vehiclePhotoUrl,
        plate_photo_url: platePhotoUrl,
        created_at: new Date().toISOString()
      });

      setPlate('');
      setBrand('');
      setModel('');
      setColor('');
      setSelectedDriver('');
      setVehiclePhoto(null);
      setPlatePhoto(null);
      if (vehiclePhotoRef.current) vehiclePhotoRef.current.value = '';
      if (platePhotoRef.current) platePhotoRef.current.value = '';
      setIsFormVisible(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar veículo');
    } finally {
      setLoading(false);
    }
  };

  const groupedVehicles = vehicles.reduce((acc, vehicle) => {
    const dateObj = vehicle.created_at ? new Date(vehicle.created_at) : new Date();
    const date = dateObj.toLocaleDateString('pt-BR');
    const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    
    const lastGroup = acc[acc.length - 1];
    if (lastGroup && lastGroup.date === date) {
      lastGroup.items.push(vehicle);
    } else {
      acc.push({ date, weekday: capitalizedWeekday, items: [vehicle] });
    }
    return acc;
  }, [] as { date: string; weekday: string; items: any[] }[]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-600" />
          Veículos
        </h2>
        <button
          onClick={() => setIsFormVisible(!isFormVisible)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {isFormVisible ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{isFormVisible ? 'Cancelar' : 'Novo Veículo'}</span>
        </button>
      </div>

      {isFormVisible && (
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8 animate-in slide-in-from-top-4 duration-300">
      <h3 className="text-lg font-bold text-gray-800 mb-6">Cadastrar Novo Veículo</h3>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {tenants.length > 1 && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Empresa / Unidade
            </label>
            <select
              value={currentTenantId}
              onChange={(e) => setCurrentTenantId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">O veículo será vinculado a esta unidade.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motorista Responsável
          </label>
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Placa
            </label>
            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
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
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
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
              value={model}
              onChange={(e) => setModel(e.target.value)}
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
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Preto"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Foto do Veículo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Foto do Veículo</label>
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
                relative w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                ${vehiclePhoto ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
              `}
            >
              {vehiclePhotoPreview ? (
                <div className="relative w-full h-full group">
                  <img src={vehiclePhotoPreview} alt="Veículo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera className="w-8 h-8 text-white mb-2" />
                    <span className="text-white text-sm font-medium">Alterar Foto</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center p-4">
                  <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
                    <Camera className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Adicionar Foto</span>
                </div>
              )}
            </div>
          </div>

          {/* Foto da Placa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Foto da Placa</label>
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
                relative w-full h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                ${platePhoto ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
              `}
            >
              {platePhotoPreview ? (
                <div className="relative w-full h-full group">
                  <img src={platePhotoPreview} alt="Placa" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera className="w-8 h-8 text-white mb-2" />
                    <span className="text-white text-sm font-medium">Alterar Foto</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center p-4">
                  <div className="bg-gray-100 p-3 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
                    <Camera className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Adicionar Foto</span>
                </div>
              )}
            </div>
          </div>
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
          <span>{loading ? 'Salvando...' : 'Salvar Veículo'}</span>
        </button>
      </form>
      </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Veículos Cadastrados</h3>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Fotos</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Placa</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Modelo/Cor</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Motorista</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedVehicles.map((group) => (
                <Fragment key={group.date}>
                  <tr 
                    className="bg-gray-100 border-y border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleGroup(group.date)}
                  >
                    <td colSpan={6} className="px-6 py-2 text-sm font-bold text-gray-700">
                      <div className="flex items-center">
                        {!expandedGroups.has(group.date) ? (
                          <ChevronRight className="w-4 h-4 mr-2" />
                        ) : (
                          <ChevronDown className="w-4 h-4 mr-2" />
                        )}
                        {group.date}
                        <span className="ml-2 font-normal text-gray-500">
                          - {group.weekday}
                        </span>
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({group.items.length})
                        </span>
                      </div>
                    </td>
                  </tr>
                  {expandedGroups.has(group.date) && group.items.map((vehicle) => {
                    const driver = drivers.find(d => d.id === vehicle.driver_id);
                    return (
                    <tr key={vehicle.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {tenants.find(t => t.id === currentTenantId)?.name || '---'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vehicle.created_at ? new Date(vehicle.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                            {vehicle.vehicle_photo_url ? (
                                <img 
                                  src={vehicle.vehicle_photo_url} 
                                  alt="Veículo" 
                                  className="w-10 h-10 rounded object-cover border border-gray-200 cursor-pointer hover:scale-110 transition-transform" 
                                  onClick={() => setZoomedImage(vehicle.vehicle_photo_url)}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400">
                                    <Truck className="w-5 h-5" />
                                </div>
                            )}
                            {vehicle.plate_photo_url ? (
                                <img 
                                  src={vehicle.plate_photo_url} 
                                  alt="Placa" 
                                  className="w-10 h-10 rounded object-cover border border-gray-200 cursor-pointer hover:scale-110 transition-transform" 
                                  onClick={() => setZoomedImage(vehicle.plate_photo_url)}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400">
                                    <span className="text-[8px] font-bold">PLACA</span>
                                </div>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className="px-2 py-1 bg-gray-100 rounded border border-gray-300 font-mono font-bold text-gray-800 text-sm">
                            {vehicle.plate}
                         </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vehicle.brand} {vehicle.model} <span className="text-gray-400 mx-1">•</span> {vehicle.color}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                            {driver?.photo_url ? (
                                <img src={driver.photo_url} alt="" className="w-8 h-8 rounded-full object-cover mr-2 border border-gray-200" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-2 border border-gray-200">
                                    <User className="w-4 h-4 text-gray-500" />
                                </div>
                            )}
                            <span className="text-sm font-medium text-gray-900">{driver?.name || 'Desconhecido'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button 
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Excluir Veículo"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  )})}
                </Fragment>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Nenhum vehículo registrado nesta empresa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoom" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
