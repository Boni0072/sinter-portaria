import { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { getDatabase, ref, push, set, remove, update, onValue, query, orderByChild, equalTo, get } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Plus, Store, Trash2, Link as LinkIcon, Pencil } from 'lucide-react';

interface Filial {
  id: string;
  name: string;
  cnpj: string;
  phone?: string;
  address?: string;
  type?: 'matriz' | 'filial';
  parentId?: string;
  parkingSpots?: number;
}

interface Props {
  tenantId?: string;
}

export default function CompanySettings({ tenantId: propTenantId }: Props) {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const database = getDatabase(auth.app);
  
  const [allCompanies, setAllCompanies] = useState<Filial[]>([]); // NEW state for all companies
  const [showLinkFilialModal, setShowLinkFilialModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Filial | null>(null);
  const [selectedFilialForLink, setSelectedFilialForLink] = useState<string | null>(null);
  const [selectedMatrixId, setSelectedMatrixId] = useState<string>('');
  const [createData, setCreateData] = useState({
    name: '',
    cnpj: '',
    phone: '',
    address: '',
    type: 'matriz' as 'matriz' | 'filial',
    parentId: '',
    parkingSpots: ''
  });

  useEffect(() => {
    if (!user?.uid) return;

    let q;
    // @ts-ignore
    // Nota: Realtime DB não suporta query 'IN' nativa facilmente, então buscamos por owner_id
    // Para suporte a allowedTenants complexo, seria necessário buscar individualmente ou filtrar no cliente.
    // Aqui focamos na estrutura principal por owner_id.
    
    const tenantsRef = ref(database, 'tenants');
    q = query(tenantsRef, orderByChild('owner_id'), equalTo(user.uid));

    const unsubscribe = onValue(q, (snapshot) => {
      const companiesList: Filial[] = [];
      if (!snapshot.exists()) {
        setAllCompanies([]);
        return;
      }
      snapshot.forEach((child) => {
        const data = child.val();
        companiesList.push({
          id: child.key!,
          name: data.name,
          cnpj: data.cnpj,
          phone: data.phone,
          address: data.address,
          type: data.type || 'matriz', // Default to matriz if type is not set
          parentId: data.parentId,
          parkingSpots: data.parkingSpots
        });
      });
      setAllCompanies(companiesList);
    });

    return () => unsubscribe();
  }, [user, userProfile]);

  const handleCreateCompany = async () => {
    if (!createData.name.trim()) {
      alert("Por favor, informe o nome da empresa.");
      return;
    }
    setLoading(true);
    
    const spots = parseInt(createData.parkingSpots);
    try {
      const newCompanyRef = push(ref(database, 'tenants'));
      await set(newCompanyRef, {
        name: createData.name,
        cnpj: createData.cnpj || '',
        phone: createData.phone || '',
        address: createData.address || '',
        parkingSpots: isNaN(spots) ? 0 : spots,
        type: createData.type,
        parentId: createData.type === 'filial' && createData.parentId ? createData.parentId : null,
        created_at: new Date().toISOString(),
        created_by: user?.uid,
        owner_id: user?.uid // Adicionado para garantir que apareça na lista
      });
      setShowCreateModal(false);
      setCreateData({ name: '', cnpj: '', phone: '', address: '', type: 'matriz', parentId: '', parkingSpots: '' });
      setMessage({ type: 'success', text: 'Empresa criada com sucesso!' });
    } catch (error: any) {
      console.error("Erro ao criar empresa:", error);
      setMessage({ type: 'error', text: `Erro ao criar empresa: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleEditClick = (company: Filial) => {
    setEditData({ ...company });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editData || !editData.name.trim()) {
      alert("Por favor, informe o nome da empresa.");
      return;
    }
    setLoading(true);
    const spots = parseInt(String(editData.parkingSpots));
    try {
      await update(ref(database, `tenants/${editData.id}`), {
        name: editData.name,
        cnpj: editData.cnpj || '',
        phone: editData.phone || '',
        address: editData.address || '',
        parkingSpots: isNaN(spots) ? 0 : spots,
        updated_at: new Date().toISOString(),
        updated_by: user?.uid
      });
      
      setMessage({ type: 'success', text: 'Empresa atualizada com sucesso!' });
      setShowEditModal(false);
      setEditData(null);
    } catch (error: any) {
      console.error("Erro ao atualizar empresa:", error);
      setMessage({ type: 'error', text: `Erro ao atualizar empresa: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleDeleteFilial = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta filial?')) {
      try {
        await remove(ref(database, `tenants/${id}`));
      } catch (error) {
        console.error("Erro ao excluir filial:", error);
        alert("Erro ao excluir filial.");
      }
    }
  };

  const handleLinkFilialToMatrix = async () => {
    if (!selectedFilialForLink || !selectedMatrixId) return;
    setLoading(true);
    try {
      await update(ref(database, `tenants/${selectedFilialForLink}`), {
        parentId: selectedMatrixId,
        type: 'filial',
        updated_at: new Date().toISOString(),
        updated_by: user?.uid
      });
      
      setMessage({ type: 'success', text: 'Filial vinculada à matriz com sucesso!' });
      setShowLinkFilialModal(false);
      setSelectedFilialForLink(null);
      setSelectedMatrixId('');
    } catch (error: any) {
      console.error("Erro ao vincular filial:", error);
      setMessage({ type: 'error', text: `Erro ao vincular filial: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleUpdateCompanyType = async (companyId: string, newType: 'matriz' | 'filial') => {
    setLoading(true);
    try {
      await update(ref(database, `tenants/${companyId}`), {
        type: newType,
        parentId: newType === 'matriz' ? null : null, // Clear parentId if becoming matriz
        updated_at: new Date().toISOString(),
        updated_by: user?.uid
      });
      setMessage({ type: 'success', text: `Tipo da empresa atualizado para ${newType} com sucesso!` });
    } catch (error: any) {
      console.error("Erro ao atualizar tipo da empresa:", error);
      setMessage({ type: 'error', text: `Erro ao atualizar tipo da empresa: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a empresa "${companyName}"? Esta ação é irreversível.`)) {
      return;
    }
    setLoading(true);
    try {
      // Check if it's a matriz with linked filiais
      const q = query(ref(database, 'tenants'), orderByChild('parentId'), equalTo(companyId));
      const querySnapshot = await get(q);
      if (querySnapshot.exists()) {
        alert("Não é possível excluir esta empresa pois ela possui filiais vinculadas. Desvincule ou exclua as filiais primeiro.");
        setLoading(false);
        return;
      }

      await remove(ref(database, `tenants/${companyId}`));
      setMessage({ type: 'success', text: `Empresa "${companyName}" excluída com sucesso!` });
    } catch (error: any) {
      console.error("Erro ao excluir empresa:", error);
      setMessage({ type: 'error', text: `Erro ao excluir empresa: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleUnlinkFilial = async (filialId: string) => {
    if (!window.confirm('Tem certeza que deseja desvincular esta filial?')) {
      return;
    }
    setLoading(true);
    try {
      await update(ref(database, `tenants/${filialId}`), {
        parentId: null, // Remove parentId
        updated_at: new Date().toISOString(),
        updated_by: user?.uid
      });
      setMessage({ type: 'success', text: 'Filial desvinculada com sucesso!' });
    } catch (error: any) {
      console.error("Erro ao desvincular filial:", error);
      setMessage({ type: 'error', text: `Erro ao desvincular filial: ${error.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Minha Empresa</h2>
          <p className="text-gray-500">Gerencie os dados da sua organização</p>
        </div>
      </div>

      {/* Seção de Gerenciamento de Empresas (Hierárquica) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-500" /> Gerenciamento de Empresas
          </h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Empresa
          </button>
        </div>

        {/* Lista de Matrizes e suas Filiais */}
        <div className="space-y-4">
          {allCompanies.filter(c => c.type === 'matriz').map(matriz => (
            <div key={matriz.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <div>
                    <h4 className="font-bold text-gray-800">{matriz.name}</h4>
                    <p className="text-xs text-gray-500">CNPJ: {matriz.cnpj || 'N/A'} • Vagas: {matriz.parkingSpots || 0} • Matriz</p>
                    {matriz.address && <p className="text-xs text-gray-500">{matriz.address}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={() => handleEditClick(matriz)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full" title="Editar">
                      <Pencil className="w-4 h-4"/>
                   </button>
                   <button onClick={() => handleDeleteCompany(matriz.id, matriz.name)} className="text-red-500 hover:bg-red-50 p-2 rounded-full"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              
              {/* Filiais desta Matriz */}
              <div className="bg-white divide-y divide-gray-100">
                {allCompanies.filter(f => f.parentId === matriz.id).map(filial => (
                   <div key={filial.id} className="p-3 pl-12 flex justify-between items-center hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Store className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{filial.name}</p>
                          <p className="text-xs text-gray-400">CNPJ: {filial.cnpj || 'N/A'} • Vagas: {filial.parkingSpots || 0}</p>
                          {filial.address && <p className="text-xs text-gray-400">{filial.address}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditClick(filial)} className="text-blue-500 hover:bg-blue-50 p-1 rounded" title="Editar">
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button 
                          onClick={() => handleUnlinkFilial(filial.id)}
                          className="text-orange-500 hover:bg-orange-50 p-1 rounded"
                          title="Desvincular"
                        >
                          <LinkIcon className="w-4 h-4 rotate-45" />
                        </button>
                        <button onClick={() => handleDeleteCompany(filial.id, filial.name)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button>
                      </div>
                   </div>
                ))}
                {allCompanies.filter(f => f.parentId === matriz.id).length === 0 && (
                  <div className="p-3 pl-12 text-sm text-gray-400 italic">Nenhuma filial vinculada.</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Filiais Sem Vínculo (Órfãs) ou com Matriz não visível */}
        {allCompanies.filter(c => c.type === 'filial' && (!c.parentId || !allCompanies.some(m => m.id === c.parentId))).length > 0 && (
          <div className="mt-8">
            <h4 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
              <Store className="w-4 h-4" /> Outras Unidades / Filiais
            </h4>
            <div className="border border-orange-200 rounded-lg overflow-hidden">
               {allCompanies.filter(c => c.type === 'filial' && (!c.parentId || !allCompanies.some(m => m.id === c.parentId))).map(filial => (
                 <div key={filial.id} className="p-4 bg-orange-50 flex justify-between items-center border-b border-orange-100 last:border-0">
                    <div>
                      <p className="font-medium text-gray-800">{filial.name}</p>
                      <p className="text-xs text-gray-500">CNPJ: {filial.cnpj || 'N/A'} • Vagas: {filial.parkingSpots || 0}</p>
                      {filial.address && <p className="text-xs text-gray-500">{filial.address}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEditClick(filial)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full" title="Editar">
                        <Pencil className="w-4 h-4"/>
                      </button>
                      <button
                        onClick={() => {
                            setSelectedFilialForLink(filial.id);
                            setShowLinkFilialModal(true);
                        }}
                        className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                      >
                        <LinkIcon className="w-3 h-3" /> Vincular a uma Matriz
                      </button>
                      <button onClick={() => handleDeleteCompany(filial.id, filial.name)} className="text-red-500 hover:bg-red-50 p-2 rounded-full"><Trash2 className="w-4 h-4"/></button>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Vinculação de Filial */}
      {showLinkFilialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-bold mb-4">Vincular Filial a uma Matriz</h3>
            <p className="text-sm text-gray-600 mb-4">Selecione a matriz para a qual deseja vincular esta filial.</p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Matriz</label>
              <select
                value={selectedMatrixId}
                onChange={(e) => setSelectedMatrixId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione uma matriz...</option>
                {allCompanies.filter(c => c.type === 'matriz').map(matriz => (
                  <option key={matriz.id} value={matriz.id}>{matriz.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowLinkFilialModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button 
                onClick={handleLinkFilialToMatrix}
                disabled={!selectedMatrixId || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Empresa */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Nova Empresa</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createData.name}
                  onChange={e => setCreateData({...createData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createData.cnpj}
                  onChange={e => setCreateData({...createData, cnpj: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createData.phone}
                  onChange={e => setCreateData({...createData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createData.address}
                  onChange={e => setCreateData({...createData, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de Vagas</label>
                <input 
                  type="number" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createData.parkingSpots}
                  onChange={e => setCreateData({...createData, parkingSpots: e.target.value})}
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Empresa</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="type" 
                      checked={createData.type === 'matriz'}
                      onChange={() => setCreateData({...createData, type: 'matriz'})}
                    />
                    <span>Matriz</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="type" 
                      checked={createData.type === 'filial'}
                      onChange={() => setCreateData({...createData, type: 'filial'})}
                    />
                    <span>Filial</span>
                  </label>
                </div>
              </div>

              {createData.type === 'filial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vincular a Matriz (Opcional)</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-lg"
                    value={createData.parentId}
                    onChange={e => setCreateData({...createData, parentId: e.target.value})}
                  >
                    <option value="">Sem vínculo (definir depois)</option>
                    {allCompanies.filter(c => c.type === 'matriz').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleCreateCompany} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Criar Empresa</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Empresa */}
      {showEditModal && editData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Editar Empresa</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editData.name}
                  onChange={e => setEditData({...editData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editData.cnpj}
                  onChange={e => setEditData({...editData, cnpj: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editData.phone || ''}
                  onChange={e => setEditData({...editData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editData.address || ''}
                  onChange={e => setEditData({...editData, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de Vagas</label>
                <input 
                  type="number" 
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editData.parkingSpots ?? ''}
                  onChange={e => setEditData({...editData, parkingSpots: parseInt(e.target.value) || 0})}
                  min="0"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}