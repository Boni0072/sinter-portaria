import { useState, useEffect } from 'react';
import { auth, Driver } from './firebase';
import { getDatabase, ref, remove, update, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, FileText, Maximize2, X, Edit2, Trash2, Save } from 'lucide-react';

export default function DriversList() {
  const { userProfile } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState({ name: '', document: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const database = getDatabase(auth.app);

  useEffect(() => {
    const driversRef = ref(database, 'drivers');
    
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
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este motorista?')) return;
    
    try {
      await remove(ref(database, `drivers/${id}`));
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
      await update(ref(database, `drivers/${editingDriver.id}`), {
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map((driver) => (
          <div
            key={driver.id}
            className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition relative group"
          >
            <div className="flex items-start justify-between space-x-6 w-full">
              {/* Foto */}
              <div className="flex-shrink-0">
                {driver.photo_url ? (
                  <button 
                    onClick={() => setZoomedImage(driver.photo_url!)}
                    className="relative group cursor-zoom-in focus:outline-none"
                    title="Ampliar foto"
                  >
                    <img 
                      src={driver.photo_url} 
                      alt={driver.name} 
                      className="w-32 h-32 rounded-lg object-cover border-4 border-blue-100 group-hover:border-blue-400 transition-colors"
                    />
                  </button>
                ) : (
                  <div className="bg-blue-100 p-4 rounded-lg flex items-center justify-center w-32 h-32">
                    <User className="w-16 h-16 text-blue-600" />
                  </div>
                )}
              </div>
              
              {/* Infos e Assinatura */}
              <div className="flex-grow flex items-start justify-between">
                {/* Informações */}
                <div className="flex flex-col justify-center h-32">
                  <p className="font-bold text-xl text-gray-800">{driver.name}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center text-sm text-gray-600">
                      <FileText className="w-4 h-4 mr-2 flex-shrink-0 text-gray-500" />
                      <span>{driver.document}</span>
                    </div>
                    {driver.phone && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Phone className="w-4 h-4 mr-2 flex-shrink-0 text-gray-500" />
                        <span>{driver.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Assinatura */}
                {driver.signature_url && (
                  <div className="flex-shrink-0">
                      <p className="text-xs text-gray-500 mb-1 text-center">Assinatura:</p>
                      <div 
                        className="relative group cursor-zoom-in"
                        onClick={() => setZoomedImage(driver.signature_url!)}
                        title="Ampliar assinatura"
                      >
                        <img
                          src={driver.signature_url}
                          alt="Assinatura"
                          className="w-40 h-24 object-contain bg-gray-50 border border-gray-200 rounded group-hover:border-blue-300 transition-colors"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors rounded pointer-events-none">
                          <Maximize2 className="w-5 h-5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                  </div>
                )}
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="absolute top-4 right-4 flex items-center space-x-1 bg-white/50 backdrop-blur-sm p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
        ))}
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