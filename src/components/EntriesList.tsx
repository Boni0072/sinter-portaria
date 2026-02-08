import { useState, useEffect, Fragment, useRef } from 'react';
import { auth } from './firebase';
import { getDatabase, ref, get, update, remove, onValue, query, orderByChild, limitToLast, equalTo, startAt, endAt } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Clock, Calendar, Image as ImageIcon, ChevronDown, ChevronRight, X, User, Download, Building2, ChevronsDown, ChevronsUp, Search, MapPin, Scale, Camera, Save, Upload, FileText, Trash2, Filter } from 'lucide-react';

interface EntryWithDetails {
  id: string;
  entry_time: string;
  exit_time: string | null;
  vehicle_photo_url: string;
  plate_photo_url: string;
  tenantId: string; // Adicionado para referência
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
    company?: string;
  };
  location?: { lat: number, lng: number };
  entry_weight?: string;
  exit_weight?: string;
  material_code?: string;
  material_quantity?: string;
  invoice_number?: string;
  entry_weight_photos?: string[];
  exit_material_code?: string;
  exit_material_quantity?: string;
  exit_invoice_number?: string;
  exit_weight_photos?: string[];
  exit_observation?: string;
  exit_invoice_photo_url?: string;
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
  const [viewEntry, setViewEntry] = useState<EntryWithDetails | null>(null);
  const [dateRange, setDateRange] = useState('recent');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Estados para o Modal de Pesagem
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [weightEntry, setWeightEntry] = useState<EntryWithDetails | null>(null);
  const [weightForm, setWeightForm] = useState({
    weight: '',
    materialCode: '',
    quantity: '',
    invoiceNumber: ''
  });
  const [weightPhotos, setWeightPhotos] = useState<(File | null)[]>([null, null]);
  const [weightPhotoPreviews, setWeightPhotoPreviews] = useState<(string | null)[]>([null, null]);
  const weightPhotoRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // Estados para o Modal de Pesagem de Saída
  const [isExitWeightModalOpen, setIsExitWeightModalOpen] = useState(false);
  const [exitWeightEntry, setExitWeightEntry] = useState<EntryWithDetails | null>(null);
  const [exitWeightForm, setExitWeightForm] = useState({
    weight: '',
    materialCode: '',
    quantity: '',
    invoiceNumber: '',
    observation: ''
  });
  const [exitWeightPhotos, setExitWeightPhotos] = useState<(File | null)[]>([null, null]);
  const [exitWeightPhotoPreviews, setExitWeightPhotoPreviews] = useState<(string | null)[]>([null, null]);
  const exitWeightPhotoRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [exitInvoicePhoto, setExitInvoicePhoto] = useState<File | null>(null);
  const [exitInvoicePhotoPreview, setExitInvoicePhotoPreview] = useState<string | null>(null);
  const exitInvoicePhotoRef = useRef<HTMLInputElement>(null);

  // Estados para o Modal de Saída (Confirmação)
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [exitEntry, setExitEntry] = useState<EntryWithDetails | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  
  const [tenants, setTenants] = useState<{id: string, name: string, address?: string}[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [entriesPerTenant, setEntriesPerTenant] = useState<Record<string, EntryWithDetails[]>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const database = getDatabase(auth.app);

  useEffect(() => {
    const initTenants = async () => {
      if (!user?.uid) return;
      
      try {
        const allowedTenants = (userProfile as any)?.allowedTenants;
        let list: {id: string, name: string, address?: string}[] = [];

        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => get(ref(database, `tenants/${id}`)));
          const snapshots = await Promise.all(promises);
          snapshots.forEach((snap, index) => {
            if (snap.exists()) {
              list.push({
                id: allowedTenants[index],
                name: snap.val().name || 'Empresa sem nome',
                address: snap.val().address
              });
            }
          });
        } else if (userProfile?.role === 'admin') {
           // Se for admin, busca todas as empresas que ele é dono
          const q = query(ref(database, 'tenants'), orderByChild('owner_id'), equalTo(user.uid));
          const snapshot = await get(q);
          if (snapshot.exists()) {
            snapshot.forEach(child => {
              list.push({
                id: child.key!,
                name: child.val().name || 'Empresa sem nome',
                address: child.val().address
              });
            });
          }
        } else {
          // Lógica hierárquica para não-admins
          const myTenantId = (userProfile as any)?.tenantId || user.uid;
          
          // 1. Busca a própria empresa
          const myTenantSnap = await get(ref(database, `tenants/${myTenantId}`));
          if (myTenantSnap.exists()) {
             list.push({
               id: myTenantSnap.key!,
               name: myTenantSnap.val().name || 'Minha Empresa',
               address: myTenantSnap.val().address
             });
          }

          // 2. Busca filiais
          const q = query(ref(database, 'tenants'), orderByChild('parentId'), equalTo(myTenantId));
          const snapshot = await get(q);
          if (snapshot.exists()) {
            snapshot.forEach(child => {
              list.push({
                id: child.key!,
                name: child.val().name || 'Empresa sem nome',
                address: child.val().address
              });
            });
          }
        }

        if (list.length === 0 && (userProfile as any)?.tenantId) {
           const tId = (userProfile as any).tenantId;
           const snap = await get(ref(database, `tenants/${tId}`));
           if (snap.exists()) {
             list.push({ 
               id: snap.key!, 
               name: snap.val().name || 'Minha Empresa',
               address: snap.val().address 
             });
           }
        }

        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        setTenants(list);

        // Default selection logic
        if (propTenantId) {
            setSelectedTenantId(propTenantId);
        } else if (list.length > 1) {
            setSelectedTenantId('all');
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
  useEffect(() => {
    setEntriesPerTenant({});
    setEntries([]);
  }, [selectedTenantId, dateRange, customStart, customEnd]);

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
        let q;
        
        if (dateRange === 'recent') {
            q = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), limitToLast(limitCount));
        } else {
            let startStr = '', endStr = '';
            const now = new Date();
            
            if (dateRange === 'today') {
                const start = new Date(now.setHours(0,0,0,0));
                const end = new Date(now.setHours(23,59,59,999));
                startStr = start.toISOString();
                endStr = end.toISOString();
            } else if (dateRange === 'yesterday') {
                const start = new Date(now.setDate(now.getDate() - 1));
                start.setHours(0,0,0,0);
                const end = new Date(start);
                end.setHours(23,59,59,999);
                startStr = start.toISOString();
                endStr = end.toISOString();
            } else if (dateRange === 'thisMonth') {
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                startStr = start.toISOString();
                endStr = end.toISOString();
            } else if (dateRange === 'custom' && customStart && customEnd) {
                startStr = new Date(customStart + 'T00:00:00').toISOString();
                endStr = new Date(customEnd + 'T23:59:59').toISOString();
            }

            if (startStr && endStr) {
                q = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), startAt(startStr), endAt(endStr));
            } else {
                // Fallback se datas inválidas
                q = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), limitToLast(limitCount));
            }
        }

        return onValue(q, async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            setEntriesPerTenant(prev => ({ ...prev, [tid]: [] }));
            return;
          }

          const tenantName = tenants.find(t => t.id === tid)?.name || 'Empresa';
          const tenantAddress = tenants.find(t => t.id === tid)?.address || '';
          
          const entriesRaw: any[] = [];
          snapshot.forEach(child => {
            entriesRaw.push({ id: child.key!, ...child.val() });
          });
          // Reverter para mostrar do mais novo para o mais antigo
          entriesRaw.reverse();
          
          // Buscar IDs de motoristas para obter a foto (mesmo se tiver cache de nome)
          const driverIds = [...new Set(entriesRaw.map(e => e.driver_id).filter(Boolean))] as string[];
          const vehicleIds = [...new Set(entriesRaw.map(e => e.vehicle_id).filter(Boolean))] as string[];
          const userIds = [...new Set(entriesRaw.map(e => e.registered_by).filter(Boolean))] as string[];

          // Função auxiliar para buscar dados relacionados
          const fetchDocsByIds = async (pathPrefix: string, ids: string[]) => {
            if (ids.length === 0) return [];
            const promises = ids.map(id => get(ref(database, `${pathPrefix}/${id}`)));
            const snaps = await Promise.all(promises);
            return snaps.filter(s => s.exists()).map(s => ({ id: s.key, ...s.val() }));
          };

          const [driversData, vehiclesData, usersData] = await Promise.all([
            fetchDocsByIds(`tenants/${tid}/drivers`, driverIds), // Motoristas por tenant
            fetchDocsByIds(`tenants/${tid}/vehicles`, vehicleIds),
            fetchDocsByIds('profiles', userIds)
          ]);

          const driversMap = new Map(driversData.map((d: any) => [d.id!, d]));
          const vehiclesMap = new Map(vehiclesData.map((v: any) => [v.id!, v]));
          const usersMap = new Map(usersData.map((u: any) => [u.id!, u]));

          const newEntries = entriesRaw.map(entry => {
            const driverData = entry.driver_id ? driversMap.get(entry.driver_id) : null;
            const vehicleData = entry.vehicle_id ? vehiclesMap.get(entry.vehicle_id) : null;
            const userData = entry.registered_by ? usersMap.get(entry.registered_by) : null;

            if (entry.cached_data) {
              return {
                ...entry,
                tenantId: tid,
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
                  color: entry.cached_data.vehicle_color,
                  company: vehicleData?.company || entry.cached_data.vehicle_company
                }
              } as EntryWithDetails;
            }

            return {
              ...entry,
              tenantId: tid,
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
      });
    });
  };

    fetchEntries();

    return () => {
      unsubscribes.forEach(u => u());
    };
  }, [selectedTenantId, limitCount, tenants, dateRange, customStart, customEnd]);

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
      await update(ref(database, `tenants/${tid}/entries/${entryId}`), {
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

  const handleDelete = async (entry: EntryWithDetails) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro permanentemente?')) return;
    try {
      await remove(ref(database, `tenants/${entry.tenantId}/entries/${entry.id}`));
    } catch (err) {
      console.error("Erro ao excluir:", err);
      alert("Erro ao excluir registro.");
    }
  };

  const handleExport = () => {
    if (entries.length === 0) return;

    const csvContent = [
      ['Empresa', 'Placa', 'Marca', 'Modelo', 'Cor', 'Observação', 'Motorista', 'Documento', 'Usuário', 'Entrada', 'Pesagem Entrada', 'Cód. Material', 'Qtd.', 'Nota Fiscal', 'Saída', 'Pesagem Saída', 'Local', 'Endereço'],
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
        entry.entry_weight || '',
        entry.material_code || '',
        entry.material_quantity || '',
        entry.invoice_number || '',
        entry.exit_time ? formatDateTime(entry.exit_time) : 'Em andamento',
        entry.exit_weight || '',
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
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
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

  const handleOpenWeightModal = (entry: EntryWithDetails) => {
    setWeightEntry(entry);
    setWeightForm({
      weight: entry.entry_weight || '',
      materialCode: entry.material_code || '',
      quantity: entry.material_quantity || '',
      invoiceNumber: entry.invoice_number || ''
    });
    setWeightPhotos([null, null]);
    setWeightPhotoPreviews([entry.entry_weight_photos?.[0] || null, entry.entry_weight_photos?.[1] || null]);
    setIsWeightModalOpen(true);
  };

  const handleWeightPhotoChange = (index: number, file: File | null) => {
    const newPhotos = [...weightPhotos];
    newPhotos[index] = file;
    setWeightPhotos(newPhotos);

    const newPreviews = [...weightPhotoPreviews];
    if (file) {
      newPreviews[index] = URL.createObjectURL(file);
    } else {
      newPreviews[index] = null;
    }
    setWeightPhotoPreviews(newPreviews);
  };

  const handleSaveWeight = async () => {
    if (!weightEntry) return;
    setLoading(true);
    try {
      const photoPromises = weightPhotos.map(photo => photo ? convertFileToBase64(photo) : Promise.resolve(null));
      const newPhotoUrls = await Promise.all(photoPromises);
      
      // Mescla fotos novas com as existentes se não houver nova
      const finalPhotos = [
        newPhotoUrls[0] || weightEntry.entry_weight_photos?.[0] || null,
        newPhotoUrls[1] || weightEntry.entry_weight_photos?.[1] || null
      ].filter(Boolean) as string[];

      await update(ref(database, `tenants/${weightEntry.tenantId}/entries/${weightEntry.id}`), {
        entry_weight: weightForm.weight,
        material_code: weightForm.materialCode,
        material_quantity: weightForm.quantity,
        invoice_number: weightForm.invoiceNumber,
        entry_weight_photos: finalPhotos,
        entry_weight_time: new Date().toISOString()
      });
      setIsWeightModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar pesagem:", err);
      alert("Erro ao salvar dados de pesagem.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenExitWeightModal = (entry: EntryWithDetails) => {
    setExitWeightEntry(entry);
    setExitWeightForm({
      weight: entry.exit_weight || '',
      materialCode: entry.exit_material_code || '',
      quantity: entry.exit_material_quantity || '',
      invoiceNumber: entry.exit_invoice_number || '',
      observation: entry.exit_observation || ''
    });
    setExitWeightPhotos([null, null]);
    setExitWeightPhotoPreviews([entry.exit_weight_photos?.[0] || null, entry.exit_weight_photos?.[1] || null]);
    setIsExitWeightModalOpen(true);
  };

  const handleExitWeightPhotoChange = (index: number, file: File | null) => {
    const newPhotos = [...exitWeightPhotos];
    newPhotos[index] = file;
    setExitWeightPhotos(newPhotos);

    const newPreviews = [...exitWeightPhotoPreviews];
    if (file) {
      newPreviews[index] = URL.createObjectURL(file);
    } else {
      newPreviews[index] = null;
    }
    setExitWeightPhotoPreviews(newPreviews);
  };

  const handleSaveExitWeight = async () => {
    if (!exitWeightEntry) return;
    setLoading(true);
    try {
      const photoPromises = exitWeightPhotos.map(photo => photo ? convertFileToBase64(photo) : Promise.resolve(null));
      const newPhotoUrls = await Promise.all(photoPromises);
      
      // Mescla fotos novas com as existentes se não houver nova
      const finalPhotos = [
        newPhotoUrls[0] || exitWeightEntry.exit_weight_photos?.[0] || null,
        newPhotoUrls[1] || exitWeightEntry.exit_weight_photos?.[1] || null
      ].filter(Boolean) as string[];

      await update(ref(database, `tenants/${exitWeightEntry.tenantId}/entries/${exitWeightEntry.id}`), {
        exit_weight: exitWeightForm.weight,
        exit_material_code: exitWeightForm.materialCode,
        exit_material_quantity: exitWeightForm.quantity,
        exit_invoice_number: exitWeightForm.invoiceNumber,
        exit_weight_photos: finalPhotos,
        exit_weight_time: new Date().toISOString()
      });
      setIsExitWeightModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar pesagem de saída:", err);
      alert("Erro ao salvar dados de pesagem de saída.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenExitModal = (entry: EntryWithDetails) => {
    setExitEntry(entry);
    setExitWeightForm({
      weight: entry.exit_weight || '',
      materialCode: entry.exit_material_code || '',
      quantity: entry.exit_material_quantity || '',
      invoiceNumber: entry.exit_invoice_number || ''
    });
    setExitWeightPhotos([null, null]);
    setExitWeightPhotoPreviews([entry.exit_weight_photos?.[0] || null, entry.exit_weight_photos?.[1] || null]);
    setExitInvoicePhoto(null);
    setExitInvoicePhotoPreview(entry.exit_invoice_photo_url || null);
    setIsExitModalOpen(true);
  };

  const handleConfirmExit = async () => {
    if (!exitEntry) return;
    setIsExiting(true);
    try {
        const photoPromises = exitWeightPhotos.map(photo => photo ? convertFileToBase64(photo) : Promise.resolve(null));
        const invoicePhotoPromise = exitInvoicePhoto ? convertFileToBase64(exitInvoicePhoto) : Promise.resolve(null);

        const [newPhotoUrls, newInvoicePhotoUrl] = await Promise.all([
            Promise.all(photoPromises),
            invoicePhotoPromise
        ]);
        
        const finalPhotos = [
            newPhotoUrls[0] || exitEntry.exit_weight_photos?.[0] || null,
            newPhotoUrls[1] || exitEntry.exit_weight_photos?.[1] || null
        ].filter(Boolean) as string[];
        const finalInvoicePhotoUrl = newInvoicePhotoUrl || exitEntry.exit_invoice_photo_url || null;

        await update(ref(database, `tenants/${exitEntry.tenantId}/entries/${exitEntry.id}`), {
            exit_time: new Date().toISOString(),
            exit_registered_by: user?.uid,
            exit_weight: exitWeightForm.weight,
            exit_material_code: exitWeightForm.materialCode,
            exit_material_quantity: exitWeightForm.quantity,
            exit_invoice_number: exitWeightForm.invoiceNumber,
            exit_weight_photos: finalPhotos,
            exit_invoice_photo_url: finalInvoicePhotoUrl,
            exit_observation: exitWeightForm.observation,
            exit_weight_time: new Date().toISOString()
        });
    } catch (err) {
        console.error("Erro ao registrar saída:", err);
        alert("Erro ao registrar saída.");
    }
    setIsExiting(false);
    setIsExitModalOpen(false);
    setExitEntry(null);
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

        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Filter className="w-4 h-4 text-gray-500 mr-2" />
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer outline-none"
            >
              <option value="recent">Recentes (Últimos {limitCount})</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="thisMonth">Este Mês</option>
              <option value="custom">Personalizado</option>
            </select>
        </div>

        {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                <span>-</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observação</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motorista</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pesagem Ent.</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pesagem Sai.</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
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
                  {expandedGroups.has(group.date) && group.items.map((entry) => (
                <tr 
                  key={entry.id} 
                  className={`${!entry.exit_time ? 'bg-green-50/30' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                  onClick={() => setViewEntry(entry)}
                >
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{entry.tenant_name}</span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <span className="text-sm font-bold text-gray-900">{entry.vehicle.plate}</span>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(entry.driver.photo_url!);
                          }}
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
                  <td className="px-6 py-2 whitespace-nowrap text-xs text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{entry.entry_weight ? `${entry.entry_weight} kg` : '---'}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenWeightModal(entry);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Registrar Pesagem e Material"
                      >
                        <Scale className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-xs text-gray-500 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{entry.exit_weight ? `${entry.exit_weight} kg` : '---'}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenExitWeightModal(entry);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Registrar Pesagem de Saída e Material"
                      >
                        <Scale className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-center">
                    {entry.location ? (
                      <a 
                        href={`https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-full transition-colors inline-flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        title="Ver no Mapa"
                      >
                        <MapPin className="w-5 h-5" />
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
                    <div className="flex space-x-2 items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(entry.vehicle_photo_url);
                        }}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                        title="Foto Veículo"
                      >
                        <ImageIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(entry.plate_photo_url);
                        }}
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
                    <div className="flex items-center gap-2">
                    {!entry.exit_time ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenExitModal(entry);
                        }}
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
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                        title="Excluir Registro"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
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

      {hasMore && dateRange === 'recent' && (
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
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

      {/* Modal de Pesagem de Entrada */}
      {isWeightModalOpen && weightEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" /> Registro de Pesagem e Material
              </h3>
              <button onClick={() => setIsWeightModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                 <span className="text-sm text-blue-800 font-medium">Hora do Registro:</span>
                 <span className="text-sm font-bold text-blue-900">{new Date().toLocaleTimeString('pt-BR')}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Peso Entrada (kg)</label>
                  <input 
                    type="number" 
                    value={weightForm.weight}
                    onChange={e => setWeightForm({...weightForm, weight: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cód. Material</label>
                  <input 
                    type="text" 
                    value={weightForm.materialCode}
                    onChange={e => setWeightForm({...weightForm, materialCode: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantidade</label>
                  <input 
                    type="text" 
                    value={weightForm.quantity}
                    onChange={e => setWeightForm({...weightForm, quantity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nº Nota/Pedido</label>
                  <input 
                    type="text" 
                    value={weightForm.invoiceNumber}
                    onChange={e => setWeightForm({...weightForm, invoiceNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Evidências (Fotos)</label>
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((index) => (
                    <div key={index} 
                      onClick={() => weightPhotoRefs[index].current?.click()}
                      className={`relative h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden ${weightPhotoPreviews[index] ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}
                    >
                      <input
                        ref={weightPhotoRefs[index]}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleWeightPhotoChange(index, e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {weightPhotoPreviews[index] ? (
                        <img src={weightPhotoPreviews[index]!} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        <Camera className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleSaveWeight} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"><Save className="w-4 h-4" /> Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pesagem de Saída */}
      {isExitWeightModalOpen && exitWeightEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-600" /> Registro de Pesagem de Saída
              </h3>
              <button onClick={() => setIsExitWeightModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                 <span className="text-sm text-blue-800 font-medium">Hora do Registro:</span>
                 <span className="text-sm font-bold text-blue-900">{new Date().toLocaleTimeString('pt-BR')}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Peso Saída (kg)</label>
                  <input 
                    type="number" 
                    value={exitWeightForm.weight}
                    onChange={e => setExitWeightForm({...exitWeightForm, weight: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cód. Material</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.materialCode}
                    onChange={e => setExitWeightForm({...exitWeightForm, materialCode: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantidade</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.quantity}
                    onChange={e => setExitWeightForm({...exitWeightForm, quantity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nº Nota/Pedido</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.invoiceNumber}
                    onChange={e => setExitWeightForm({...exitWeightForm, invoiceNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Evidências (Fotos)</label>
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((index) => (
                    <div key={index} 
                      onClick={() => exitWeightPhotoRefs[index].current?.click()}
                      className={`relative h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden ${exitWeightPhotoPreviews[index] ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}
                    >
                      <input
                        ref={exitWeightPhotoRefs[index]}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleExitWeightPhotoChange(index, e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {exitWeightPhotoPreviews[index] ? (
                        <img src={exitWeightPhotoPreviews[index]!} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        <Camera className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleSaveExitWeight} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"><Save className="w-4 h-4" /> Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Saída */}
      {isExitModalOpen && exitEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <LogOut className="w-5 h-5 text-red-600" /> Registrar Saída
              </h3>
              <button onClick={() => setIsExitModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex justify-between items-center">
                 <span className="text-sm text-red-800 font-medium">Veículo: {exitEntry.vehicle.plate}</span>
                 <span className="text-sm font-bold text-red-900">{new Date().toLocaleTimeString('pt-BR')}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Peso Saída (kg)</label>
                  <input 
                    type="number" 
                    value={exitWeightForm.weight}
                    onChange={e => setExitWeightForm({...exitWeightForm, weight: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cód. Material</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.materialCode}
                    onChange={e => setExitWeightForm({...exitWeightForm, materialCode: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantidade</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.quantity}
                    onChange={e => setExitWeightForm({...exitWeightForm, quantity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nº Nota/Pedido</label>
                  <input 
                    type="text" 
                    value={exitWeightForm.invoiceNumber}
                    onChange={e => setExitWeightForm({...exitWeightForm, invoiceNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Evidências (Fotos)</label>
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((index) => (
                    <div key={index} 
                      onClick={() => exitWeightPhotoRefs[index].current?.click()}
                      className={`relative h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden ${exitWeightPhotoPreviews[index] ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}
                    >
                      <input
                        ref={exitWeightPhotoRefs[index]}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleExitWeightPhotoChange(index, e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {exitWeightPhotoPreviews[index] ? (
                        <img src={exitWeightPhotoPreviews[index]!} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        <Camera className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Foto da Nota Fiscal</label>
                <input
                  ref={exitInvoicePhotoRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        setExitInvoicePhoto(file);
                        setExitInvoicePhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="hidden"
                />
                <div 
                  onClick={() => exitInvoicePhotoRef.current?.click()}
                  className={`relative h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden ${exitInvoicePhotoPreview ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}
                >
                  {exitInvoicePhotoPreview ? (
                    <img src={exitInvoicePhotoPreview} className="w-full h-full object-cover" alt="Nota Fiscal" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                        <FileText className="w-6 h-6 mb-1" />
                        <span className="text-xs">Adicionar Foto</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Observação</label>
                <textarea 
                  value={exitWeightForm.observation}
                  onChange={e => setExitWeightForm({...exitWeightForm, observation: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none h-20"
                  placeholder="Observações sobre a saída..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setIsExitModalOpen(false)} 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmExit} 
                disabled={isExiting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isExiting ? 'Registrando...' : 'Confirmar Saída'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Registro */}
      {viewEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setViewEntry(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" /> Detalhes do Registro
                </h3>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" />{viewEntry.tenant_name}</p>
              </div>
              <button onClick={() => setViewEntry(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Motorista */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Motorista</h4>
                <div className="flex items-center gap-4">
                  {viewEntry.driver.photo_url ? (
                    <img 
                      src={viewEntry.driver.photo_url} 
                      alt={viewEntry.driver.name} 
                      className="w-16 h-16 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                      <User className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-gray-900">{viewEntry.driver.name}</p>
                    <p className="text-sm text-gray-500">{viewEntry.driver.document}</p>
                  </div>
                </div>
              </div>

              {/* Veículo */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Veículo</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-2xl font-bold text-gray-900">{viewEntry.vehicle.plate}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-white rounded border border-gray-200 text-gray-600">
                      {viewEntry.vehicle.color}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{viewEntry.vehicle.brand} {viewEntry.vehicle.model}</p>
                  {viewEntry.vehicle.company && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {viewEntry.vehicle.company}
                    </p>
                  )}
                </div>
              </div>

              {/* Tempos */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Horários</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Entrada:</span>
                    <span className="text-sm font-medium text-green-700">{formatDateTime(viewEntry.entry_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Saída:</span>
                    <span className={`text-sm font-medium ${viewEntry.exit_time ? 'text-red-700' : 'text-gray-400'}`}>
                      {viewEntry.exit_time ? formatDateTime(viewEntry.exit_time) : 'Em andamento'}
                    </span>
                  </div>
                  {viewEntry.exit_time && (
                    <div className="flex justify-between border-t border-gray-100 mt-2 pt-2">
                      <span className="text-sm text-gray-500">Duração:</span>
                      <span className="text-sm font-bold text-gray-800">
                        {(() => {
                          const duration = new Date(viewEntry.exit_time!).getTime() - new Date(viewEntry.entry_time).getTime();
                          return `${Math.floor(duration / 3600000)}h ${String(Math.floor((duration % 3600000) / 60000)).padStart(2, '0')}m`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Localização */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2">Localização</h4>
                <p className="text-sm text-gray-600">
                  {addresses[viewEntry.id] || (viewEntry.location ? 'Coordenadas disponíveis' : 'Não registrada')}
                </p>
                {viewEntry.location && (
                  <a 
                    href={`https://www.google.com/maps?q=${viewEntry.location.lat},${viewEntry.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-4 h-4" /> Ver no Google Maps
                  </a>
                )}
              </div>
            </div>

            {/* Fotos */}
            <div className="mt-8">
              <h4 className="font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-4">Registro Fotográfico</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {viewEntry.vehicle_photo_url && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Veículo</p>
                    <img 
                      src={viewEntry.vehicle_photo_url} 
                      alt="Veículo" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(viewEntry.vehicle_photo_url)}
                    />
                  </div>
                )}
                {viewEntry.plate_photo_url && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Placa</p>
                    <img 
                      src={viewEntry.plate_photo_url} 
                      alt="Placa" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(viewEntry.plate_photo_url)}
                    />
                  </div>
                )}
                {viewEntry.entry_weight_photos?.map((photo, idx) => (
                  <div key={`entry-${idx}`} className="space-y-1">
                    <p className="text-xs text-gray-500">Pesagem Entrada {idx + 1}</p>
                    <img 
                      src={photo} 
                      alt="Pesagem" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(photo)}
                    />
                  </div>
                ))}
                {viewEntry.exit_weight_photos?.map((photo, idx) => (
                  <div key={`exit-${idx}`} className="space-y-1">
                    <p className="text-xs text-gray-500">Pesagem Saída {idx + 1}</p>
                    <img 
                      src={photo} 
                      alt="Pesagem" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(photo)}
                    />
                  </div>
                ))}
                 {viewEntry.exit_invoice_photo_url && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Nota Fiscal Saída</p>
                    <img 
                      src={viewEntry.exit_invoice_photo_url} 
                      alt="Nota Fiscal" 
                      className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(viewEntry.exit_invoice_photo_url)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Observações */}
            {viewEntry.notes && (
              <div className="mt-6 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                <h4 className="text-sm font-bold text-yellow-800 mb-1">Observações de Entrada</h4>
                <p className="text-sm text-yellow-700">{viewEntry.notes}</p>
              </div>
            )}
             {viewEntry.exit_observation && (
              <div className="mt-4 bg-red-50 p-4 rounded-lg border border-red-100">
                <h4 className="text-sm font-bold text-red-800 mb-1">Observações de Saída</h4>
                <p className="text-sm text-red-700">{viewEntry.exit_observation}</p>
              </div>
            )}

            {/* Dados de Carga */}
            {(viewEntry.entry_weight || viewEntry.exit_weight || viewEntry.material_code) && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                    <h4 className="font-semibold text-gray-700 mb-3">Dados de Carga</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        {viewEntry.entry_weight && (
                            <div>
                                <span className="block text-gray-500 text-xs">Peso Entrada</span>
                                <span className="font-medium">{viewEntry.entry_weight} kg</span>
                            </div>
                        )}
                        {viewEntry.exit_weight && (
                            <div>
                                <span className="block text-gray-500 text-xs">Peso Saída</span>
                                <span className="font-medium">{viewEntry.exit_weight} kg</span>
                            </div>
                        )}
                        {viewEntry.entry_weight && viewEntry.exit_weight && (
                            <div>
                                <span className="block text-gray-500 text-xs">Total Carga</span>
                                <span className="font-bold text-blue-700">
                                    {(parseFloat(viewEntry.exit_weight) - parseFloat(viewEntry.entry_weight)).toFixed(2)} kg
                                </span>
                            </div>
                        )}
                        {viewEntry.material_code && (
                            <div>
                                <span className="block text-gray-500 text-xs">Material</span>
                                <span className="font-medium">{viewEntry.material_code}</span>
                            </div>
                        )}
                        {viewEntry.invoice_number && (
                            <div>
                                <span className="block text-gray-500 text-xs">Nota Fiscal</span>
                                <span className="font-medium">{viewEntry.invoice_number}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
