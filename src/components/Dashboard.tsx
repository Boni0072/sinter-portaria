import { useState, useRef, useEffect } from 'react';
import { auth, db } from './firebase';
import { getDatabase, ref, get, set, update, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, ClipboardList, UserPlus, ChevronLeft, ChevronRight, Camera, Shield, ArrowRightLeft, Truck, BarChart3, CarFront, Building2, LayoutGrid, AlertTriangle, Menu, Wifi } from 'lucide-react';
import RegisterEntry from './RegisterEntry';
import EntriesList from './EntriesList';
import UserManagement from './UserManagement';
import RegisterDriver from './RegisterDriver';
import DriversList from './DriversList';
import Indicators from './Indicators';
import RegisterVehicle from './RegisterVehicle';
import CompanySettings from './CompanySettings';
import RegisterOccurrence from './RegisterOccurrence';

type View = 'entries' | 'register-entry' | 'drivers' | 'register-driver' | 'users' | 'indicators' | 'register-vehicle' | 'company-settings' | 'register-occurrence';

interface Tenant {
  id: string;
  name: string;
  type?: 'matriz' | 'filial';
}

export default function Dashboard() {
  const { user, userProfile, signOut, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('indicators');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(localStorage.getItem('portal_custom_logo'));
  const [portalTitle, setPortalTitle] = useState(localStorage.getItem('portal_title') || 'Sistema de Portaria');
  const [portalSubtitle, setPortalSubtitle] = useState(localStorage.getItem('portal_subtitle') || 'Controle de Acesso');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOffline, setIsOffline] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const database = getDatabase(auth.app);

  const [sidebarHue, setSidebarHue] = useState<number>(() => {
    const saved = localStorage.getItem('portal_sidebar_hue');
    return saved ? parseInt(saved) : 220;
  });

  // Auto-correção: Garante que o usuário atual tenha um perfil e tenantId
  useEffect(() => {
    if (user && !loading) {
      const ensureProfile = async () => {
        try {
          const userRef = ref(database, `profiles/${user.uid}`);
          const userSnap = await get(userRef);

          if (!userSnap.exists()) {
            // Cria o perfil APENAS se ele realmente não existir no banco
            await set(userRef, {
              email: user.email,
              tenantId: user.uid,
              role: 'admin',
              created_at: new Date().toISOString()
            });
            console.log('Perfil criado automaticamente.');
          } else {
            // Se existir, verifica apenas se falta o tenantId (sem sobrescrever permissões)
            if (!userSnap.val().tenantId) {
              await update(userRef, { tenantId: user.uid });
              console.log('Perfil corrigido: Tenant ID adicionado.');
            }
          }
        } catch (err: any) {
          if (err.code === 'unavailable' || err.message?.includes('offline')) {
            console.warn('Verificação de perfil ignorada (Offline).');
            setIsOffline(true);
          } else {
            console.error('Erro ao verificar/criar perfil:', err);
          }
        }

        // Auto-criação: Garante que a coleção 'tenants' e o documento da empresa existam
        try {
          if (!user?.uid) return;
          const tenantRef = ref(database, `tenants/${user.uid}`);
          const tenantSnap = await get(tenantRef);
          
          // Só cria a estrutura da empresa se o usuário for o dono do perfil (tenantId == uid)
          // Isso evita criar empresas "fantasmas" para operadores/funcionários
          if (!tenantSnap.exists() && userProfile?.tenantId === user.uid) {
            await set(tenantRef, {
              name: 'Minha Empresa',
              type: 'matriz',
              created_at: new Date().toISOString(),
              owner_id: user.uid,
              email: user.email,
              created_by: user.uid // Adicionado para consistência
            });
            console.log('Estrutura da empresa (tenants) criada com sucesso.');
          }
        } catch (err: any) {
          if (err.code === 'unavailable' || err.message?.includes('offline')) {
            console.warn('Criação de empresa ignorada (Offline).');
            setIsOffline(true);
          } else {
            console.error('Erro ao criar estrutura da empresa:', err);
          }
        }
      };
      ensureProfile();
    }
    // OTIMIZAÇÃO: Removido userProfile e retryCount das dependências para evitar loops de verificação
    // A verificação de existência só precisa rodar quando o objeto 'user' (auth) muda.
  }, [user, loading]);

  // Carregar lista de empresas (Matriz + Filiais)
  useEffect(() => {
    const myTenantId = userProfile?.tenantId || user?.uid;
    if (!myTenantId) return;

    const tenantsRef = ref(database, 'tenants');
    let q;

    // Se for admin/dono, busca todas as empresas que ele é dono (Matrizes e Filiais)
    if (userProfile?.role === 'admin') {
       q = query(tenantsRef, orderByChild('owner_id'), equalTo(user.uid));
    } else {
       // Se não for admin, mantém a lógica de buscar filiais da empresa vinculada
       q = query(tenantsRef, orderByChild('parentId'), equalTo(myTenantId));
    }

    const unsubscribe = onValue(q, (snapshot) => {
      const loadedTenants: Tenant[] = [];
      
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          loadedTenants.push({
            id: child.key!,
            name: child.val().name,
            type: child.val().type
          });
        });
      }

      // Para não-admins, precisamos garantir que a própria empresa (myTenantId) esteja na lista
      // já que a query acima buscou apenas os filhos (parentId)
      if (userProfile?.role !== 'admin') {
         get(ref(database, `tenants/${myTenantId}`)).then(snap => {
            if (snap.exists() && !loadedTenants.find(t => t.id === myTenantId)) {
               setAvailableTenants(prev => {
                 if (prev.find(t => t.id === myTenantId)) return prev;
                 return [{ id: snap.key!, name: snap.val().name, type: snap.val().type }, ...prev];
               });
            }
         });
      }

      // Filtragem de segurança extra (allowedTenants)
      let finalTenants = loadedTenants;
      // @ts-ignore
      if (userProfile?.allowedTenants && userProfile.allowedTenants.length > 0) {
         // @ts-ignore
         finalTenants = finalTenants.filter(t => userProfile.allowedTenants.includes(t.id));
      }

      setAvailableTenants(finalTenants);

      // Seleção inicial inteligente
      if (!selectedTenantId && finalTenants.length > 0) {
         if (finalTenants.length > 1) {
            setSelectedTenantId('all');
         } else {
            setSelectedTenantId(finalTenants[0].id);
         }
      }
    });

    return () => unsubscribe();
  }, [user, userProfile]); // Removido currentView para evitar recarregamentos desnecessários

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCustomLogo(base64String);
        localStorage.setItem('portal_custom_logo', base64String);
      };
      reader.readAsDataURL(file);
    }
  };


  // Função auxiliar para verificar permissão de página
  const canAccess = (pageId: string) => {
    // @ts-ignore
    const allowed = userProfile?.allowedPages;
    
    // Normaliza para array se for string (correção de legado)
    const pagesList = Array.isArray(allowed) ? allowed : (typeof allowed === 'string' ? [allowed] : []);

    // 1. Se houver uma lista de páginas permitidas, ela tem prioridade (mesmo sobre admin)
    if (pagesList.length > 0) {
      return pagesList.includes(pageId);
    }

    // 2. Admins têm acesso a tudo (fallback se não houver páginas específicas definidas).
    if (userProfile?.role === 'admin') {
      return true;
    }

    // 3. Se não for admin e não houver lista, nega o acesso por padrão.
    return false;
  };

  // Efeito para redirecionar caso a view atual não seja permitida
  useEffect(() => {
    if (!loading && userProfile) {
      if (!canAccess(currentView)) {
        const allViews: View[] = ['indicators', 'register-entry', 'entries', 'register-driver', 'drivers', 'register-vehicle', 'users', 'company-settings', 'register-occurrence'];
        const firstAllowed = allViews.find(v => canAccess(v));
        
        if (firstAllowed) {
          setCurrentView(firstAllowed);
        }
      }
    }
  }, [userProfile, loading, currentView]);

  // Função de emergência para recriar dados se o carregamento falhar
  const handleManualRepair = async () => {
    if (!user) return;
    try {
      // Cria perfil
      await set(ref(database, `profiles/${user.uid}`), {
        email: user.email,
        tenantId: user.uid,
        role: 'admin',
        created_at: new Date().toISOString()
      });
      
      // Cria empresa
      await set(ref(database, `tenants/${user.uid}`), {
        name: 'Minha Empresa (Recuperada)',
        type: 'matriz',
        owner_id: user.uid,
        email: user.email,
        created_at: new Date().toISOString(),
        created_by: user.uid // Adicionado para consistência
      });
      
      window.location.reload();
    } catch (e) {
      alert("Erro ao reparar: " + e);
    }
  };

  // Proteção para garantir que o perfil do usuário esteja carregado antes de renderizar
  if (loading || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          {isOffline ? (
            <>
              <Wifi className="w-12 h-12 text-red-500" />
              <p className="text-gray-600 font-medium text-center">
                Sem conexão com o banco de dados.<br/>
                Verifique sua internet ou firewall.
              </p>
              <button 
                onClick={() => { setIsOffline(false); setRetryCount(c => c + 1); }}
                className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                Tentar Novamente
              </button>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
              <p className="text-gray-500 font-medium">Carregando perfil...</p>
            </>
          )}
          <button 
            onClick={() => signOut()} 
            className="text-sm text-blue-600 hover:underline mt-2"
          >
            Demorando muito? Clique para Sair
          </button>
          <button 
            onClick={handleManualRepair} 
            className="text-xs text-gray-400 hover:text-gray-600 mt-4 border border-gray-300 px-2 py-1 rounded"
          >
            Reparar Dados (Criar Empresa/Usuário)
          </button>
        </div>
      </div>
    );
  }

  const commonProps = {
    tenantId: selectedTenantId || userProfile?.tenantId || user?.uid
  };

  const renderView = () => {
    switch (currentView) {
      case 'entries':
        // @ts-ignore
        return <EntriesList {...commonProps} />;
      case 'register-entry':
        // @ts-ignore
        return <RegisterEntry onSuccess={() => setCurrentView('entries')} {...commonProps} />;
      case 'drivers':
        // @ts-ignore
        return <DriversList {...commonProps} />;
      case 'register-driver':
        return <RegisterDriver onSuccess={() => setCurrentView('drivers')} {...commonProps} />;
      case 'register-vehicle':
        // @ts-ignore
        return <RegisterVehicle onSuccess={() => setCurrentView('indicators')} {...commonProps} />;
      case 'users':
        return <UserManagement {...commonProps} />;
      case 'company-settings':
        return <CompanySettings {...commonProps} />;
      case 'indicators':
        return <Indicators {...commonProps} />;
      case 'register-occurrence':
        // @ts-ignore
        return <RegisterOccurrence onSuccess={() => setCurrentView('indicators')} {...commonProps} />;
      default:
        return <Indicators {...commonProps} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } text-white transition-all duration-300 fixed h-full z-10 flex flex-col shadow-xl`}
        style={{ backgroundColor: `hsl(${sidebarHue}, 65%, 20%)` }}
      >
        <div className={`p-6 flex flex-col items-center border-b ${isSidebarCollapsed ? 'px-2' : ''}`} style={{ borderColor: `hsl(${sidebarHue}, 65%, 30%)` }}>
          <div 
            className="bg-white/10 p-3 rounded-xl mb-3 shadow-lg backdrop-blur-sm relative group cursor-pointer overflow-hidden"
            onClick={() => fileInputRef.current?.click()}
            title="Clique para alterar o logo"
          >
            {customLogo ? (
              <img src={customLogo} alt="Logo" className={`${isSidebarCollapsed ? 'w-10 h-10' : 'w-20 h-20'} object-contain transition-all duration-300`} />
            ) : (
              <ClipboardList className={`${isSidebarCollapsed ? 'w-10 h-10' : 'w-20 h-20'} text-white transition-all duration-300`} />
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
          {!isSidebarCollapsed && (
            <div className="w-full text-center">
              {isEditingTitle ? (
                <div className="flex flex-col gap-2 mt-2 animate-in fade-in duration-200">
                  <input
                    type="text"
                    value={portalTitle}
                    onChange={(e) => setPortalTitle(e.target.value)}
                    className="w-full px-2 py-1 text-sm text-gray-900 rounded border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Título do Sistema"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={portalSubtitle}
                    onChange={(e) => setPortalSubtitle(e.target.value)}
                    className="w-full px-2 py-1 text-xs text-gray-900 rounded border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Subtítulo"
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('portal_title', portalTitle);
                      localStorage.setItem('portal_subtitle', portalSubtitle);
                      setIsEditingTitle(false);
                    }}
                    className="w-full py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <div 
                  onClick={() => setIsEditingTitle(true)}
                  className="cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors group"
                  title="Clique para editar título"
                >
                  <h1 className="text-xl font-bold text-white whitespace-nowrap">
                    {portalTitle}
                  </h1>
                  <p className="text-xs text-white/60 mt-1 group-hover:text-white transition-colors">
                    {portalSubtitle}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {canAccess('indicators') && (
          <button
            onClick={() => setCurrentView('indicators')}
            title={isSidebarCollapsed ? "Indicadores" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'indicators'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'indicators' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <BarChart3 className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Indicadores</span>}
          </button>
          )}

          {canAccess('register-entry') && (
          <button
            onClick={() => setCurrentView('register-entry')}
            title={isSidebarCollapsed ? "Registrar Entrada" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-entry'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'register-entry' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <ArrowRightLeft className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Registrar Entrada</span>}
          </button>
          )}

          {canAccess('register-occurrence') && (
          <button
            onClick={() => setCurrentView('register-occurrence')}
            title={isSidebarCollapsed ? "Registrar Ocorrência" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-occurrence'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'register-occurrence' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <AlertTriangle className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Registrar Ocorrência</span>}
          </button>
          )}

          {canAccess('entries') && (
          <button
            onClick={() => setCurrentView('entries')}
            title={isSidebarCollapsed ? "Ver Registros" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'entries'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'entries' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <Truck className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Ver Registros</span>}
          </button>
          )}

          {canAccess('register-driver') && (
          <button
            onClick={() => setCurrentView('register-driver')}
            title={isSidebarCollapsed ? "Cadastrar Motorista" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-driver'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'register-driver' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <UserPlus className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Cadastrar Motorista</span>}
          </button>
          )}

          {canAccess('drivers') && (
          <button
            onClick={() => setCurrentView('drivers')}
            title={isSidebarCollapsed ? "Ver Motoristas" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'drivers'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'drivers' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <Users className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Ver Motoristas</span>}
          </button>
          )}

          {canAccess('register-vehicle') && (
          <button
            onClick={() => setCurrentView('register-vehicle')}
            title={isSidebarCollapsed ? "Cadastrar Veículo" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-vehicle'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'register-vehicle' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <CarFront className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Cadastrar Veículo</span>}
          </button>
          )}

          {canAccess('company-settings') && (
          <button
            onClick={() => setCurrentView('company-settings')}
            title={isSidebarCollapsed ? "Minha Empresa" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'company-settings'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'company-settings' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <Building2 className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Minha Empresa</span>}
          </button>
          )}

          {canAccess('users') && (
          <button
            onClick={() => setCurrentView('users')}
            title={isSidebarCollapsed ? "Gerenciar Usuários" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'users'
                ? 'text-white font-medium shadow-inner'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            style={{ backgroundColor: currentView === 'users' ? `hsl(${sidebarHue}, 65%, 30%)` : 'transparent' }}
          >
            <Shield className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Usuários</span>}
          </button>
          )}
        </nav>

        {!isSidebarCollapsed && (
          <div className="p-4 border-t" style={{ borderColor: `hsl(${sidebarHue}, 65%, 30%)` }}>
            <div className="px-2">
               <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-0 block">Cor do Menu</label>
               <input 
                 type="range" 
                 min="0" 
                 max="360" 
                 value={sidebarHue} 
                 onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSidebarHue(val);
                    localStorage.setItem('portal_sidebar_hue', val.toString());
                 }}
                 className="w-full h-1.5 bg-black/20 rounded-lg appearance-none cursor-pointer accent-white"
               />
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} transition-all duration-300 min-h-screen`}>
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
              >
                <Menu className="w-6 h-6" />
              </button>

              {availableTenants.length > 0 && (
                <div className="hidden md:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer outline-none min-w-[150px]"
                    disabled={availableTenants.length === 1}
                  >
                    {availableTenants.length > 1 && <option value="all">Todas as Empresas</option>}
                    {availableTenants.map(tenant => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-700">{user?.email}</p>
                  <p className="text-xs text-gray-500 capitalize">
                    {userProfile?.role === 'admin' ? 'Administrador' : 
                     userProfile?.role === 'operator' ? 'Operador' : 'Visualizador'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm border-2 border-blue-100">
                  {user?.email?.[0].toUpperCase()}
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200 mx-2"></div>
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                title="Sair do Sistema"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">Sair</span>
              </button>
            </div>
        </header>

        {/* Content */}
        <main className="p-8 flex-1 bg-gray-50">
          <div className="bg-white rounded-xl shadow-sm p-6 min-h-full">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
