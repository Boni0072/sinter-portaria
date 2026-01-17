import { useState, useRef, useEffect, Fragment } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, getDoc, setDoc, orderBy, documentId, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload, AlertTriangle, X, Building2, User, ChevronDown, ChevronUp, Package, Shield, Car, ChevronRight, PenTool, Eraser } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  tenantId?: string;
}

export default function RegisterOccurrence({ onSuccess, tenantId: propTenantId }: Props) {
  const { user, userProfile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<(File | null)[]>([null, null, null]);
  const [photoPreviews, setPhotoPreviews] = useState<(string | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<{id: string, name: string}[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([new Date().toLocaleDateString('pt-BR')]));
  
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signingOccurrenceId, setSigningOccurrenceId] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);

  // Novos estados para Material de Carga e Armamento
  const [cargoMaterial, setCargoMaterial] = useState({
    radioHT: '',
    qtdBotons: '',
    qtdCarregadores: '',
    qtdCapaChuva: '',
    qtdPendRonda: '',
    qtdLanternas: ''
  });
  const [weaponry, setWeaponry] = useState({
    arma1: '',
    arma2: '',
    arma3: '',
    arma4: '',
    municoes: ''
  });

  // Estado para Veículo
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [vehicleData, setVehicleData] = useState({
    plate: '',
    model: '',
    color: '',
    company: ''
  });

  const photoRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

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
    if (!currentTenantId) return;

    const q = query(
      collection(db, 'tenants', currentTenantId, 'occurrences'),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const occurrencesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Buscar dados dos usuários que criaram as ocorrências
      const userIds = [...new Set(occurrencesList.map((o: any) => o.created_by).filter(Boolean))];
      const usersMap = new Map();

      try {
        if (userIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < userIds.length; i += 10) {
            chunks.push(userIds.slice(i, i + 10));
          }
          
          for (const chunk of chunks) {
              const qUsers = query(collection(db, 'profiles'), where(documentId(), 'in', chunk));
              const snapUsers = await getDocs(qUsers);
              snapUsers.forEach(doc => {
                  const data = doc.data();
                  usersMap.set(doc.id, { 
                      name: data.name || data.email?.split('@')[0] || 'Usuário', 
                      photo_url: data.photo_url,
                      email: data.email 
                  });
              });
          }
        }
      } catch (userErr) {
        console.warn("Não foi possível carregar detalhes dos usuários:", userErr);
      }

      const enriched = occurrencesList.map((occ: any) => ({
          ...occ,
          creator: usersMap.get(occ.created_by)
      }));

      setOccurrences(enriched);
    }, (error) => {
      console.error("Erro no listener de ocorrências:", error);
    });

    return () => unsubscribe();
  }, [currentTenantId]);

  const handlePhotoChange = (index: number, file: File | null) => {
    const newPhotos = [...photos];
    newPhotos[index] = file;
    setPhotos(newPhotos);

    const newPreviews = [...photoPreviews];
    if (file) {
      newPreviews[index] = URL.createObjectURL(file);
    } else {
      newPreviews[index] = null;
    }
    setPhotoPreviews(newPreviews);
  };

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
      if (!currentTenantId) throw new Error('Selecione uma empresa.');

      const photoPromises = photos.map(photo => photo ? convertFileToBase64(photo) : Promise.resolve(null));
      const photoUrls = await Promise.all(photoPromises);
      const validPhotoUrls = photoUrls.filter(url => url !== null) as string[];

      await addDoc(collection(db, 'tenants', currentTenantId, 'occurrences'), {
        title,
        description,
        cargo_material: cargoMaterial,
        weaponry: weaponry,
        vehicle: selectedVehicle === 'new' ? vehicleData : null,
        photos: validPhotoUrls,
        created_by: user?.uid,
        created_at: new Date().toISOString()
      });

      setTitle('');
      setDescription('');
      setPhotos([null, null, null]);
      setPhotoPreviews([null, null, null]);
      setCargoMaterial({
        radioHT: '',
        qtdBotons: '',
        qtdCarregadores: '',
        qtdCapaChuva: '',
        qtdPendRonda: '',
        qtdLanternas: ''
      });
      setWeaponry({
        arma1: '',
        arma2: '',
        arma3: '',
        arma4: '',
        municoes: ''
      });
      setVehicleData({
        plate: '',
        model: '',
        color: '',
        company: ''
      });
      setSelectedVehicle('');
      if (photoRefs[0].current) photoRefs[0].current.value = '';
      if (photoRefs[1].current) photoRefs[1].current.value = '';
      if (photoRefs[2].current) photoRefs[2].current.value = '';
      // Não precisa chamar loadOccurrences(), o onSnapshot atualizará a lista
      // onSuccess(); // Removido para manter o usuário na tela e ver a lista atualizada
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar ocorrência');
    } finally {
      setLoading(false);
    }
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

  const groupedOccurrences = occurrences.reduce((acc, occ) => {
    const occDate = new Date(occ.created_at);
    const date = occDate.toLocaleDateString('pt-BR');
    const weekday = occDate.toLocaleDateString('pt-BR', { weekday: 'long' });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const lastGroup = acc[acc.length - 1];
    
    if (lastGroup && lastGroup.date === date) {
      lastGroup.items.push(occ);
    } else {
      acc.push({ date, weekday: capitalizedWeekday, items: [occ] });
    }
    return acc;
  }, [] as { date: string; weekday: string; items: any[] }[]);

  const startSigning = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawingSignature(true);
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const drawSignature = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignature) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopSigning = () => {
    setIsDrawingSignature(false);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSaveSignature = async () => {
    if (!signingOccurrenceId || !currentTenantId || !signatureCanvasRef.current) return;
    
    try {
        const signatureUrl = signatureCanvasRef.current.toDataURL('image/png');
        await updateDoc(doc(db, 'tenants', currentTenantId, 'occurrences', signingOccurrenceId), {
            signature_url: signatureUrl,
            signature_at: new Date().toISOString(),
            signature_by: (userProfile as any)?.name || user?.email || 'Usuário'
        });
        setIsSignatureModalOpen(false);
        setSigningOccurrenceId(null);
    } catch (error) {
        console.error("Error saving signature", error);
        alert("Erro ao salvar assinatura");
    }
  };

  useEffect(() => {
    if (isSignatureModalOpen && signatureCanvasRef.current) {
        const canvas = signatureCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
        }
    }
  }, [isSignatureModalOpen]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-orange-500" /> Registrar Ocorrência
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-blue-500 font-medium hidden sm:block">
            {isFormVisible ? 'Ocultar Formulário' : 'Abrir Formulário'}
          </span>
          <button
            onClick={() => setIsFormVisible(!isFormVisible)}
            className="text-gray-500 hover:text-red-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
            title={isFormVisible ? "Recolher formulário" : "Expandir formulário"}
          >
            {isFormVisible ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Seletor de Empresa (Visível sempre, fora do formulário) */}
      {tenants.length > 1 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" /> Selecionar Unidade / Empresa
          </label>
          <select
            value={currentTenantId}
            onChange={(e) => setCurrentTenantId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            {tenants.map(tenant => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </div>
      )}

      {isFormVisible && (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Título da Ocorrência</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
            placeholder="Ex: Portão danificado, Entrega não autorizada..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Descrição Detalhada</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-32 resize-none"
            required
            placeholder="Descreva o que aconteceu..."
          />
        </div>

        {/* Seção Material de Carga */}
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> Material de Carga
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Linha 1 */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Rádio HT</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.radioHT}
                        onChange={e => setCargoMaterial({...cargoMaterial, radioHT: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Botons</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.qtdBotons}
                        onChange={e => setCargoMaterial({...cargoMaterial, qtdBotons: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Carregadores</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.qtdCarregadores}
                        onChange={e => setCargoMaterial({...cargoMaterial, qtdCarregadores: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Linha 2 */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Capa de Chuva</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.qtdCapaChuva}
                        onChange={e => setCargoMaterial({...cargoMaterial, qtdCapaChuva: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Pend. de Ronda</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.qtdPendRonda}
                        onChange={e => setCargoMaterial({...cargoMaterial, qtdPendRonda: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qtd. Lanternas</label>
                    <input 
                        type="number" 
                        value={cargoMaterial.qtdLanternas}
                        onChange={e => setCargoMaterial({...cargoMaterial, qtdLanternas: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
        </div>

        {/* Seção Armamento */}
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" /> Armamento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(num => (
                    <div key={num}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{num}º Arma nº</label>
                        <input 
                            type="text" 
                            value={weaponry[`arma${num}` as keyof typeof weaponry]}
                            onChange={e => setWeaponry({...weaponry, [`arma${num}`]: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Numeração"
                        />
                    </div>
                ))}
                <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nº de Munições</label>
                    <input 
                        type="number" 
                        value={weaponry.municoes}
                        onChange={e => setWeaponry({...weaponry, municoes: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        placeholder="Quantidade total"
                    />
                </div>
            </div>
        </div>

        {/* Seção Veículo */}
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-600" /> Veículo
            </h3>
            <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Selecionar Veículo</label>
                <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Nenhum veículo envolvido</option>
                    <option value="new">Novo Veículo</option>
                </select>
            </div>

            {selectedVehicle === 'new' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Placa</label>
                        <input 
                            type="text" 
                            value={vehicleData.plate}
                            onChange={e => setVehicleData({...vehicleData, plate: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="ABC-1234"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Modelo</label>
                        <input 
                            type="text" 
                            value={vehicleData.model}
                            onChange={e => setVehicleData({...vehicleData, model: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Modelo/Cor"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cor</label>
                        <input 
                            type="text" 
                            value={vehicleData.color}
                            onChange={e => setVehicleData({...vehicleData, color: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Cor do veículo"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Empresa</label>
                        <input 
                            type="text" 
                            value={vehicleData.company}
                            onChange={e => setVehicleData({...vehicleData, company: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Empresa do veículo"
                        />
                    </div>
                </div>
            )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Evidências (Fotos)</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((index) => (
              <div key={index}>
                <input
                  ref={photoRefs[index]}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoChange(index, e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div 
                  onClick={() => photoRefs[index].current?.click()}
                  className={`
                    relative w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                    ${photos[index] ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                  `}
                >
                  {photoPreviews[index] ? (
                    <div className="relative w-full h-full group">
                      <img src={photoPreviews[index]!} alt={`Evidência ${index + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Camera className="w-8 h-8 text-white mb-2" />
                        <span className="text-white text-xs font-medium">Alterar</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-2">
                      <Camera className="w-6 h-6 text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500">Foto {index + 1}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center space-x-2 w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span>{loading ? 'Salvando...' : 'Registrar Ocorrência'}</span>
        </button>
      </form>
      )}

      <div className="mt-12 border-t pt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Histórico de Ocorrências</h3>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Evidências</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedOccurrences.map((group) => (
                <Fragment key={group.date}>
                  <tr 
                    className="bg-gray-100 border-y border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleGroup(group.date)}
                  >
                    <td colSpan={7} className="px-6 py-2 text-sm font-bold text-gray-700">
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
                  {expandedGroups.has(group.date) && group.items.map((occ) => (
                <tr key={occ.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {tenants.find(t => t.id === currentTenantId)?.name || '---'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(occ.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                        {occ.creator?.photo_url ? (
                            <img src={occ.creator.photo_url} alt="" className="w-8 h-8 rounded-full object-cover mr-2 border border-gray-200" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-2 border border-gray-200">
                                <User className="w-4 h-4 text-gray-500" />
                            </div>
                        )}
                        <span className="text-sm font-medium text-gray-900">{occ.creator?.name || 'Desconhecido'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {occ.title}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={occ.description}>
                    {occ.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex -space-x-2 overflow-hidden">
                        {occ.photos?.map((photo: string, idx: number) => (
                            <img 
                                key={idx} 
                                src={photo} 
                                alt={`Evidência ${idx+1}`}
                                className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover cursor-pointer hover:scale-110 transition-transform"
                                onClick={() => setZoomedImage(photo)}
                            />
                        ))}
                        {(!occ.photos || occ.photos.length === 0) && <span className="text-gray-400 italic">Sem fotos</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {occ.signature_url ? (
                      <div className="flex flex-col gap-1 items-end">
                        <div 
                          className="h-8 w-20 bg-white border border-gray-200 rounded cursor-zoom-in transition-all duration-200 hover:scale-[3] active:scale-[3] hover:z-50 hover:shadow-xl hover:border-blue-400 origin-right relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomedImage(occ.signature_url);
                          }}
                          title="Clique para ampliar assinatura"
                        >
                          <img src={occ.signature_url} alt="Assinatura" className="w-full h-full object-contain" />
                        </div>
                        <div className="text-right">
                          {occ.signature_by && <div className="text-[10px] text-gray-800 font-bold">{occ.signature_by}</div>}
                          <div className="text-[10px] text-gray-500">
                          {occ.signature_at 
                            ? new Date(occ.signature_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : ''}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button 
                          onClick={(e) => {
                              e.stopPropagation();
                              setSigningOccurrenceId(occ.id);
                              setIsSignatureModalOpen(true);
                          }}
                          className="p-2 rounded-full transition-colors text-blue-600 hover:bg-blue-50"
                          title="Coletar Assinatura"
                      >
                          <PenTool className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Nenhuma ocorrência registrada nesta empresa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoom" 
            className="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200 bg-white rounded-lg"
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

      {isSignatureModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Coletar Assinatura</h3>
                    <button onClick={() => setIsSignatureModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="border-2 border-gray-300 rounded-lg bg-white mb-4 overflow-hidden">
                    <canvas
                        ref={signatureCanvasRef}
                        width={460}
                        height={200}
                        onMouseDown={startSigning}
                        onMouseMove={drawSignature}
                        onMouseUp={stopSigning}
                        onMouseLeave={stopSigning}
                        className="w-full h-full cursor-crosshair touch-none"
                    />
                </div>
                
                <div className="flex justify-between items-center">
                    <button
                        type="button"
                        onClick={clearSignature}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                        <Eraser className="w-4 h-4" /> Limpar
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveSignature}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        <Save className="w-4 h-4" /> Salvar Assinatura
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}