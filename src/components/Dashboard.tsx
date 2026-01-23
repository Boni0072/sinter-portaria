import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, updateDoc, setDoc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, ClipboardList, UserPlus, ChevronLeft, ChevronRight, Camera, Shield, ArrowRightLeft, Truck, BarChart3, CarFront, Building2, LayoutGrid, AlertTriangle, Menu } from 'lucide-react';
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

  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');

  const [sidebarHue, setSidebarHue] = useState<number>(() => {
    const saved = localStorage.getItem('portal_sidebar_hue');
    return saved ? parseInt(saved) : 220;
  });

  // Auto-correção: Garante que o usuário atual tenha um perfil e tenantId
  useEffect(() => {
    if (user && !loading) {
      const ensureProfile = async () => {
        try {
          const userRef = doc(db, 'profiles', user.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            // Cria o perfil APENAS se ele realmente não existir no banco
            await setDoc(userRef, {
              email: user.email,
              tenantId: user.uid,
              role: 'admin',
              created_at: new Date().toISOString()
            });
            console.log('Perfil criado automaticamente.');
          } else {
            // Se existir, verifica apenas se falta o tenantId (sem sobrescrever permissões)
            if (!userSnap.data().tenantId) {
              await updateDoc(userRef, { tenantId: user.uid });
              console.log('Perfil corrigido: Tenant ID adicionado.');
            }
          }
        } catch (err) {
          console.error('Erro ao verificar/criar perfil:', err);
        }

        // Auto-criação: Garante que a coleção 'tenants' e o documento da empresa existam
        try {
          if (!user?.uid) return;
          const tenantRef = doc(db, 'tenants', user.uid);
          const tenantSnap = await getDoc(tenantRef);
          
          // Só cria a estrutura da empresa se o usuário for o dono do perfil (tenantId == uid)
          // Isso evita criar empresas "fantasmas" para operadores/funcionários
          if (!tenantSnap.exists() && userProfile?.tenantId === user.uid) {
            await setDoc(tenantRef, {
              name: 'Minha Empresa',
              type: 'matriz',
              created_at: new Date().toISOString(),
              owner_id: user.uid,
              email: user.email
            });
            console.log('Estrutura da empresa (tenants) criada com sucesso.');
          }
        } catch (err) {
          console.error('Erro ao criar estrutura da empresa:', err);
        }
      };
      ensureProfile();
    }
  }, [user, loading]);

  // Carregar lista de empresas (Matriz + Filiais)
  useEffect(() => {
    const myTenantId = userProfile?.tenantId || user?.uid;
    if (!myTenantId) return;

    let unsubscribeFiliais: () => void;

    // 1. Monitora a empresa atual (Matriz ou Filial)
    const unsubscribeMyTenant = onSnapshot(doc(db, 'tenants', myTenantId), (docSnap) => {
      if (docSnap.exists()) {
        const myData = docSnap.data();
        const myTenant: Tenant = { id: myTenantId, name: myData.name || 'Minha Empresa', type: myData.type || 'matriz' };

        // SEMPRE busca por filiais vinculadas. Se existirem, mostramos no menu.
        // Isso corrige o problema onde marcar a empresa como "Filial" escondia as sub-unidades.
        const q = query(collection(db, 'tenants'), where('parentId', '==', myTenantId));
        
        if (unsubscribeFiliais) unsubscribeFiliais();
        
        unsubscribeFiliais = onSnapshot(q, (snapshot) => {
          const filiais = snapshot.docs.map(d => ({ 
            id: d.id, 
            name: d.data().name, 
            type: 'filial' as const 
          }));

          // Se tiver filiais, ou se não for explicitamente uma filial sem filhos, mostra a lista
          if (filiais.length > 0 || myData.type !== 'filial') {
            let all = [myTenant, ...filiais];
            
            // Filtrar por permissão do usuário (se não for admin ou se tiver restrições explícitas)
            // @ts-ignore
            if (userProfile?.allowedTenants && userProfile.allowedTenants.length > 0) {
               // @ts-ignore
               all = all.filter(t => userProfile.allowedTenants.includes(t.id));
            }
            setAvailableTenants(all);
          } else {
            setAvailableTenants([myTenant]);
          }

          // Mantém a seleção atual se válida, senão seleciona a matriz
          if (!selectedTenantId || (selectedTenantId !== myTenantId && !filiais.find(f => f.id === selectedTenantId))) {
              setSelectedTenantId(myTenantId);
          }
        });
      }
    });

    return () => {
      unsubscribeMyTenant();
      if (unsubscribeFiliais) unsubscribeFiliais();
    };
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
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
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
              <Menu className="w-6 h-6" />
            </button>

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
