import { useState, useRef, useEffect, Fragment } from 'react';
import { auth } from './firebase';
import { getDatabase, ref, push, set, update, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload, AlertTriangle, X, Building2, User, ChevronDown, ChevronUp, Package, Shield, Car, ChevronRight, PenTool, Eraser, Edit, ChevronsDown, ChevronsUp, Download, FileText } from 'lucide-react';

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
  const [viewOccurrence, setViewOccurrence] = useState<any | null>(null);
  
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signingOccurrenceId, setSigningOccurrenceId] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState('Concluída');
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [tempStatus, setTempStatus] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusPhotos, setStatusPhotos] = useState<(File | null)[]>([null, null]);
  const [statusPhotoPreviews, setStatusPhotoPreviews] = useState<(string | null)[]>([null, null]);

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
  const statusPhotoRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const database = getDatabase(auth.app);

  useEffect(() => {
    const initTenants = async () => {
      if (!user?.uid) return;
      
      const defaultId = propTenantId || (userProfile as any)?.tenantId || user.uid;
      const allowedTenants = (userProfile as any)?.allowedTenants;
      
      try {
        let list: {id: string, name: string}[] = [];

        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => get(ref(database, `tenants/${id}`)));
          const snapshots = await Promise.all(promises);
          snapshots.forEach((snap, index) => {
            if (snap.exists()) {
              list.push({ id: allowedTenants[index], name: snap.val().name });
            }
          });
        } else {
          const q = query(ref(database, 'tenants'), orderByChild('owner_id'), equalTo(user.uid));
          const snapshot = await get(q);
          if (snapshot.exists()) {
            snapshot.forEach(child => {
              list.push({ id: child.key!, name: child.val().name });
            });
          }
        }
        
        if (list.length === 0 && defaultId) {
           const snap = await get(ref(database, `tenants/${defaultId}`));
           if (snap.exists()) {
             list.push({ id: defaultId, name: snap.val().name || 'Minha Empresa' });
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

    const occurrencesRef = ref(database, `tenants/${currentTenantId}/occurrences`);
    const q = query(occurrencesRef, orderByChild('created_at'));

    const unsubscribe = onValue(q, async (snapshot) => {
      const occurrencesList: any[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          occurrencesList.push({ id: child.key!, ...child.val() });
        });
      }
      occurrencesList.reverse(); // Descending order

      // Buscar dados dos usuários que criaram as ocorrências
      const userIds = [...new Set(occurrencesList.map((o: any) => o.created_by).filter(Boolean))];
      const usersMap = new Map();

      try {
        await Promise.all(userIds.map(async (uid) => {
            const snap = await get(ref(database, `profiles/${uid}`));
            if (snap.exists()) {
                const data = snap.val();
                usersMap.set(uid, { 
                    name: data.name || data.email?.split('@')[0] || 'Usuário', 
                    photo_url: data.photo_url,
                    email: data.email 
                });
            }
        }));
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

  const handleStatusPhotoChange = (index: number, file: File | null) => {
    const newPhotos = [...statusPhotos];
    newPhotos[index] = file;
    setStatusPhotos(newPhotos);

    const newPreviews = [...statusPhotoPreviews];
    if (file) {
      newPreviews[index] = URL.createObjectURL(file);
    } else {
      newPreviews[index] = null;
    }
    setStatusPhotoPreviews(newPreviews);
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

      const newOccurrenceRef = push(ref(database, `tenants/${currentTenantId}/occurrences`));
      await set(newOccurrenceRef, {
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

  const filteredOccurrences = occurrences.filter(occ => {
    if (statusFilter === 'all') return true;
    return (occ.status || 'Pendente') === statusFilter;
  });

  const handleExportCSV = () => {
    if (filteredOccurrences.length === 0) return;

    const csvContent = [
      ['Empresa', 'Data Registro', 'Hora Registro', 'Data Conclusão', 'Hora Conclusão', 'Usuário', 'Título', 'Descrição', 'Status', 'Ação Realizada', 'Fotos Evidência', 'Fotos Conclusão'],
      ...filteredOccurrences.map(occ => [
        tenants.find(t => t.id === currentTenantId)?.name || '---',
        new Date(occ.created_at).toLocaleDateString('pt-BR'),
        new Date(occ.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        occ.completed_at ? new Date(occ.completed_at).toLocaleDateString('pt-BR') : '',
        occ.completed_at ? new Date(occ.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        occ.creator?.name || 'Desconhecido',
        (occ.title || '').replace(/"/g, '""'),
        (occ.description || '').replace(/"/g, '""'),
        occ.status || 'Pendente',
        (occ.action_taken || '').replace(/"/g, '""'),
        (occ.photos || []).join('; '),
        (occ.completion_photos || []).join('; ')
      ])
    ]
    .map(e => e.map(field => `"${field}"`).join(','))
    .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ocorrencias_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const groupedOccurrences = filteredOccurrences.reduce((acc, occ) => {
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

  const expandAll = () => {
    const allDates = new Set(groupedOccurrences.map(g => g.date));
    setExpandedGroups(allDates);
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

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
        await update(ref(database, `tenants/${currentTenantId}/occurrences/${signingOccurrenceId}`), {
            signature_url: signatureUrl,
            signature_at: new Date().toISOString(),
            signature_by: (userProfile as any)?.name || user?.email || 'Usuário',
            status: signatureStatus
        });
        setIsSignatureModalOpen(false);
        setSigningOccurrenceId(null);
    } catch (error) {
        console.error("Error saving signature", error);
        alert("Erro ao salvar assinatura");
    }
  };

  const handleUpdateStatus = async () => {
    if (!editingStatusId || !currentTenantId) return;
    
    if (tempStatus === 'Concluída' && !actionTaken.trim()) {
        alert("O campo 'Ação Realizada' é obrigatório para concluir a ocorrência.");
        return;
    }

    try {
        const updateData: any = { status: tempStatus };
        
        if (tempStatus === 'Concluída') {
            updateData.action_taken = actionTaken;
            updateData.completed_at = new Date().toISOString();
            updateData.completed_by = user?.uid;
        }
        
        const photoPromises = statusPhotos.map(photo => photo ? convertFileToBase64(photo) : Promise.resolve(null));
        const photoUrls = await Promise.all(photoPromises);
        const validPhotoUrls = photoUrls.filter(url => url !== null) as string[];
        if (validPhotoUrls.length > 0) {
            updateData.completion_photos = validPhotoUrls;
        }

        await update(ref(database, `tenants/${currentTenantId}/occurrences/${editingStatusId}`), updateData);
        setIsStatusModalOpen(false);
        setEditingStatusId(null);
        setActionTaken('');
        setStatusPhotos([null, null]);
        setStatusPhotoPreviews([null, null]);
    } catch (error) {
        console.error("Error updating status", error);
        alert("Erro ao atualizar status");
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-bold text-gray-800">Histórico de Ocorrências</h3>
            
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <div className="flex gap-2 text-sm">
                    <button 
                        onClick={expandAll} 
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                        <ChevronsDown className="w-4 h-4" /> Expandir Tudo
                    </button>
                    <span className="text-gray-300">|</span>
                    <button 
                        onClick={collapseAll} 
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                        <ChevronsUp className="w-4 h-4" /> Recolher Tudo
                    </button>
                </div>
                <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-medium whitespace-nowrap">Filtrar por Status:</span>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                    <option value="all">Todos</option>
                    <option value="Pendente">Pendente</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Parada">Parada</option>
                    <option value="Concluída">Concluída</option>
                </select>
                </div>
                <button
                  onClick={handleExportCSV}
                  disabled={filteredOccurrences.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Exportar Excel
                </button>
            </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Registro</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Conclusão</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Ação Realizada</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Evidências</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Fotos Conclusão</th>
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
                    <td colSpan={11} className="px-6 py-2 text-sm font-bold text-gray-700">
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
                <tr key={occ.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setViewOccurrence(occ)}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {tenants.find(t => t.id === currentTenantId)?.name || '---'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(occ.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {occ.completed_at ? new Date(occ.completed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      occ.status === 'Concluída' ? 'bg-green-100 text-green-800' : 
                      occ.status === 'Em Andamento' ? 'bg-yellow-100 text-yellow-800' : 
                      occ.status === 'Parada' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {occ.status || 'Pendente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={occ.action_taken}>
                    {occ.action_taken || '---'}
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex -space-x-2 overflow-hidden">
                        {occ.completion_photos?.map((photo: string, idx: number) => (
                            <img 
                                key={idx} 
                                src={photo} 
                                alt={`Conclusão ${idx+1}`}
                                className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover cursor-pointer hover:scale-110 transition-transform"
                                onClick={() => setZoomedImage(photo)}
                            />
                        ))}
                        {(!occ.completion_photos || occ.completion_photos.length === 0) && <span className="text-gray-400 italic">---</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center justify-end gap-2">
                      {occ.status !== 'Concluída' && (
                      <button 
                          onClick={(e) => {
                              e.stopPropagation();
                              setEditingStatusId(occ.id);
                              setTempStatus(occ.status || 'Pendente');
                              setActionTaken('');
                              setIsStatusModalOpen(true);
                          }}
                          className="p-2 rounded-full transition-colors text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                          title="Alterar Status"
                      >
                          <Edit className="w-5 h-5" />
                      </button>
                      )}
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
                              setSignatureStatus(occ.status || 'Concluída');
                              setIsSignatureModalOpen(true);
                          }}
                          className="p-2 rounded-full transition-colors text-blue-600 hover:bg-blue-50"
                          title="Coletar Assinatura"
                      >
                          <PenTool className="w-5 h-5" />
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-sm text-gray-500">
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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
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
                
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status da Ocorrência</label>
                    <div className="flex flex-wrap gap-4">
                        {['Parada', 'Em Andamento', 'Concluída'].map((status) => (
                            <label key={status} className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="status" 
                                    value={status} 
                                    checked={signatureStatus === status}
                                    onChange={(e) => setSignatureStatus(e.target.value)}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{status}</span>
                            </label>
                        ))}
                    </div>
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

      {isStatusModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Alterar Status</h3>
                    <button onClick={() => {
                        setIsStatusModalOpen(false);
                        setStatusPhotos([null, null]);
                        setStatusPhotoPreviews([null, null]);
                    }} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Novo Status</label>
                    <select
                        value={tempStatus}
                        onChange={(e) => setTempStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="Pendente">Pendente</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Parada">Parada</option>
                        <option value="Concluída">Concluída</option>
                    </select>
                </div>

                {tempStatus === 'Concluída' && (
                    <div className="mb-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Ação Realizada <span className="text-red-500">*</span></label>
                            <textarea
                                value={actionTaken}
                                onChange={(e) => setActionTaken(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                                placeholder="Descreva a ação tomada para concluir a ocorrência..."
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Evidências da Conclusão (Opcional)</label>
                            <div className="grid grid-cols-2 gap-4">
                                {[0, 1].map((index) => (
                                    <div key={index}>
                                        <input
                                            ref={statusPhotoRefs[index]}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleStatusPhotoChange(index, e.target.files?.[0] || null)}
                                            className="hidden"
                                        />
                                        <div 
                                            onClick={() => statusPhotoRefs[index].current?.click()}
                                            className={`
                                                relative w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden
                                                ${statusPhotos[index] ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                                            `}
                                        >
                                            {statusPhotoPreviews[index] ? (
                                                <div className="relative w-full h-full group">
                                                    <img src={statusPhotoPreviews[index]!} alt={`Evidência ${index + 1}`} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                        <Camera className="w-6 h-6 text-white mb-1" />
                                                        <span className="text-white text-[10px] font-medium">Alterar</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center text-center p-1">
                                                    <Camera className="w-5 h-5 text-gray-400 mb-1" />
                                                    <span className="text-[10px] text-gray-500">Foto {index + 1}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={() => {
                        setIsStatusModalOpen(false);
                        setStatusPhotos([null, null]);
                        setStatusPhotoPreviews([null, null]);
                    }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                    <button onClick={handleUpdateStatus} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Salvar</button>
                </div>
            </div>
        </div>
      )}

      {/* Modal de Detalhes da Ocorrência */}
      {viewOccurrence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setViewOccurrence(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-600" /> Detalhes da Ocorrência
              </h3>
              <button onClick={() => setViewOccurrence(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Informações Principais */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Informações Principais</h4>
                <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                            <p className="text-sm text-gray-500">Título</p>
                            <p className="font-bold text-gray-900">{viewOccurrence.title}</p>
                        </div>
                        <div className="flex items-start gap-6 text-right">
                            <div>
                                <p className="text-sm text-gray-500">Status</p>
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  viewOccurrence.status === 'Concluída' ? 'bg-green-100 text-green-800' : 
                                  viewOccurrence.status === 'Em Andamento' ? 'bg-yellow-100 text-yellow-800' : 
                                  viewOccurrence.status === 'Parada' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {viewOccurrence.status || 'Pendente'}
                                </span>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Data Registro</p>
                                <p className="font-medium text-gray-900">{new Date(viewOccurrence.created_at).toLocaleString('pt-BR')}</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Descrição</p>
                        <p className="text-gray-700 whitespace-pre-wrap text-sm">{viewOccurrence.description}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                        {viewOccurrence.creator?.photo_url ? (
                            <img src={viewOccurrence.creator.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                                <User className="w-4 h-4 text-gray-500" />
                            </div>
                        )}
                        <div>
                            <p className="text-xs text-gray-500">Registrado por</p>
                            <p className="text-sm font-medium">{viewOccurrence.creator?.name || 'Desconhecido'}</p>
                        </div>
                    </div>
                </div>
              </div>

              {/* Veículo (se houver) */}
              {viewOccurrence.vehicle && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Veículo Envolvido</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-2xl font-bold text-gray-900">{viewOccurrence.vehicle.plate}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-white rounded border border-gray-200 text-gray-600">
                      {viewOccurrence.vehicle.color}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{viewOccurrence.vehicle.model}</p>
                  {viewOccurrence.vehicle.company && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {viewOccurrence.vehicle.company}
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>

            {/* Ação Realizada e Conclusão */}
            {viewOccurrence.action_taken && (
              <div className="mt-6 bg-green-50 p-4 rounded-lg border border-green-100">
                <h4 className="text-sm font-bold text-green-800 mb-1">Ação Realizada / Conclusão</h4>
                <p className="text-sm text-green-700 whitespace-pre-wrap">{viewOccurrence.action_taken}</p>
                {viewOccurrence.completed_at && (
                    <p className="text-xs text-green-600 mt-2 text-right">
                        Concluído em: {new Date(viewOccurrence.completed_at).toLocaleString('pt-BR')}
                    </p>
                )}
              </div>
            )}

            {/* Fotos */}
            <div className="mt-8">
              <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-4">Registro Fotográfico</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {viewOccurrence.photos?.map((photo: string, idx: number) => (
                  <div key={`evidence-${idx}`} className="space-y-1">
                    <p className="text-xs text-gray-500">Evidência {idx + 1}</p>
                    <img 
                      src={photo} 
                      alt="Evidência" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setZoomedImage(photo)}
                    />
                  </div>
                ))}
                {viewOccurrence.completion_photos?.map((photo: string, idx: number) => (
                  <div key={`completion-${idx}`} className="space-y-1">
                    <p className="text-xs text-gray-500">Conclusão {idx + 1}</p>
                    <img 
                      src={photo} 
                      alt="Conclusão" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setZoomedImage(photo)}
                    />
                  </div>
                ))}
                {viewOccurrence.signature_url && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Assinatura</p>
                    <div className="w-full h-32 bg-white border border-gray-200 rounded-lg flex items-center justify-center p-2 cursor-pointer hover:border-blue-300" onClick={() => setZoomedImage(viewOccurrence.signature_url)}>
                        <img 
                        src={viewOccurrence.signature_url} 
                        alt="Assinatura" 
                        className="max-w-full max-h-full object-contain"
                        />
                    </div>
                    {viewOccurrence.signature_by && <p className="text-xs text-center text-gray-600">{viewOccurrence.signature_by}</p>}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}