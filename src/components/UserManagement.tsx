import { useState, useEffect } from 'react';
import { db, UserProfile, firebaseConfig } from './firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy, setDoc, where, limit, startAfter, QueryDocumentSnapshot, getDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Mail, Calendar, Edit2, Check, X, UserPlus, Save, Eye, EyeOff, ChevronDown, Building2, User, Trash2 } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

interface Props {
  tenantId?: string;
}

const AVAILABLE_PAGES = [
  { id: 'indicators', label: 'Indicadores' },
  { id: 'register-entry', label: 'Registrar Entrada' },
  { id: 'entries', label: 'Ver Registros' },
  { id: 'register-driver', label: 'Cadastrar Motorista' },
  { id: 'register-occurrence', label: 'Registrar Ocorrência' },
  { id: 'drivers', label: 'Ver Motoristas' },
  { id: 'register-vehicle', label: 'Cadastrar Veículo' },
  { id: 'company-settings', label: 'Minha Empresa' },
  { id: 'users', label: 'Gerenciar Usuários' }
];

export default function UserManagement({ tenantId: propTenantId }: Props) {
  const { user, userProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<any>('');
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [tenants, setTenants] = useState<{id: string, name: string, type?: string, parentId?: string}[]>([]);
  
  // Novos estados para permissões
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const activeTenantId = propTenantId || userProfile?.tenantId;

  useEffect(() => {
    if (userProfile) {
      if (activeTenantId === 'all' && tenants.length === 0) return;
      loadUsers(true);
    }
  }, [userProfile, activeTenantId, tenants]);

  useEffect(() => {
    const fetchTenants = async () => {
      if (!user?.uid || !userProfile) return;
      try {
        let list: any[] = [];
        
        // Se o usuário for admin, busca todas as empresas.
        if (userProfile.role === 'admin') {
           const snapshot = await getDocs(collection(db, 'tenants'));
           list = snapshot.docs.map(doc => ({ 
             id: doc.id, 
             name: doc.data().name,
             type: doc.data().type,
             parentId: doc.data().parentId
           }));
        } else {
           // Lógica antiga para outros usuários
           // @ts-ignore
           const allowed = userProfile?.allowedTenants;
           if (allowed && Array.isArray(allowed) && allowed.length > 0) {
              const promises = allowed.map(id => getDoc(doc(db, 'tenants', id)));
              const docs = await Promise.all(promises);
              list = docs.filter(d => d.exists()).map(doc => ({
                id: doc.id,
                name: doc.data().name,
                type: doc.data().type,
                parentId: doc.data().parentId
              }));
           } else {
              const q = query(collection(db, 'tenants'), where('created_by', '==', user.uid));
              const snapshot = await getDocs(q);
              list = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                name: doc.data().name,
                type: doc.data().type,
                parentId: doc.data().parentId
              }));
           }
        }

        // Ordenar: Matrizes primeiro, depois por nome
        list.sort((a, b) => {
          if (a.type === 'matriz' && b.type !== 'matriz') return -1;
          if (a.type !== 'matriz' && b.type === 'matriz') return 1;
          return a.name.localeCompare(b.name);
        });

        setTenants(list);
        
        // Pré-seleciona a empresa atual se estiver criando
        if (activeTenantId && list.some(t => t.id === activeTenantId)) {
           setSelectedTenants(prev => prev.length === 0 ? [activeTenantId] : prev);
        }
      } catch (e) {
        console.error("Erro ao buscar empresas:", e);
      }
    };
    fetchTenants();
  }, [user, userProfile, activeTenantId]);

  const handleTenantChange = (tenantId: string, isChecked: boolean) => {
    const tenant = tenants.find(t => t.id === tenantId);
    let newSelected = isChecked 
      ? [...selectedTenants, tenantId]
      : selectedTenants.filter(id => id !== tenantId);

    // Se for matriz, seleciona/deseleciona todas as filiais automaticamente
    if (tenant?.type === 'matriz') {
      const subsidiaries = tenants.filter(t => t.parentId === tenantId);
      const subsidiaryIds = subsidiaries.map(t => t.id);
      
      if (isChecked) {
        newSelected = [...new Set([...newSelected, ...subsidiaryIds])];
      } else {
        newSelected = newSelected.filter(id => !subsidiaryIds.includes(id));
      }
    }
    
    setSelectedTenants(newSelected);
  };

  const loadUsers = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      if (!activeTenantId) {
        setLoading(false);
        return;
      }

      let q;
      const baseConstraints = [orderBy('created_at', 'desc')];

      if (!isInitial && lastVisible) {
        baseConstraints.push(startAfter(lastVisible));
      }
      baseConstraints.push(limit(ITEMS_PER_PAGE));

      if (activeTenantId === 'all') {
        // Se "Todas", busca usuários de qualquer empresa da lista (limite de 10 para query 'in')
        const tenantIds = tenants.map(t => t.id).slice(0, 10);
        
        if (tenantIds.length === 0) {
          setUsers([]);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
        
        q = query(
          collection(db, 'profiles'), 
          where('allowedTenants', 'array-contains-any', tenantIds), 
          ...baseConstraints
        );
      } else {
        // Se for Matriz, inclui também usuários das filiais para garantir visibilidade total
        const currentTenant = tenants.find(t => t.id === activeTenantId);
        let targetIds = [activeTenantId];
        
        if (currentTenant?.type === 'matriz') {
          const childIds = tenants.filter(t => t.parentId === activeTenantId).map(t => t.id);
          targetIds = [...targetIds, ...childIds];
        }
        
        // Limita a 10 IDs (limite do Firestore para consultas 'IN' ou 'ARRAY-CONTAINS-ANY')
        targetIds = targetIds.slice(0, 10);

        q = query(
          collection(db, 'profiles'), 
          // Usa 'array-contains-any' se houver múltiplas empresas (Matriz+Filiais), senão usa 'array-contains'
          where('allowedTenants', targetIds.length > 1 ? 'array-contains-any' : 'array-contains', targetIds.length > 1 ? targetIds : targetIds[0]), 
          ...baseConstraints
        );
      }

      const querySnapshot = await getDocs(q);
      
      const loadedUsers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];

      if (isInitial) {
        setUsers(loadedUsers);
      } else {
        setUsers(prev => [...prev, ...loadedUsers]);
      }

      if (querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }
      
      if (querySnapshot.docs.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      if (err.code === 'failed-precondition' || err.message?.includes('index')) {
        const message = err.message || '';
        const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
        const link = match ? match[0] : null;
        
        if (link) {
          setError(<span>Configuração necessária: <a href={link} target="_blank" rel="noopener noreferrer" className="underline font-bold text-blue-700">Clique aqui para criar o índice</a>.</span>);
        } else {
          setError('Configuração necessária: É preciso criar um índice no Firebase. Verifique o link no console do navegador (F12).');
        }
      } else {
        setError('Não foi possível carregar os usuários.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setNewRole(user.role);
    // @ts-ignore
    setSelectedTenants(user.allowedTenants || (user.tenantId ? [user.tenantId] : []));
    // @ts-ignore
    setSelectedPages(user.allowedPages || []);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'profiles', editingUser.id), { 
        role: newRole,
        allowedTenants: selectedTenants,
        allowedPages: selectedPages
      });

      setUsers(users.map(u => u.id === editingUser.id ? { ...u, role: newRole as any, allowedTenants: selectedTenants, allowedPages: selectedPages } : u));
      setShowEditModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Erro ao atualizar permissão:', err);
      alert('Erro ao atualizar usuário');
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === user?.uid) {
      alert("Você não pode excluir seu próprio usuário.");
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir este usuário? Esta ação removerá o acesso do usuário ao sistema.')) return;

    try {
      await deleteDoc(doc(db, 'profiles', userId));
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error('Erro ao excluir usuário:', err);
      alert('Erro ao excluir usuário.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let secondaryApp: FirebaseApp | undefined;

    try {
      // Verifica se já existe uma instância para evitar erro de duplicidade
      secondaryApp = getApps().find(app => app.name === "Secondary");
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, "Secondary");
      }
      const secondaryAuth = getAuth(secondaryApp);

      // Garante que haja pelo menos uma empresa selecionada
      let tenantsToSave = selectedTenants.length > 0 ? selectedTenants : [];
      
      if (tenantsToSave.length === 0) {
        if (activeTenantId && activeTenantId !== 'all') {
          tenantsToSave = [activeTenantId];
        } else if (tenants.length > 0) {
          tenantsToSave = [tenants[0].id]; // Fallback para a primeira empresa se estiver em "Todas"
        }
      }

      if (tenantsToSave.length === 0) throw new Error("Selecione pelo menos uma empresa.");

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      
      // Cria o perfil no Firestore com a permissão selecionada
      await setDoc(doc(db, 'profiles', userCredential.user.uid), {
        name: newName,
        login: newLogin,
        email: newEmail,
        tenantId: tenantsToSave[0], // Define a primeira como principal para compatibilidade
        allowedTenants: tenantsToSave,
        allowedPages: selectedPages,
        role: newRole as 'admin' | 'operator' | 'viewer',
        created_at: new Date().toISOString()
      });

      // Limpeza: desloga da instância secundária (NÃO deleta o app para evitar erros de concorrência)
      await signOut(secondaryAuth);

      setNewName('');
      setNewLogin('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('viewer');
      setSelectedTenants(activeTenantId ? [activeTenantId] : []);
      setSelectedPages([]);
      setIsRegistering(false);
      loadUsers(true);
    } catch (err: any) {
      console.error('Erro ao cadastrar usuário:', err);
      
      let msg = 'Erro ao cadastrar usuário.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este e-mail já está cadastrado no sistema. Tente outro.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'A senha é muito fraca. Digite pelo menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'O formato do e-mail é inválido.';
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento de Usuários</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
          <div className="flex items-center mb-3">
            <div className="p-2 bg-purple-100 rounded-lg mr-3">
              <Shield className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h3 className="font-bold text-purple-900">Administrador</h3>
              <p className="text-xs text-purple-700">Acesso Total</p>
            </div>
          </div>
          <p className="text-sm text-purple-800 mb-3">Pode gerenciar usuários, criar registros e visualizar todo o sistema.</p>
          <div className="text-xs text-purple-900 bg-purple-100 p-2 rounded-lg">
            <strong>Páginas:</strong> Registrar Entrada, Ver Registros, Cadastrar Motorista, Ver Motoristas, Usuários.
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
          <div className="flex items-center mb-3">
            <div className="p-2 bg-green-100 rounded-lg mr-3">
              <Edit2 className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <h3 className="font-bold text-green-900">Operador</h3>
              <p className="text-xs text-green-700">Operação Diária</p>
            </div>
          </div>
          <p className="text-sm text-green-800 mb-3">Pode registrar entradas, saídas e cadastros. Não gerencia usuários.</p>
          <div className="text-xs text-green-900 bg-green-100 p-2 rounded-lg">
            <strong>Páginas:</strong> Registrar Entrada, Ver Registros, Cadastrar Motorista, Ver Motoristas.
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
          <div className="flex items-center mb-3">
            <div className="p-2 bg-gray-100 rounded-lg mr-3">
              <Eye className="w-5 h-5 text-gray-700" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Visualizador</h3>
              <p className="text-xs text-gray-700">Apenas Leitura</p>
            </div>
          </div>
          <p className="text-sm text-gray-800 mb-3">Pode apenas visualizar os registros e relatórios. Não faz alterações.</p>
          <div className="text-xs text-gray-900 bg-gray-200 p-2 rounded-lg">
            <strong>Páginas:</strong> Ver Registros, Ver Motoristas.
          </div>
        </div>
      </div>

      <div className="mb-6">
        <button
          onClick={() => setIsRegistering(!isRegistering)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          {isRegistering ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          <span>{isRegistering ? 'Cancelar Cadastro' : 'Novo Usuário'}</span>
        </button>
      </div>

      {error && (
        <div className="bg-yellow-50 text-yellow-700 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {isRegistering && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Cadastrar Novo Usuário</h3>
          <form onSubmit={handleRegister} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome de Usuário</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
                <input
                  type="text"
                  value={newLogin}
                  onChange={(e) => setNewLogin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Login do sistema"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Seleção de Empresas */}
              {tenants.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Acesso a Empresas
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTenants.length === tenants.length}
                        onChange={(e) => setSelectedTenants(e.target.checked ? tenants.map(t => t.id) : [])}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                      />
                      <span className="text-xs text-gray-500">Todas</span>
                    </label>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tenants.map(t => (
                      <label key={t.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTenants.includes(t.id)}
                          onChange={(e) => handleTenantChange(t.id, e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          {t.name}
                          {t.type === 'matriz' && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">Matriz</span>}
                          {t.type === 'filial' && <span className="ml-2 text-xs text-gray-500">(Filial)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Seleção de Páginas */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Acesso a Páginas
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPages.length === AVAILABLE_PAGES.length}
                      onChange={(e) => setSelectedPages(e.target.checked ? AVAILABLE_PAGES.map(p => p.id) : [])}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                    />
                    <span className="text-xs text-gray-500">Todas</span>
                  </label>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {AVAILABLE_PAGES.map(page => (
                    <label key={page.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPages.includes(page.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPages([...selectedPages, page.id]);
                          else setSelectedPages(selectedPages.filter(id => id !== page.id));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{page.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="usuario@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                    required
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Visualizador (Apenas vê registros)</option>
                  <option value="operator">Operador (Registra entradas/saídas)</option>
                  <option value="admin">Administrador (Acesso total)</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Usuário</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data Cadastro</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfil de Acesso</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="bg-gray-100 p-2 rounded-full mr-3">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(user as any).name || '---'}</p>
                        <p className="text-xs text-gray-500">{(user as any).login || user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="w-4 h-4 mr-2" />
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        user.role === 'operator' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role === 'admin' ? 'Administrador' : user.role === 'operator' ? 'Operador' : 'Visualizador'}
                      </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(user)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Editar Permissões">
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(user.id)} 
                          className={`p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition ${user.id === userProfile?.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Excluir Usuário"
                          disabled={user.id === userProfile?.id}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !error && (
          <div className="p-8 text-center text-gray-500">
            Nenhum usuário encontrado.
          </div>
        )}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => loadUsers(false)}
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

      {/* Modal de Edição */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Editar Permissões: {editingUser.email}</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="viewer">Visualizador</option>
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-gray-700">Acesso a Empresas</label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTenants.length === tenants.length}
                        onChange={(e) => setSelectedTenants(e.target.checked ? tenants.map(t => t.id) : [])}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                      />
                      <span className="text-xs text-gray-500">Todas</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    {tenants.map(t => (
                      <label key={t.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTenants.includes(t.id)}
                          onChange={(e) => handleTenantChange(t.id, e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          {t.name}
                          {t.type === 'matriz' && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">Matriz</span>}
                          {t.type === 'filial' && <span className="ml-2 text-xs text-gray-500">(Filial)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-gray-700">Acesso a Páginas</label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPages.length === AVAILABLE_PAGES.length}
                        onChange={(e) => setSelectedPages(e.target.checked ? AVAILABLE_PAGES.map(p => p.id) : [])}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                      />
                      <span className="text-xs text-gray-500">Todas</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    {AVAILABLE_PAGES.map(page => (
                      <label key={page.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPages.includes(page.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedPages([...selectedPages, page.id]);
                            else setSelectedPages(selectedPages.filter(id => id !== page.id));
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
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