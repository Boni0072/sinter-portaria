import { useState, useEffect, useRef } from 'react';
import { db, Driver, Vehicle } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload, User, Truck, Check, Maximize2, X, Building2, LogOut, ChevronDown, Search } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export default function RegisterEntry({ onSuccess }: Props) {
  const { user, userProfile, signOut } = useAuth() as any;
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleCompany, setVehicleCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
  const [platePhotoPreview, setPlatePhotoPreview] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewVehicle, setIsNewVehicle] = useState(false);
  const [tenants, setTenants] = useState<{id: string, name: string}[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isRestrictedMode, setIsRestrictedMode] = useState(false);
  const [isDriverListOpen, setIsDriverListOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  const vehiclePhotoRef = useRef<HTMLInputElement>(null);
  const platePhotoRef = useRef<HTMLInputElement>(null);

  const selectedDriverData = drivers.find(d => d.id === selectedDriver);

  useEffect(() => {
    const initTenants = async () => {
      if (!user?.uid) {
        setCheckingAccess(false);
        return;
      }
      
      setCheckingAccess(true);
      let defaultId = (userProfile as any)?.tenantId || user.uid;
      let allowedTenants = (userProfile as any)?.allowedTenants;
      
      try {
        // Validação de segurança: Busca dados atualizados do usuário no Firebase
        const userDocRef = doc(db, 'profiles', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          
          // Atualiza com dados frescos do banco
          if (userData.tenantId) defaultId = userData.tenantId;
          if (userData.allowedTenants) allowedTenants = userData.allowedTenants;

          // Validação de página
          if (userData.allowedPages) {
             let pages = userData.allowedPages;
             // Garante que seja um array (caso tenha sido salvo como string no cadastro)
             if (typeof pages === 'string') pages = [pages];

             if (Array.isArray(pages)) {
                // setIsRestrictedMode(true);
                if (!pages.includes('register-entry')) {
                   setError('Acesso negado: Você não tem permissão para visualizar esta página.');
                   setCheckingAccess(false);
                   return;
                }
             }
          }
        }

        let list: {id: string, name: string}[] = [];
        let isRestricted = false;

        // 1. Se o usuário tem permissões explícitas (sub-usuário/operador)
        if (allowedTenants && Array.isArray(allowedTenants)) {
          isRestricted = true;
          if (allowedTenants.length > 0) {
            const promises = allowedTenants.map((id: string) => getDoc(doc(db, 'tenants', id)));
            const docs = await Promise.all(promises);
            list = docs
              .filter(d => d.exists())
              .map(d => ({ id: d.id, name: d.data()?.name || 'Empresa sem nome' }));
          }
        } 
        // 2. Se não tem permissões explícitas, tenta buscar pelo created_by (Dono/Admin)
        else {
          const q = query(collection(db, 'tenants'), where('created_by', '==', user.uid));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            list = snapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().name || 'Empresa sem nome'
            }));
          }
          
          // 3. Fallback: Apenas se não houver restrições explícitas
          if (list.length === 0 && defaultId && !isRestricted) {
             const docSnap = await getDoc(doc(db, 'tenants', defaultId));
             if (docSnap.exists()) {
               list.push({ id: docSnap.id, name: docSnap.data().name || 'Minha Empresa' });
             }
          }
        }

        // Remove duplicatas
        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

        setTenants(list);
        
        // Lógica de seleção da empresa inicial
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
      } finally {
        setCheckingAccess(false);
      }
    };
    
    initTenants();
  }, [user, userProfile]);

  const loadDrivers = async () => {
    console.log("Iniciando loadDrivers...");
    try {
      // Busca todos os motoristas da coleção global 'drivers'
      const q = query(collection(db, 'drivers'));
      const snap = await getDocs(q);
      console.log(`Consulta a 'drivers' retornou ${snap.docs.length} documentos.`);
      
      const allDrivers = snap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data()
      })) as Driver[];

      // Ordena os motoristas manualmente no cliente
      allDrivers.sort((a, b) => a.name.localeCompare(b.name));

      console.log("Motoristas carregados:", allDrivers);
      setDrivers(allDrivers);
    } catch (err) {
      console.error('Erro ao carregar motoristas:', err);
    }
  };

  const loadVehicles = async (driverId: string) => {
    try {
      if (!driverId) return;
      
      // Busca veículos do motorista na subcoleção 'vehicles' dele
      const q = query(collection(db, 'drivers', driverId, 'vehicles'), orderBy('plate'));
      const snap = await getDocs(q);
      const allVehicles = snap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as Vehicle[];

      setVehicles(allVehicles);
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      loadVehicles(selectedDriver);
    }
  }, [selectedDriver]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!vehiclePhoto || !platePhoto) {
        throw new Error('Por favor, adicione as fotos do veículo e da placa');
      }

      if (!currentTenantId) {
        throw new Error('Selecione uma empresa para registrar a entrada.');
      }
      
      const tenantId = currentTenantId;

      // Garante que a "pasta" (documento) da empresa exista explicitamente no banco
      await setDoc(doc(db, 'tenants', tenantId), {
        last_activity: new Date().toISOString()
      }, { merge: true });

      // Otimização: Conversão para Base64 e criação de veículo em paralelo
      const uploadsPromise = Promise.all([
        convertFileToBase64(vehiclePhoto),
        convertFileToBase64(platePhoto)
      ]);

      // Lógica de salvamento robusta (Geração de ID antecipada)
      let vehicleId = selectedVehicle;
      const vehicleSavePromises = [];

      if (isNewVehicle) {
        if (!selectedDriver) {
          throw new Error('Motorista deve ser selecionado para cadastrar um novo veículo.');
        }
        // Gera o ID localmente na subcoleção do motorista
        const newVehicleRef = doc(collection(db, 'drivers', selectedDriver, 'vehicles'));
        vehicleId = newVehicleRef.id;

        const vehicleData = {
          plate: newPlate.toUpperCase(),
          brand: vehicleBrand,
          model: vehicleModel,
          color: vehicleColor,
          company: vehicleCompany,
          // O driver_id aqui é redundante pois já está no caminho, mas pode ser útil
          driver_id: selectedDriver, 
          created_at: new Date().toISOString()
        };

        // Aguarda salvamento real do veículo
        vehicleSavePromises.push(setDoc(newVehicleRef, vehicleData));
      }

      // Aguarda uploads e o início do salvamento do veículo
      const [[vehiclePhotoUrl, platePhotoUrl]] = await Promise.all([
        uploadsPromise,
        ...vehicleSavePromises
      ]);

      // Otimização: Salvar dados desnormalizados para leitura rápida na lista
      const driverSnapshot = drivers.find(d => d.id === selectedDriver);
      const vehicleSnapshot = isNewVehicle 
        ? { plate: newPlate.toUpperCase(), brand: vehicleBrand, model: vehicleModel, color: vehicleColor, company: vehicleCompany }
        : vehicles.find(v => v.id === selectedVehicle);

      // Salvar Entrada com timeout de segurança
      const newEntryRef = doc(collection(db, 'tenants', tenantId, 'entries'));
      const entryData = {
        vehicle_id: vehicleId,
        driver_id: selectedDriver,
        vehicle_photo_url: vehiclePhotoUrl,
        plate_photo_url: platePhotoUrl,
        notes,
        // Dados cacheados para performance de leitura
        cached_data: {
          driver_name: driverSnapshot?.name || 'Desconhecido',
          driver_document: driverSnapshot?.document || '',
          driver_photo_url: driverSnapshot?.photo_url || '', // Salva a foto do motorista no registro
          vehicle_plate: vehicleSnapshot?.plate || '',
          vehicle_brand: vehicleSnapshot?.brand || '',
          vehicle_model: vehicleSnapshot?.model || '',
          vehicle_color: vehicleSnapshot?.color || '',
          vehicle_company: (vehicleSnapshot as any)?.company || ''
        },
        registered_by: user?.uid,
        entry_time: new Date().toISOString()
      };

      // Aguarda salvamento real da entrada
      await setDoc(newEntryRef, entryData);

      setSelectedDriver('');
      setSelectedVehicle('');
      setNewPlate('');
      setVehicleBrand('');
      setVehicleModel('');
      setVehicleColor('');
      setVehicleCompany('');
      setNotes('');
      setVehiclePhoto(null);
      setPlatePhoto(null);
      setIsNewVehicle(false);

      if (vehiclePhotoRef.current) vehiclePhotoRef.current.value = '';
      if (platePhotoRef.current) platePhotoRef.current.value = '';

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar entrada');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && error.includes('Acesso negado')) {
    return (
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          {error}
        </div>
      </div>
    );
  }

  const containerClass = isRestrictedMode 
    ? "fixed inset-0 z-[9999] bg-gray-50 overflow-y-auto p-4 md:p-8" 
    : "max-w-6xl mx-auto";

  return (
    <div className={containerClass}>
      {isRestrictedMode && (
        <div className="max-w-6xl mx-auto flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-800">Controle de Acesso</h1>
           </div>
           <button 
             onClick={() => signOut && signOut()} 
             className="flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
           >
             <LogOut className="w-5 h-5" />
             <span>Sair</span>
           </button>
        </div>
      )}
      
      <div className={isRestrictedMode ? "max-w-6xl mx-auto" : ""}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Registrar Entrada</h2>
        <p className="text-gray-500">Preencha os dados do motorista e veículo para liberar o acesso.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Seletor de Empresa (Aparece apenas se houver mais de uma) */}
        {tenants.length > 1 && (
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Unidade / Empresa</h3>
            </div>
            <select
              value={currentTenantId}
              onChange={(e) => setCurrentTenantId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition-all"
            >
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </div>
        )}

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
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o Motorista
                  </label>
                  
                  {isDriverListOpen && (
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsDriverListOpen(false)}
                    ></div>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsDriverListOpen(!isDriverListOpen)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition-all text-left flex items-center justify-between relative z-20"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {selectedDriverData?.photo_url ? (
                          <img src={selectedDriverData.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0" />
                      ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedDriver ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                            <User className="w-5 h-5" />
                          </div>
                      )}
                      <span className={`truncate ${selectedDriver ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                        {selectedDriverData ? `${selectedDriverData.name} - ${selectedDriverData.document}` : "Selecione na lista..."}
                      </span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${isDriverListOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDriverListOpen && (
                    <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-3 border-b border-gray-100 bg-gray-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Buscar por nome ou CPF..."
                            value={driverSearch}
                            onChange={(e) => setDriverSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                      </div>
                      
                      <div className="overflow-y-auto flex-1">
                        {drivers
                          .filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase()) || d.document.includes(driverSearch))
                          .map(driver => (
                            <button
                              key={driver.id}
                              type="button"
                              onClick={() => {
                                setSelectedDriver(driver.id);
                                setSelectedVehicle('');
                                setIsNewVehicle(false);
                                setIsDriverListOpen(false);
                                setDriverSearch('');
                              }}
                              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                            >
                              {driver.photo_url ? (
                                <img 
                                  src={driver.photo_url} 
                                  alt={driver.name} 
                                  className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400 shrink-0">
                                  <User className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{driver.name}</p>
                                <p className="text-xs text-gray-500 truncate">{driver.document}</p>
                              </div>
                              {selectedDriver === driver.id && (
                                <Check className="w-4 h-4 text-blue-600 ml-auto shrink-0" />
                              )}
                            </button>
                          ))}
                          {drivers.filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase()) || d.document.includes(driverSearch)).length === 0 && (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              Nenhum motorista encontrado.
                            </div>
                          )}
                      </div>
                    </div>
                  )}
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
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Empresa</label>
                        <input
                          type="text"
                          value={vehicleCompany}
                          onChange={(e) => setVehicleCompany(e.target.value)}
                          className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          placeholder="Ex: Transportadora XYZ"
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
      </div>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoom" 
            className="w-full h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200 bg-white rounded-lg"
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
