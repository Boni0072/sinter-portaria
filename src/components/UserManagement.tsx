import { useState, useEffect } from 'react';
import { auth, UserProfile, firebaseConfig } from './firebase';
import { getDatabase, ref, get, set, update, remove, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Calendar, Edit2, X, UserPlus, Save, Eye, EyeOff, ChevronDown, Building2, User, Trash2, Search } from 'lucide-react';

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
  const [limitCount, setLimitCount] = useState(ITEMS_PER_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<any>('');
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [tenants, setTenants] = useState<{id: string, name: string, type?: string, parentId?: string}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Novos estados para permissões
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const database = getDatabase(auth.app);
  const activeTenantId = propTenantId || userProfile?.tenantId;

  useEffect(() => {
    if (!userProfile) {
      setLoading(false);
      return;
    }

    // Lógica de segurança para definir qual Tenant ID usar na busca
    let effectiveTenantId = activeTenantId;
    
    // Se não for admin, força o filtro pelo tenant do usuário para evitar erro de permissão
    if (userProfile.role !== 'admin') {
        if (activeTenantId === 'all' || !activeTenantId) {
             effectiveTenantId = userProfile.tenantId;
        }
    }

    // Se ainda assim não tiver um ID válido e não for admin, aborta para evitar erro
    if (!effectiveTenantId && userProfile.role !== 'admin') {
        setUsers([]);
        setError('Você não está vinculado a nenhuma empresa. Contate o suporte.');
        setLoading(false);
        return;
    }

    setError('');
    if (limitCount === ITEMS_PER_PAGE) setLoading(true);
    else setLoadingMore(true);

    // Se for uma visão de um tenant específico, busca usuários dele e de suas filiais (se for matriz).
    if (effectiveTenantId && effectiveTenantId !== 'all') {
      const currentTenant = tenants.find(t => t.id === effectiveTenantId);
      const isMatriz = currentTenant?.type === 'matriz';
      const tenantIdsToFetch = [effectiveTenantId];

      if (isMatriz) {
        const subsidiaryIds = tenants
          .filter(t => t.parentId === effectiveTenantId)
          .map(t => t.id);
        tenantIdsToFetch.push(...subsidiaryIds);
      }

      const allUsersFromTenants: Record<string, UserProfile[]> = {};
      let ownerUser: UserProfile | null = null;
      const unsubscribes: (() => void)[] = [];

      const updateCombinedUsers = () => {
        const allUsersMap = new Map<string, UserProfile>();
        
        // Adiciona o dono da empresa à lista, se encontrado
        if (ownerUser) {
            allUsersMap.set(ownerUser.id, ownerUser);
        }

        Object.values(allUsersFromTenants).flat().forEach(user => {
          if (!allUsersMap.has(user.id)) {
            allUsersMap.set(user.id, user);
          }
        });

        // Garante que o usuário atual apareça na lista se ele pertencer a uma das empresas listadas
        if (userProfile && user?.uid && !allUsersMap.has(user.uid)) {
            const isInFetchedTenants = tenantIdsToFetch.includes(userProfile.tenantId);
            if (isInFetchedTenants) {
                allUsersMap.set(user.uid, { id: user.uid, ...userProfile });
            }
        }

        let allUsers = Array.from(allUsersMap.values());

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          allUsers = allUsers.filter(u => 
            ((u as any).name || '').toLowerCase().includes(lower) || 
            (u.email || '').toLowerCase().includes(lower) || 
            ((u as any).login || '').toLowerCase().includes(lower)
          );
        }

        allUsers.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        
        setUsers(allUsers.slice(0, limitCount));
        setHasMore(allUsers.length > limitCount);
        setLoading(false);
        setLoadingMore(false);
      };

      // Busca o perfil do dono da empresa para garantir que ele apareça na lista
      if (currentTenant?.owner_id) {
          const ownerRef = ref(database, `profiles/${currentTenant.owner_id}`);
          const ownerUnsub = onValue(ownerRef, (snapshot) => {
              if (snapshot.exists()) {
                  ownerUser = { id: snapshot.key!, ...snapshot.val() };
                  updateCombinedUsers();
              }
          }, (error) => {
              console.warn("Não foi possível buscar o perfil do dono:", error);
          });
          unsubscribes.push(ownerUnsub);
      }

      tenantIdsToFetch.forEach(tenantId => {
        const profilesRef = ref(database, `tenants/${tenantId}/users`);
        const unsubscribe = onValue(profilesRef, (snapshot) => {
          const tenantUsers: UserProfile[] = [];
          if (snapshot.exists()) {
            snapshot.forEach((child) => {
              tenantUsers.push({ id: child.key!, ...child.val() });
            });
          }
          allUsersFromTenants[tenantId] = tenantUsers;
          updateCombinedUsers();
        }, (error) => {
          console.error(`Erro ao buscar usuários do tenant ${tenantId}:`, error);
          setError("Acesso negado: Você não tem permissão para listar estes usuários.");
          setLoading(false);
        });
        unsubscribes.push(unsubscribe);
      });

      return () => unsubscribes.forEach(unsub => unsub());
    }

    // Se for a visão "Todas as Empresas", busca de todos os tenants permitidos sem um listener global.
    // Isso evita o erro de "permission_denied" em /profiles.
    const fetchAllTenantUsers = async () => {
      if (userProfile.role !== 'admin' || tenants.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      try {
        const userPromises = tenants.map(t => get(ref(database, `tenants/${t.id}/users`)));
        const userSnapshots = await Promise.all(userPromises);

        const allUsersMap = new Map<string, UserProfile>();
        userSnapshots.forEach(snapshot => {
          if (snapshot.exists()) {
            snapshot.forEach(child => {
              if (!allUsersMap.has(child.key!)) {
                allUsersMap.set(child.key!, { id: child.key!, ...child.val() });
              }
            });
          }
        });

        // Garante que o usuário atual apareça na lista se ele pertencer a uma das empresas listadas
        if (userProfile && user?.uid && !allUsersMap.has(user.uid)) {
            const userTenantInList = tenants.some(t => t.id === userProfile.tenantId);
            if (userTenantInList) {
                allUsersMap.set(user.uid, { id: user.uid, ...userProfile });
            }
        }

        let allUsers = Array.from(allUsersMap.values());

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          allUsers = allUsers.filter(u => 
            ((u as any).name || '').toLowerCase().includes(lower) || 
            (u.email || '').toLowerCase().includes(lower) || 
            ((u as any).login || '').toLowerCase().includes(lower)
          );
        }

        allUsers.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

        setUsers(allUsers.slice(0, limitCount));
        setHasMore(allUsers.length > limitCount);
      } catch (e) {
        console.error("Erro ao buscar usuários de múltiplos tenants:", e);
        setError("Não foi possível carregar a lista de usuários agregada.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    fetchAllTenantUsers();
    return () => {}; // Nenhuma inscrição para limpar neste caminho
  }, [userProfile, activeTenantId, tenants, limitCount, searchTerm]);

  useEffect(() => {
    setLimitCount(ITEMS_PER_PAGE);
  }, [activeTenantId]);

  useEffect(() => {
    const fetchTenants = async () => {
      if (!user?.uid || !userProfile) return;
      try {
        let list: any[] = [];
        
        // Busca apenas as empresas que o usuário é dono (owner_id)
        const q = query(ref(database, 'tenants'), orderByChild('owner_id'), equalTo(user.uid));
        const snapshot = await get(q);
        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            list.push({ id: child.key!, ...child.val() });
          });
        }

        // Busca também empresas onde o usuário tem permissão explícita (allowedTenants)
        // @ts-ignore
        const allowedIds = userProfile.allowedTenants || [];
        if (Array.isArray(allowedIds) && allowedIds.length > 0) {
          const promises = allowedIds.map((id: string) => get(ref(database, `tenants/${id}`)));
          const snaps = await Promise.all(promises);
          snaps.forEach(snap => {
            if (snap.exists()) {
              if (!list.some(t => t.id === snap.key)) {
                list.push({ id: snap.key!, ...snap.val() });
              }
            }
          });
        }

        // Garante que a empresa do próprio usuário esteja na lista (para admins que não são donos)
        if (userProfile.tenantId && !list.some(t => t.id === userProfile.tenantId)) {
            const snap = await get(ref(database, `tenants/${userProfile.tenantId}`));
            if (snap.exists()) {
                list.push({ id: snap.key!, ...snap.val() });
            }
        }

        // Garante que a empresa ativa (selecionada) esteja na lista, caso não tenha sido carregada pelas regras anteriores
        if (activeTenantId && activeTenantId !== 'all' && !list.some(t => t.id === activeTenantId)) {
            const snap = await get(ref(database, `tenants/${activeTenantId}`));
            if (snap.exists()) {
                list.push({ id: snap.key!, ...snap.val() });
            }
        }

        // Busca filiais das empresas Matriz encontradas para garantir que os usuários delas apareçam na lista
        const matrizIds = list.filter(t => t.type === 'matriz').map(t => t.id);
        if (matrizIds.length > 0) {
            try {
                const filialPromises = matrizIds.map(mid => 
                    get(query(ref(database, 'tenants'), orderByChild('parentId'), equalTo(mid)))
                );
                const filialSnaps = await Promise.all(filialPromises);
                filialSnaps.forEach(snap => {
                    if (snap.exists()) {
                        snap.forEach(child => {
                            if (!list.some(t => t.id === child.key)) {
                                list.push({ id: child.key!, ...child.val() });
                            }
                        });
                    }
                });
            } catch (err) {
                console.error("Erro ao buscar filiais:", err);
            }
        }

        list.sort((a, b) => {
          if (a.type === 'matriz' && b.type !== 'matriz') return -1;
          if (a.type !== 'matriz' && b.type === 'matriz') return 1;
          return a.name.localeCompare(b.name);
        });

        setTenants(list);
        
        // Correção: Força a atualização da empresa selecionada quando o contexto muda
        if (activeTenantId && activeTenantId !== 'all' && list.some(t => t.id === activeTenantId)) {
           setSelectedTenants([activeTenantId]);
        } else {
           setSelectedTenants([]);
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

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setNewRole(user.role);
    setNewName((user as any).name || '');
    setNewLogin((user as any).login || '');
    setNewEmail(user.email || '');
    setNewPassword((user as any).password || '');
    // @ts-ignore
    setSelectedTenants(user.allowedTenants || (user.tenantId ? [user.tenantId] : []));
    // @ts-ignore
    setSelectedPages(user.allowedPages || []);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
  
    try {
      // Preserva dados imutáveis como created_at
      const updatedProfileData = {
        ...editingUser,
        name: newName,
        login: newLogin,
        email: newEmail,
        password: newPassword,
        role: newRole,
        allowedTenants: selectedTenants,
        allowedPages: selectedPages,
      };
  
      const oldTenants = editingUser.allowedTenants || [];
      const newTenants = selectedTenants;
      
      // Identifica de quais tenants o usuário foi removido
      const tenantsToRemoveFrom = oldTenants.filter((t: string) => !newTenants.includes(t));
  
      const multiPathUpdates: Record<string, any> = {};
      
      // Atualiza o perfil principal
      multiPathUpdates[`profiles/${editingUser.id}`] = updatedProfileData;
  
      // Adiciona/Atualiza o usuário nos tenants selecionados
      newTenants.forEach((tid: string) => {
        multiPathUpdates[`tenants/${tid}/users/${editingUser.id}`] = updatedProfileData;
      });
  
      // Remove o usuário dos tenants dos quais foi desassociado
      tenantsToRemoveFrom.forEach((tid: string) => {
        multiPathUpdates[`tenants/${tid}/users/${editingUser.id}`] = null;
      });
  
      await update(ref(database), multiPathUpdates);
  
      setShowEditModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err);
      alert('Erro ao atualizar usuário. Verifique suas permissões.');
    }
  };

  const handleDelete = async (userToDelete: UserProfile) => {
    if (userToDelete.id === user?.uid) {
      alert("Você não pode excluir seu próprio usuário.");
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir este usuário? Esta ação removerá o acesso do usuário ao sistema.')) return;
    try {
      // IMPORTANTE: Esta função remove o usuário apenas do Realtime Database.
      // Para uma exclusão completa, o usuário também precisa ser removido do serviço de "Authentication" do Firebase.
      // A remoção de outro usuário da Autenticação requer privilégios de administrador e deve ser feita
      // através de um backend seguro (ex: Firebase Cloud Function) usando o Firebase Admin SDK.
      const tenantsToDeleteFrom = userToDelete.allowedTenants || [];
      const updates: Record<string, any> = {};
      updates[`profiles/${userToDelete.id}`] = null;
      tenantsToDeleteFrom.forEach((tid: string) => {
        updates[`tenants/${tid}/users/${userToDelete.id}`] = null;
      });
      await update(ref(database), updates);
    } catch (err) {
      console.error('Erro ao excluir usuário:', err);
      alert('Erro ao excluir usuário. Verifique suas permissões.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userProfile) {
      setError("Erro: Perfil de usuário não encontrado.");
      return;
    }

    setLoading(true);
    setError('');

    let secondaryApp: FirebaseApp | undefined;

    try {
      secondaryApp = getApps().find(app => app.name === "Secondary");
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, "Secondary");
      }
      const secondaryAuth = getAuth(secondaryApp);

      let tenantsToSave = selectedTenants.length > 0 ? [...selectedTenants] : [];
      
      if (tenantsToSave.length === 0) {
        if (activeTenantId && activeTenantId !== 'all') {
          tenantsToSave = [activeTenantId];
        }
      }

      // Define a empresa principal (tenantId)
      let primaryTenantId = '';

      // REGRA: Se o usuário criador tem uma empresa vinculada (Admin), o novo usuário DEVE pertencer a ela.
      if (userProfile?.tenantId) {
        primaryTenantId = userProfile.tenantId;
      } else {
        // Lógica para Super Admin (sem tenantId fixo) ou fallback
        if (tenantsToSave.length > 0) primaryTenantId = tenantsToSave[0];
        
        if (activeTenantId && activeTenantId !== 'all' && tenantsToSave.includes(activeTenantId)) {
          primaryTenantId = activeTenantId;
        }
      }

      if (tenantsToSave.length === 0) throw new Error("Selecione pelo menos uma empresa.");
      if (!primaryTenantId) primaryTenantId = tenantsToSave[0];

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const newUserId = userCredential.user.uid;
      
      const newUserProfile = {
        name: newName,
        login: newLogin,
        email: newEmail,
        password: newPassword,
        tenantId: primaryTenantId,
        allowedTenants: tenantsToSave,
        allowedPages: selectedPages,
        role: newRole as 'admin' | 'operator' | 'viewer',
        created_at: new Date().toISOString()
      };

      await set(ref(database, `profiles/${newUserId}`), newUserProfile);

      // Adiciona o usuário também na coleção users dentro de cada tenant vinculado
      const updates: Record<string, any> = {};
      tenantsToSave.forEach(tid => {
        updates[`tenants/${tid}/users/${newUserId}`] = newUserProfile;
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }

      await signOut(secondaryAuth);

      const isVisible = tenantsToSave.some(id => {
        if (activeTenantId === 'all') return true;
        if (id === activeTenantId) return true;
        const activeTenant = tenants.find(t => t.id === activeTenantId);
        if (activeTenant?.type === 'matriz') {
           return tenants.some(t => t.id === id && t.parentId === activeTenantId);
        }
        return false;
      });

      if (!isVisible) {
        alert("Usuário criado com sucesso!\n\nNOTA: O usuário não aparece na lista agora porque você está visualizando uma empresa diferente da que foi vinculada a ele.");
      }

      setNewName('');
      setNewLogin('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('viewer');
      setSelectedTenants(activeTenantId ? [activeTenantId] : []);
      setSelectedPages([]);
      setIsRegistering(false);
      
    } catch (err: any) {
      console.error('Erro ao cadastrar usuário:', err);
      let msg = 'Erro ao cadastrar usuário.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este e-mail já está cadastrado no sistema.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'A senha é muito fraca.';
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

      {/* Barra de Busca */}
      <div className="mb-6 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar usuário por nome, login ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
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
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider">Data Cadastro</th>
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider">Senha</th>
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider">Perfil de Acesso</th>
                <th className="px-6 py-4 text-base font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="bg-gray-100 p-2 rounded-full mr-3">
                        <User className="w-6 h-6 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-xl font-medium text-gray-900">{(user as any)?.name || '---'}</p>
                        <p className="text-base text-gray-500">{(user as any)?.login || user.email || 'Sem e-mail'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xl text-gray-900">
                      {tenants.find(t => t.id === user.tenantId)?.name || '---'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-xl text-gray-500">
                      <Calendar className="w-5 h-5 mr-2" />
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '---'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xl text-gray-600 font-mono">{(user as any).password || '---'}</span>
                  </td>
                  <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-base font-medium ${
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
                          onClick={() => handleDelete(user)} 
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

      {/* Modal de Edição */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Editar Permissões: {editingUser.email}</h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome de Usuário</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
                  <input
                    type="text"
                    value={newLogin}
                    onChange={(e) => setNewLogin(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Nota: Alterar aqui não muda o login de acesso.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Apenas registro visual.</p>
                </div>
              </div>

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
