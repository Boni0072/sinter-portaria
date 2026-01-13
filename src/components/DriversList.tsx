import { useState, useEffect } from 'react';
import { db, Driver } from './firebase';
import { collection, getDocs, query, orderBy, where, limit, startAfter, QueryDocumentSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, FileText, PenTool, Maximize2, X, ChevronDown, Edit2, Trash2, Save } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

export default function DriversList() {
  const { user, userProfile } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState({ name: '', document: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userProfile) loadDrivers(true);
  }, [userProfile]);

  const loadDrivers = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) return;

      let q = query(
        collection(db, 'tenants', tenantId, 'drivers'), 
        orderBy('created_at', 'desc'),
        limit(ITEMS_PER_PAGE)
      );

      if (!isInitial && lastVisible) {
        q = query(
          collection(db, 'tenants', tenantId, 'drivers'), 
          orderBy('created_at', 'desc'),
          startAfter(lastVisible),
          limit(ITEMS_PER_PAGE)
        );
      }

      const querySnapshot = await getDocs(q);
      
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Driver[];

      if (isInitial) {
        setDrivers(data);
      } else {
        setDrivers(prev => [...prev, ...data]);
      }

      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }

      if (querySnapshot.docs.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Erro ao carregar motoristas:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este motorista?')) return;
    
    try {
      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) throw new Error("Tenant ID não encontrado.");

      await deleteDoc(doc(db, 'tenants', tenantId, 'drivers', id));
      setDrivers(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Erro ao excluir motorista:', err);
      alert('Erro ao excluir motorista. Tente novamente.');
    }
  };

  const handleEditClick = (driver: Driver) => {
    setEditingDriver(driver);
    setEditForm({
      name: driver.name,
      document: driver.document,
      phone: driver.phone || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDriver) return;
    setSaving(true);
    try {
      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) throw new Error("Tenant ID não encontrado.");

      await updateDoc(doc(db, 'tenants', tenantId, 'drivers', editingDriver.id), {
        name: editForm.name,
        document: editForm.document,
        phone: editForm.phone || null
      });
      
      setDrivers(prev => prev.map(d => d.id === editingDriver.id ? { ...d, ...editForm } : d));
      setEditingDriver(null);
    } catch (err) {
      console.error('Erro ao atualizar motorista:', err);
      alert('Erro ao atualizar motorista.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="text-center py-12">
        <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600">Nenhum motorista cadastrado</h3>
        <p className="text-gray-500 mt-2">Comece cadastrando um novo motorista</p>
      </div>
    );
  }

  const canManage = userProfile?.role === 'admin' || userProfile?.role === 'operator';

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Motoristas Cadastrados</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map((driver) => (
          <div
            key={driver.id}
            className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition relative group"
          >
            <div className="flex items-start justify-between mb-4">
              {driver.photo_url ? (
                <button 
                  onClick={() => setZoomedImage(driver.photo_url!)}
                  className="relative group cursor-zoom-in focus:outline-none"
                  title="Ampliar foto"
                >
                  <img 
                    src={driver.photo_url} 
                    alt={driver.name} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-blue-100 group-hover:border-blue-400 transition-colors"
                  />
                </button>
              ) : (
                <div className="bg-blue-100 p-3 rounded-lg">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                {driver.signature_url && (
                  <div className="bg-green-100 p-2 rounded-lg" title="Assinatura cadastrada">
                    <PenTool className="w-4 h-4 text-green-600" />
                  </div>
                )}
                {canManage && (
                  <>
                    <button onClick={() => handleEditClick(driver)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(driver.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              {driver.name}
            </h3>

            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-600">
                <FileText className="w-4 h-4 mr-2" />
                <span>{driver.document}</span>
              </div>

              {driver.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  <span>{driver.phone}</span>
                </div>
              )}
            </div>

            {driver.signature_url && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Assinatura:</p>
                <div 
                  className="relative group cursor-zoom-in"
                  onClick={() => setZoomedImage(driver.signature_url!)}
                  title="Ampliar assinatura"
                >
                  <img
                    src={driver.signature_url}
                    alt="Assinatura"
                    className="w-full h-20 object-contain bg-white border border-gray-200 rounded group-hover:border-blue-300 transition-colors"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors rounded pointer-events-none">
                    <Maximize2 className="w-5 h-5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => loadDrivers(false)}
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

      {/* Modal de Edição */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Editar Motorista</h3>
              <button onClick={() => setEditingDriver(null)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Documento (CPF)</label>
                <input 
                  type="text" 
                  value={editForm.document}
                  onChange={e => setEditForm({...editForm, document: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input 
                  type="text" 
                  value={editForm.phone}
                  onChange={e => setEditForm({...editForm, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end pt-4">
                <button onClick={handleSaveEdit} disabled={saving} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
