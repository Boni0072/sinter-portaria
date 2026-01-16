import { useState, useEffect, Fragment } from 'react';
import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc,
  getDoc,
  query, 
  orderBy, 
  limit, 
  startAfter, 
  where, 
  documentId,
  QueryDocumentSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Clock, Calendar, Image as ImageIcon, ChevronDown, ChevronRight, X, User, Download } from 'lucide-react';

interface EntryWithDetails {
  id: string;
  entry_time: string;
  exit_time: string | null;
  vehicle_photo_url: string;
  plate_photo_url: string;
  notes: string;
  registered_by_name?: string;
  driver: {
    name: string;
    document: string;
    photo_url?: string;
  };
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    color: string;
  };
}

const ITEMS_PER_PAGE = 10;

export default function EntriesList({ tenantId: propTenantId }: { tenantId?: string }) {
  // Contexto de autenticação
  const { user, userProfile } = useAuth();
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Identifica o ID da empresa (Tenant) para uso em todo o componente
  const tenantId = propTenantId || (userProfile as any)?.tenantId || user?.uid;

  useEffect(() => {
    const fetchTenantName = async () => {
      if (tenantId) {
        try {
          const docRef = doc(db, 'tenants', tenantId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setTenantName(docSnap.data().name || 'Empresa sem nome');
          }
        } catch (error) {
          console.error("Erro ao buscar nome da empresa:", error);
        }
      }
    };
    fetchTenantName();
  }, [tenantId]);

  useEffect(() => {
    if (user) {
      loadEntries(true);
    } else {
      // Limpa os dados e reseta o estado ao fazer logout.
      setEntries([]);
      setLoading(true);
    }
  }, [user, tenantId]);

  const loadEntries = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
        setLastVisible(null); // Garante que a paginação seja resetada
        setHasMore(true);     // em uma nova carga de dados (ex: troca de usuário)
      } else {
        setLoadingMore(true);
      }

      if (!tenantId) return;
      console.log("🔍 [EntriesList] Tenant ID identificado:", tenantId);

      // Busca na subcoleção específica do tenant: tenants/{tenantId}/entries
      let q = query(
        collection(db, 'tenants', tenantId, 'entries'), 
        orderBy('entry_time', 'desc'), 
        limit(ITEMS_PER_PAGE)
      );

      if (!isInitial && lastVisible) {
        q = query(
          collection(db, 'tenants', tenantId, 'entries'), 
          orderBy('entry_time', 'desc'), 
          startAfter(lastVisible), 
          limit(ITEMS_PER_PAGE)
        );
      }

      const querySnapshot = await getDocs(q);
      console.log(`📄 [EntriesList] Registros encontrados em 'tenants/${tenantId}/entries':`, querySnapshot.size);
      
      if (querySnapshot.empty) {
        setHasMore(false);
        if (isInitial) setEntries([]);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      if (querySnapshot.docs.length < ITEMS_PER_PAGE) setHasMore(false);

      // Extrair IDs para busca otimizada
      const entriesRaw = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Buscar IDs de motoristas para obter a foto (mesmo se tiver cache de nome)
      const driverIds = [...new Set(entriesRaw
        .map(e => e.driver_id)
        .filter(Boolean))] as string[];
        
      const vehicleIds = [...new Set(entriesRaw
        .filter(e => !e.cached_data)
        .map(e => e.vehicle_id)
        .filter(Boolean))] as string[];

      const userIds = [...new Set(entriesRaw
        .map(e => e.registered_by)
        .filter(Boolean))] as string[];

      // Função auxiliar para buscar documentos por ID em lotes de 10
      const fetchDocsByIds = async (collectionName: string, ids: string[]) => {
        if (ids.length === 0) return [];
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) {
          chunks.push(ids.slice(i, i + 10));
        }
        const snaps = await Promise.all(chunks.map(chunk => 
          getDocs(query(collection(db, collectionName), where(documentId(), 'in', chunk)))
        ));
        return snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
      };

      const [driversData, vehiclesData, usersData] = await Promise.all([
        fetchDocsByIds(`tenants/${tenantId}/drivers`, driverIds),
        fetchDocsByIds(`tenants/${tenantId}/vehicles`, vehicleIds),
        fetchDocsByIds('profiles', userIds)
      ]);

      const driversMap = new Map(driversData.map((d: any) => [d.id, d]));
      const vehiclesMap = new Map(vehiclesData.map((v: any) => [v.id, v]));
      const usersMap = new Map(usersData.map((u: any) => [u.id, u]));

      const newEntries = entriesRaw.map(entry => {
        const driverData = entry.driver_id ? driversMap.get(entry.driver_id) : null;
        const vehicleData = entry.vehicle_id ? vehiclesMap.get(entry.vehicle_id) : null;
        const userData = entry.registered_by ? usersMap.get(entry.registered_by) : null;

        // Se tiver dados cacheados (novos registros), usa eles e evita busca
        if (entry.cached_data) {
          return {
            ...entry,
            registered_by_name: userData?.name || '---',
            driver: { 
              name: entry.cached_data.driver_name, 
              document: entry.cached_data.driver_document,
              photo_url: entry.cached_data.driver_photo_url || driverData?.photo_url
            },
            vehicle: { 
              plate: entry.cached_data.vehicle_plate, 
              brand: entry.cached_data.vehicle_brand, 
              model: entry.cached_data.vehicle_model, 
              color: entry.cached_data.vehicle_color 
            }
          } as EntryWithDetails;
        }

        // Fallback para registros antigos
        return {
          ...entry,
          registered_by_name: userData?.name || '---',
          driver: driverData || { name: 'Desconhecido', document: '---' },
          vehicle: vehicleData || { plate: '---', brand: '', model: '', color: '' }
        } as EntryWithDetails;
      });

      if (isInitial) {
        setEntries(newEntries);
      } else {
        setEntries(prev => [...prev, ...newEntries]);
      }

    } catch (err: any) {
      console.error('Erro ao carregar registros:', err);
      if (err.code === 'failed-precondition') {
        setError('Índice do Firestore ausente. Verifique o console (F12) e clique no link fornecido pelo Firebase para criar o índice.');
      } else {
        setError('Não foi possível carregar os registros.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const toggleGroup = (date: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const handleRegisterExit = async (entryId: string) => {
    if (!tenantId) return;
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'entries', entryId), {
        exit_time: new Date().toISOString(),
        exit_registered_by: user?.uid,
      });
      
      // Atualiza localmente para evitar recarregar tudo
      setEntries(prev => prev.map(entry => 
        entry.id === entryId 
          ? { ...entry, exit_time: new Date().toISOString() } 
          : entry
      ));
    } catch (err) {
      console.error('Erro ao registrar saída:', err);
      alert("Erro ao registrar saída. Verifique o console.");
    }
  };

  const handleExport = () => {
    if (entries.length === 0) return;

    const csvContent = [
      ['Empresa', 'Placa', 'Marca', 'Modelo', 'Cor', 'Observação', 'Motorista', 'Documento', 'Usuário', 'Entrada', 'Saída'],
      ...entries.map(entry => [
        tenantName,
        entry.vehicle.plate,
        entry.vehicle.brand,
        entry.vehicle.model,
        entry.vehicle.color,
        (entry.notes || '').replace(/"/g, '""'),
        entry.driver.name,
        entry.driver.document,
        entry.registered_by_name || '---',
        formatDateTime(entry.entry_time),
        entry.exit_time ? formatDateTime(entry.exit_time) : 'Em andamento'
      ])
    ]
    .map(e => e.map(field => `"${field}"`).join(','))
    .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registros_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  // Agrupar entradas por data
  const groupedEntries = entries.reduce((acc, entry) => {
    const entryDate = new Date(entry.entry_time);
    const date = entryDate.toLocaleDateString('pt-BR');
    const weekday = entryDate.toLocaleDateString('pt-BR', { weekday: 'long' });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const lastGroup = acc[acc.length - 1];
    
    if (lastGroup && lastGroup.date === date) {
      lastGroup.items.push(entry);
    } else {
      acc.push({ date, weekday: capitalizedWeekday, items: [entry] });
    }
    return acc;
  }, [] as { date: string; weekday: string; items: EntryWithDetails[] }[]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg border border-red-200 max-w-md text-center">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Registros de Entrada e Saída</h2>
        <button
          onClick={handleExport}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">Nenhum registro encontrado</h3>
          <p className="text-gray-500 mt-2">Comece registrando uma entrada</p>
        </div>
      ) : (
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placa</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marca</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cor</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observação</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motorista</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saída</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evidências</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedEntries.map((group) => (
                <Fragment key={group.date}>
                  <tr 
                    className="bg-gray-100 border-y border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleGroup(group.date)}
                  >
                    <td colSpan={12} className="px-6 py-2 text-sm font-bold text-gray-700">
                      <div className="flex items-center">
                        {collapsedGroups.has(group.date) ? (
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
                  {!collapsedGroups.has(group.date) && group.items.map((entry) => (
                <tr key={entry.id} className={!entry.exit_time ? 'bg-green-50/30' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{tenantName}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm font-bold text-gray-900">{entry.vehicle.plate}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{entry.vehicle.brand}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{entry.vehicle.model}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{entry.vehicle.color}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    {entry.notes ? (
                      <span className="text-xs text-gray-500 italic max-w-[150px] truncate block" title={entry.notes}>
                        {entry.notes}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">---</span>
                    )}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="flex items-center">
                      {entry.driver.photo_url ? (
                        <img 
                          src={entry.driver.photo_url} 
                          alt={entry.driver.name} 
                          className="w-8 h-8 rounded-full object-cover mr-3 border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setSelectedImage(entry.driver.photo_url!)}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-3 border border-gray-200">
                          <User className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{entry.driver.name}</span>
                        <span className="text-xs text-gray-500">{entry.driver.document}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{entry.registered_by_name}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="flex items-center text-xs text-gray-900">
                      <Calendar className="w-3 h-3 mr-1.5 text-green-600" />
                      {formatDateTime(entry.entry_time)}
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    {entry.exit_time ? (
                      <div className="flex items-center text-xs text-gray-500">
                        <Calendar className="w-3 h-3 mr-1.5 text-red-600" />
                        {formatDateTime(entry.exit_time)}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">---</span>
                    )}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedImage(entry.vehicle_photo_url)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                        title="Foto Veículo"
                      >
                        <ImageIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setSelectedImage(entry.plate_photo_url)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                        title="Foto Placa"
                      >
                        <div className="relative">
                          <ImageIcon className="w-5 h-5" />
                          <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-gray-100 px-0.5 rounded border border-gray-200">P</span>
                        </div>
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    {!entry.exit_time ? (
                      <button
                        onClick={() => handleRegisterExit(entry.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-sm transition-colors"
                      >
                        <LogOut className="w-3 h-3 mr-1.5" />
                        Saída
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Finalizado
                      </span>
                    )}
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => loadEntries(false)}
            disabled={loadingMore}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
                Carregando...
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                Carregar Mais
              </>
            )}
          </button>
        </div>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="Evidência"
            className="w-full h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200 bg-white rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 z-50 text-white/70 hover:text-white transition-colors p-2 bg-black/20 rounded-full hover:bg-black/40"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
}
