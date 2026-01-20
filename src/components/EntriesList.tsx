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
  onSnapshot,
  where, 
  documentId,
  QueryDocumentSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Clock, Calendar, Image as ImageIcon, ChevronDown, ChevronRight, X, User, Download, Building2, ChevronsDown, ChevronsUp, Search, MapPin } from 'lucide-react';

interface EntryWithDetails {
  id: string;
  entry_time: string;
  exit_time: string | null;
  vehicle_photo_url: string;
  plate_photo_url: string;
  notes: string;
  registered_by_name?: string;
  tenant_name?: string;
  tenant_address?: string;
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
  location?: { lat: number, lng: number };
}

const ITEMS_PER_PAGE = 10;

export default function EntriesList({ tenantId: propTenantId }: { tenantId?: string }) {
  // Contexto de autenticação
  const { user, userProfile } = useAuth();
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [limitCount, setLimitCount] = useState(ITEMS_PER_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([new Date().toLocaleDateString('pt-BR')]));
  const [searchTerm, setSearchTerm] = useState('');
  
  const [tenants, setTenants] = useState<{id: string, name: string, address?: string}[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [entriesPerTenant, setEntriesPerTenant] = useState<Record<string, EntryWithDetails[]>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  useEffect(() => {
    const initTenants = async () => {
      if (!user?.uid) return;
      
      try {
        const allowedTenants = (userProfile as any)?.allowedTenants;
        let list: {id: string, name: string, address?: string}[] = [];

        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => getDoc(doc(db, 'tenants', id)));
          const docs = await Promise.all(promises);
          list = docs.filter(d => d.exists()).map(d => ({ 
            id: d.id, 
            name: d.data()?.name || 'Empresa sem nome',
            address: d.data()?.address 
          }));
        } else {
          const q = query(collection(db, 'tenants'), where('created_by', '==', user.uid));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            list = snapshot.docs.map(doc => ({ 
              id: doc.id, 
              name: doc.data().name || 'Empresa sem nome',
              address: doc.data().address 
            }));
          }
        }

        if (list.length === 0 && (userProfile as any)?.tenantId) {
           const tId = (userProfile as any).tenantId;
           const docSnap = await getDoc(doc(db, 'tenants', tId));
           if (docSnap.exists()) {
             list.push({ 
               id: docSnap.id, 
               name: docSnap.data().name || 'Minha Empresa',
               address: docSnap.data().address 
             });
           }
        }

        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        setTenants(list);

        // Default selection logic
        if (list.length > 1) {
            setSelectedTenantId('all');
        } else if (propTenantId) {
            setSelectedTenantId(propTenantId);
        } else if (list.length > 0) {
            setSelectedTenantId(list[0].id);
        }
      } catch (error) {
        console.error("Erro ao buscar empresas:", error);
      }
    };
    
    initTenants();
  }, [user, userProfile, propTenantId]);

  // Reset entries map when filter changes
  useEffect(() => setEntriesPerTenant({}), [selectedTenantId]);

  useEffect(() => {
    if (!user) {
      // Limpa os dados e reseta o estado ao fazer logout.
      setEntries([]);
      setLoading(true);
      setHasMore(true);
      setLimitCount(ITEMS_PER_PAGE);
    }
    // A busca de dados é tratada pelo useEffect que reage à mudança de tenantId.
  }, [user]);

  useEffect(() => {
    let unsubscribes: (() => void)[] = [];

    const fetchEntries = async () => {
      if (!selectedTenantId && tenants.length === 0) return;
      
      const targetIds = selectedTenantId === 'all' ? tenants.map(t => t.id) : [selectedTenantId || tenants[0]?.id].filter(Boolean);
      
      if (targetIds.length === 0) return;
      
      // Se for a primeira carga (limitCount == ITEMS_PER_PAGE), mostra loading principal
      if (limitCount === ITEMS_PER_PAGE) setLoading(true);
      else setLoadingMore(true);

      unsubscribes = targetIds.map(tid => {
        const q = query(
          collection(db, 'tenants', tid, 'entries'), 
          orderBy('entry_time', 'desc'), 
          limit(limitCount)
        );

        return onSnapshot(q, async (querySnapshot) => {
        try {
          if (querySnapshot.empty) {
            setEntriesPerTenant(prev => ({ ...prev, [tid]: [] }));
            return;
          }

          const tenantName = tenants.find(t => t.id === tid)?.name || 'Empresa';
          const tenantAddress = tenants.find(t => t.id === tid)?.address || '';
          // Extrair IDs para busca otimizada
          const entriesRaw = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
          
          // Buscar IDs de motoristas para obter a foto (mesmo se tiver cache de nome)
          const driverIds = [...new Set(entriesRaw.map(e => e.driver_id).filter(Boolean))] as string[];
          const vehicleIds = [...new Set(entriesRaw.filter(e => !e.cached_data).map(e => e.vehicle_id).filter(Boolean))] as string[];
          const userIds = [...new Set(entriesRaw.map(e => e.registered_by).filter(Boolean))] as string[];

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
            fetchDocsByIds(`tenants/${tid}/drivers`, driverIds),
            fetchDocsByIds(`tenants/${tid}/vehicles`, vehicleIds),
            fetchDocsByIds('profiles', userIds)
          ]);

          const driversMap = new Map(driversData.map((d: any) => [d.id, d]));
          const vehiclesMap = new Map(vehiclesData.map((v: any) => [v.id, v]));
          const usersMap = new Map(usersData.map((u: any) => [u.id, u]));

          const newEntries = entriesRaw.map(entry => {
            const driverData = entry.driver_id ? driversMap.get(entry.driver_id) : null;
            const vehicleData = entry.vehicle_id ? vehiclesMap.get(entry.vehicle_id) : null;
            const userData = entry.registered_by ? usersMap.get(entry.registered_by) : null;

            if (entry.cached_data) {
              return {
                ...entry,
                registered_by_name: userData?.name || '---',
                tenant_name: tenantName,
                tenant_address: tenantAddress,
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

            return {
              ...entry,
              registered_by_name: userData?.name || '---',
              tenant_name: tenantName,
              tenant_address: tenantAddress,
              driver: driverData || { name: 'Desconhecido', document: '---' },
              vehicle: vehicleData || { plate: '---', brand: '', model: '', color: '' }
            } as EntryWithDetails;
          });

          setEntriesPerTenant(prev => ({ ...prev, [tid]: newEntries }));
        } catch (err: any) {
          console.error('Erro ao processar snapshot:', err);
        }
      }, (err) => {
        console.error("Erro no listener de entradas:", err);
      });
      });
    };

    fetchEntries();

    return () => {
      unsubscribes.forEach(u => u());
    };
  }, [selectedTenantId, limitCount, tenants]);

  // Combine and sort entries from all tenants
  useEffect(() => {
    let all = Object.values(entriesPerTenant).flat().sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
    
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      all = all.filter(e => (e.vehicle?.plate || '').toLowerCase().includes(lower));
    }

    setEntries(all);
    
    // Simple heuristic for hasMore: if we have at least limitCount items, assume there might be more.
    // For exact pagination with multiple streams, it's complex, but this works for "Load More".
    if (all.length > 0) {
        setHasMore(true);
    }
    
    setLoading(false);
    setLoadingMore(false);
  }, [entriesPerTenant, searchTerm]);

  // Efeito para buscar endereços via geolocalização (Geocodificação Reversa)
  useEffect(() => {
    const fetchAddresses = async () => {
      const entriesToFetch = entries.filter(e => e.location && !addresses[e.id]);
      
      for (const entry of entriesToFetch) {
        if (!entry.location) continue;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${entry.location.lat}&lon=${entry.location.lng}&addressdetails=1`);
          const data = await res.json();
          if (data.address) {
            const road = data.address.road || data.address.street || data.address.pedestrian || '';
            const number = data.address.house_number || '';
            const city = data.address.city || data.address.town || data.address.village || '';
            const summary = [road, number].filter(Boolean).join(', ') + (city ? ` - ${city}` : '');
            setAddresses(prev => ({ ...prev, [entry.id]: summary }));
          } else if (data.display_name) {
            const summary = data.display_name.split(',').slice(0, 3).join(',');
            setAddresses(prev => ({ ...prev, [entry.id]: summary }));
          }
          // Pequeno delay para respeitar limites da API (1 req/s)
          await new Promise(r => setTimeout(r, 1100));
        } catch (e) {
          console.error("Erro ao buscar endereço:", e);
        }
      }
    };
    if (entries.length > 0) fetchAddresses();
  }, [entries]);

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

  const handleRegisterExit = async (entryId: string, entryTenantId?: string) => {
    const tid = entryTenantId || selectedTenantId;
    try {
      await updateDoc(doc(db, 'tenants', tid, 'entries', entryId), {
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
      ['Empresa', 'Placa', 'Marca', 'Modelo', 'Cor', 'Observação', 'Motorista', 'Documento', 'Usuário', 'Entrada', 'Saída', 'Local', 'Endereço'],
      ...entries.map(entry => [
        entry.tenant_name || '---',
        entry.vehicle.plate,
        entry.vehicle.brand,
        entry.vehicle.model,
        entry.vehicle.color,
        (entry.notes || '').replace(/"/g, '""'),
        entry.driver.name,
        entry.driver.document,
        entry.registered_by_name || '---',
        formatDateTime(entry.entry_time),
        entry.exit_time ? formatDateTime(entry.exit_time) : 'Em andamento',
        entry.location ? `https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}` : '',
        addresses[entry.id] || '---'
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

  const expandAll = () => {
    const allDates = new Set(groupedEntries.map(g => g.date));
    setExpandedGroups(allDates);
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

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
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-800">Registros de Entrada e Saída</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{entries.length}</span>
        </div>
        
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

        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                type="text"
                placeholder="Buscar placa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-40"
            />
        </div>

        {tenants.length > 1 && (
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Building2 className="w-4 h-4 text-gray-500 mr-2" />
              <select 
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer outline-none min-w-[150px]"
              >
                <option value="all">Todas as Empresas</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
        )}

        <button
          onClick={handleExport}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
        </div>
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização (Endereço)</th>
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
                  {expandedGroups.has(group.date) && group.items.map((entry) => (
                <tr key={entry.id} className={!entry.exit_time ? 'bg-green-50/30' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{entry.tenant_name}</span>
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
                    {entry.location ? (
                      <a 
                        href={`https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-full transition-colors inline-flex items-center"
                        title="Ver no Mapa"
                      >
                        <MapPin className="w-4 h-4" />
                      </a>
                    ) : <span className="text-xs text-gray-400">---</span>}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap max-w-[200px]">
                    <span className="text-xs text-gray-500 truncate block" title={addresses[entry.id] || (entry.location ? 'Carregando endereço...' : 'Sem localização')}>
                      {addresses[entry.id] 
                        ? addresses[entry.id] 
                        : (entry.location ? <span className="animate-pulse">Buscando endereço...</span> : '---')}
                    </span>
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
                        onClick={() => handleRegisterExit(entry.id, tenants.find(t => t.name === entry.tenant_name)?.id)}
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
            onClick={() => setLimitCount(prev => prev + ITEMS_PER_PAGE)}
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
