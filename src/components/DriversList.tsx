import { useState, useEffect } from 'react';
import { auth, Driver } from './firebase';
import { getDatabase, ref, remove, update, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { User, X, Edit2, Trash2, Save } from 'lucide-react';

interface Props {
  tenantId?: string;
}

export default function DriversList({ tenantId: propTenantId }: Props) {
  const { userProfile, user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState({ name: '', document: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const database = getDatabase(auth.app);
  const activeTenantId = propTenantId || (userProfile as any)?.tenantId || user?.uid;

  useEffect(() => {
    if (!activeTenantId) return;
    const driversRef = ref(database, `tenants/${activeTenantId}/drivers`);
    
    const unsubscribe = onValue(driversRef, (snapshot) => {
      const data: Driver[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          data.push({ id: child.key!, ...child.val() });
        });
      }
      // Ordena por data de criação (mais recentes primeiro)
      data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
      
      setDrivers(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeTenantId]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este motorista?')) return;
    
    try {
      await remove(ref(database, `tenants/${activeTenantId}/drivers/${id}`));
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
      await update(ref(database, `tenants/${activeTenantId}/drivers/${editingDriver.id}`), {
        name: editForm.name,
        document: editForm.document,
        phone: editForm.phone || null
      });
      
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Foto</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Documento</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Telefone</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-blue-500 uppercase tracking-wider">Assinatura</th>
              {canManage && <th className="px-6 py-3 text-right text-xs font-bold text-blue-500 uppercase tracking-wider">Ações</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {drivers.map((driver) => (
              <tr key={driver.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  {driver.photo_url ? (
                    <img 
                      src={driver.photo_url} 
                      alt={driver.name} 
                      className="w-10 h-10 rounded-full object-cover border border-gray-200 cursor-pointer hover:scale-110 transition-transform"
                      onClick={() => setZoomedImage(driver.photo_url!)}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {driver.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {driver.document}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {driver.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {driver.signature_url ? (
                    <div 
                      className="h-8 w-20 bg-white border border-gray-200 rounded cursor-zoom-in hover:border-blue-400 transition-colors"
                      onClick={() => setZoomedImage(driver.signature_url!)}
                    >
                      <img 
                        src={driver.signature_url} 
                        alt="Assinatura" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">---</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button onClick={() => handleEditClick(driver)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(driver.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-white/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoom" 
            className="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95 duration-200 rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 z-50 text-gray-500 hover:text-gray-700 transition-colors p-2 bg-gray-100 rounded-full hover:bg-gray-200"
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