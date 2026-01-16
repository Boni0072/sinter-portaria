import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, updateDoc, setDoc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, ClipboardList, UserPlus, ChevronLeft, ChevronRight, Camera, Shield, ArrowRightLeft, Truck, BarChart3, CarFront, Building2, LayoutGrid, AlertTriangle } from 'lucide-react';
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
  const [showIntro, setShowIntro] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');

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

  const handleStartIntro = () => {
    setVideoPlaying(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(err => console.error("Erro ao reproduzir vídeo:", err));
        try {
            if (videoRef.current.requestFullscreen) {
                videoRef.current.requestFullscreen();
            }
        } catch (e) {
            console.log("Fullscreen bloqueado ou não suportado");
        }
      }
    }, 100);
  };

  const handleIntroEnd = () => {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    setShowIntro(false);
    sessionStorage.setItem('intro_seen', 'true');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    );
  }

  if (showIntro) {
    return (
        <div className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col items-center justify-center">
            {!videoPlaying ? (
                <div className="text-center animate-in fade-in zoom-in duration-500 p-8">
                    {customLogo && (
                        <img 
                            src={customLogo} 
                            alt="Logo" 
                            className="w-32 h-32 object-contain mx-auto mb-8 drop-shadow-2xl" 
                        />
                    )}
                    <h1 className="text-4xl font-bold text-white mb-2">{portalTitle}</h1>
                    <p className="text-blue-200 text-lg mb-12">{portalSubtitle}</p>
                    
                    <button 
                        onClick={handleStartIntro}
                        className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold rounded-full transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.5)] flex items-center gap-3 mx-auto overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <span className="relative">Entrar no Sistema</span>
                        <ChevronRight className="w-6 h-6 relative group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            ) : (
                <div className="w-full h-full bg-black relative">
                    <video 
                        ref={videoRef}
                        src="/video.mp4" 
                        className="w-full h-full object-contain"
                        onEnded={handleIntroEnd}
                        playsInline
                        autoPlay
                    >
                        <source src="/video.mp4" type="video/mp4" />
                        Seu navegador não suporta a tag de vídeo.
                    </video>
                    <button 
                        onClick={handleIntroEnd}
                        className="absolute top-8 right-8 text-white/50 hover:text-white border border-white/30 hover:border-white rounded-full px-6 py-2 text-sm transition-all z-50 backdrop-blur-sm hover:bg-white/10"
                    >
                        Pular
                    </button>
                </div>
            )}
        </div>
    );
  }

  const commonProps = {
    tenantId: selectedTenantId || userProfile?.tenantId || user?.uid
  };

  // Função auxiliar para verificar permissão de página
  const canAccess = (pageId: string) => {
    // @ts-ignore
    if (userProfile?.allowedPages && userProfile.allowedPages.length > 0) {
      // @ts-ignore
      return userProfile.allowedPages.includes(pageId);
    }
    return true; // Se não tiver restrições definidas, permite tudo (comportamento padrão)
  };

  const renderView = () => {
    switch (currentView) {
      case 'entries':
        // @ts-ignore
        return <EntriesList {...commonProps} />;
      case 'register-entry':
        // @ts-ignore
        return <RegisterEntry onSuccess={() => setCurrentView('indicators')} {...commonProps} />;
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
        } bg-blue-900 text-white transition-all duration-300 fixed h-full z-10 flex flex-col shadow-xl`}
      >
        <div className={`p-6 flex flex-col items-center border-b border-blue-800 ${isSidebarCollapsed ? 'px-2' : ''}`}>
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
                  <p className="text-xs text-blue-200 mt-1 group-hover:text-white transition-colors">
                    {portalSubtitle}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <button
            onClick={() => setCurrentView('indicators')}
            style={{ display: canAccess('indicators') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Indicadores" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'indicators'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <BarChart3 className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Indicadores</span>}
          </button>

          <button
            onClick={() => setCurrentView('register-entry')}
            style={{ display: canAccess('register-entry') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Registrar Entrada" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-entry'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <ArrowRightLeft className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Registrar Entrada</span>}
          </button>

          <button
            onClick={() => setCurrentView('register-occurrence')}
            style={{ display: canAccess('register-occurrence') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Registrar Ocorrência" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-occurrence'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Registrar Ocorrência</span>}
          </button>

          <button
            onClick={() => setCurrentView('entries')}
            style={{ display: canAccess('entries') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Ver Registros" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'entries'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <Truck className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Ver Registros</span>}
          </button>

          <button
            onClick={() => setCurrentView('register-driver')}
            style={{ display: canAccess('register-driver') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Cadastrar Motorista" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-driver'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <UserPlus className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Cadastrar Motorista</span>}
          </button>

          <button
            onClick={() => setCurrentView('drivers')}
            style={{ display: canAccess('drivers') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Ver Motoristas" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'drivers'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Ver Motoristas</span>}
          </button>

          <button
            onClick={() => setCurrentView('register-vehicle')}
            style={{ display: canAccess('register-vehicle') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Cadastrar Veículo" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'register-vehicle'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <CarFront className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Cadastrar Veículo</span>}
          </button>

          <button
            onClick={() => setCurrentView('company-settings')}
            style={{ display: canAccess('company-settings') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Minha Empresa" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'company-settings'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <Building2 className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Minha Empresa</span>}
          </button>

          <button
            onClick={() => setCurrentView('users')}
            style={{ display: canAccess('users') ? 'flex' : 'none' }}
            title={isSidebarCollapsed ? "Gerenciar Usuários" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition ${
              currentView === 'users'
                ? 'bg-blue-800 text-white font-medium shadow-inner'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <Shield className="w-5 h-5 min-w-[1.25rem]" />
            {!isSidebarCollapsed && <span>Usuários</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-blue-800">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-2 rounded-lg text-blue-200 hover:bg-blue-800 hover:text-white transition-colors`}
            title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!isSidebarCollapsed && <span>Recolher Menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} transition-all duration-300 min-h-screen`}>
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-8 shadow-sm sticky top-0 z-10">
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
