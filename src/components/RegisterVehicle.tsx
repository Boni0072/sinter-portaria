import { useState, useEffect } from 'react';
import { db, Driver } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, where, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Save, Building2 } from 'lucide-react';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!currentTenantId) {
        throw new Error('Selecione uma empresa para cadastrar o veículo.');
      }
      
      await addDoc(collection(db, 'tenants', currentTenantId, 'vehicles'), {
        plate: plate.toUpperCase(),
        brand,
        model,
        color,
        driver_id: selectedDriver,
        created_at: new Date().toISOString()
      });

      setPlate('');
      setBrand('');
      setModel('');
      setColor('');
      setSelectedDriver('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar veículo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Cadastrar Novo Veículo</h2>

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
  );
}
