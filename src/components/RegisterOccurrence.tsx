import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, getDoc, setDoc, orderBy, documentId } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Save, Camera, Upload, AlertTriangle, X, Building2, User, ChevronDown, ChevronUp } from 'lucide-react';

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

  const loadOccurrences = async () => {
    if (!currentTenantId) return;
    try {
      const q = query(
        collection(db, 'tenants', currentTenantId, 'occurrences'),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      const occurrencesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Buscar dados dos usuários que criaram as ocorrências
      const userIds = [...new Set(occurrencesList.map((o: any) => o.created_by).filter(Boolean))];
      const usersMap = new Map();

      // Tenta buscar dados dos usuários, mas não falha se não tiver permissão
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
        console.warn("Não foi possível carregar detalhes dos usuários (permissão ou erro):", userErr);
      }

      const enriched = occurrencesList.map((occ: any) => ({
          ...occ,
          creator: usersMap.get(occ.created_by)
      }));

      setOccurrences(enriched);
    } catch (error) {
      console.error("Erro ao carregar ocorrências:", error);
    }
  };

  useEffect(() => {
    loadOccurrences();
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
        photos: validPhotoUrls,
        created_by: user?.uid,
        created_at: new Date().toISOString()
      });

      setTitle('');
      setDescription('');
      setPhotos([null, null, null]);
      setPhotoPreviews([null, null, null]);
      if (photoRefs[0].current) photoRefs[0].current.value = '';
      if (photoRefs[1].current) photoRefs[1].current.value = '';
      if (photoRefs[2].current) photoRefs[2].current.value = '';
      
      await loadOccurrences();
      // onSuccess(); // Removido para manter o usuário na tela e ver a lista atualizada
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar ocorrência');
    } finally {
      setLoading(false);
    }
  };

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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {occurrences.map((occ) => (
                <tr key={occ.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {tenants.find(t => t.id === currentTenantId)?.name || '---'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(occ.created_at).toLocaleDateString('pt-BR')} {new Date(occ.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                </tr>
              ))}
              {occurrences.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
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