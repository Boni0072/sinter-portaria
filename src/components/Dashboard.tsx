import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Users, Car, ClipboardList, UserPlus, CarFront } from 'lucide-react';
import DriversList from './DriversList';
import RegisterDriver from './RegisterDriver';
import RegisterEntry from './RegisterEntry';
import EntriesList from './EntriesList';

type View = 'entries' | 'register-entry' | 'drivers' | 'register-driver';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<View>('entries');

  const renderView = () => {
    switch (currentView) {
      case 'entries':
        return <EntriesList />;
      case 'register-entry':
        return <RegisterEntry onSuccess={() => setCurrentView('entries')} />;
      case 'drivers':
        return <DriversList />;
      case 'register-driver':
        return <RegisterDriver onSuccess={() => setCurrentView('drivers')} />;
      default:
        return <EntriesList />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-800">
                Sistema de Portaria
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <button
                onClick={signOut}
                className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => setCurrentView('register-entry')}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border-2 border-transparent hover:border-blue-500"
          >
            <CarFront className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="font-semibold text-gray-800">Registrar Entrada/Saída</h3>
            <p className="text-sm text-gray-600 mt-1">Registrar movimentação de veículos</p>
          </button>

          <button
            onClick={() => setCurrentView('entries')}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border-2 border-transparent hover:border-blue-500"
          >
            <Car className="w-8 h-8 text-green-600 mb-3" />
            <h3 className="font-semibold text-gray-800">Ver Registros</h3>
            <p className="text-sm text-gray-600 mt-1">Histórico de entradas e saídas</p>
          </button>

          <button
            onClick={() => setCurrentView('register-driver')}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border-2 border-transparent hover:border-blue-500"
          >
            <UserPlus className="w-8 h-8 text-orange-600 mb-3" />
            <h3 className="font-semibold text-gray-800">Cadastrar Motorista</h3>
            <p className="text-sm text-gray-600 mt-1">Adicionar novo motorista</p>
          </button>

          <button
            onClick={() => setCurrentView('drivers')}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition border-2 border-transparent hover:border-blue-500"
          >
            <Users className="w-8 h-8 text-slate-600 mb-3" />
            <h3 className="font-semibold text-gray-800">Ver Motoristas</h3>
            <p className="text-sm text-gray-600 mt-1">Lista de motoristas cadastrados</p>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          {renderView()}
        </div>
      </div>
    </div>
  );
}
