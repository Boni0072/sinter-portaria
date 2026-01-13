import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, ClipboardList, UserPlus, ChevronLeft, ChevronRight, Camera, Shield, ArrowRightLeft, Truck, BarChart3 } from 'lucide-react';
import RegisterEntry from './RegisterEntry';
import EntriesList from './EntriesList';
import UserManagement from './UserManagement';
import RegisterDriver from './RegisterDriver';
import DriversList from './DriversList';
import Indicators from './Indicators';

type View = 'entries' | 'register-entry' | 'drivers' | 'register-driver' | 'users' | 'indicators';

export default function Dashboard() {
  const { user, userProfile, signOut, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('indicators');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(localStorage.getItem('portal_custom_logo'));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canRegister = userProfile?.role === 'admin' || userProfile?.role === 'operator';
  const canManageUsers = userProfile?.role === 'admin';

  useEffect(() => {
    // Se a view atual for 'users' e o usuário não for admin, redireciona
    if (currentView === 'users' && !canManageUsers) {
      setCurrentView('indicators');
    }
    // Se a view for de registro e o usuário não tiver permissão, redireciona
    if ((currentView === 'register-entry' || currentView === 'register-driver') && !canRegister) {
      setCurrentView('indicators');
    }
  }, [currentView, canManageUsers, canRegister]);

  // Auto-correção: Garante que o usuário atual tenha um tenantId
  useEffect(() => {
    if (user && userProfile && !userProfile.tenantId) {
      const fixProfile = async () => {
        try {
          // Usa o próprio ID como tenantId (torna-se admin da própria conta)
          await updateDoc(doc(db, 'profiles', user.uid), {
            tenantId: user.uid,
            role: 'admin'
          });
          console.log('Perfil corrigido: Tenant ID adicionado.');
        } catch (err) {
          console.error('Erro ao corrigir perfil:', err);
        }
      };
      fixProfile();
    }
  }, [user, userProfile]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'entries':
        return <EntriesList />;
      case 'register-entry':
        if (!canRegister) return <div className="p-6 text-center text-red-600 bg-red-50 rounded-lg">Acesso não autorizado.</div>;
        return <RegisterEntry onSuccess={() => setCurrentView('indicators')} />;
      case 'drivers':
        return <DriversList />;
      case 'register-driver':
        if (!canRegister) return <div className="p-6 text-center text-red-600 bg-red-50 rounded-lg">Acesso não autorizado.</div>;
        return <RegisterDriver onSuccess={() => setCurrentView('drivers')} />;
      case 'users':
        if (!canManageUsers) {
          return <div className="p-6 text-center text-red-600 bg-red-50 rounded-lg">Acesso não autorizado.</div>;
        }
        return <UserManagement />;
      case 'indicators':
        return <Indicators />;
      default:
        return <Indicators />;
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
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-9 bg-blue-700 text-white p-1 rounded-full shadow-md hover:bg-blue-600 transition-colors z-20"
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

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
            <>
              <h1 className="text-xl font-bold text-white text-center whitespace-nowrap">
                Sistema de Portaria
              </h1>
              <p className="text-xs text-blue-200 mt-1">Controle de Acesso</p>
            </>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <button
            onClick={() => setCurrentView('indicators')}
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

          {canRegister && (
            <button
              onClick={() => setCurrentView('register-entry')}
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
          )}

          <button
            onClick={() => setCurrentView('entries')}
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

          {canRegister && (
            <button
              onClick={() => setCurrentView('register-driver')}
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
          )}

          <button
            onClick={() => setCurrentView('drivers')}
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

          {canManageUsers && (
            <button
              onClick={() => setCurrentView('users')}
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
          )}
        </nav>

        <div className="p-4 border-t border-blue-800 bg-blue-900">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} mb-3`}>
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {user?.email?.[0].toUpperCase()}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                <p className="text-xs text-blue-300 capitalize">
                  {userProfile?.role === 'admin' ? 'Administrador' : 
                   userProfile?.role === 'operator' ? 'Operador' : 'Visualizador'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={signOut}
            title={isSidebarCollapsed ? "Sair" : ""}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-center space-x-2'} px-4 py-2 text-red-200 bg-red-900/30 border border-red-900/50 rounded-lg hover:bg-red-900/50 hover:text-white transition text-sm`}
          >
            <LogOut className="w-4 h-4" />
            {!isSidebarCollapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} p-8 transition-all duration-300`}>
        <div className="bg-white rounded-xl shadow-sm p-6 min-h-full">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
