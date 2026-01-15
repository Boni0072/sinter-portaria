import { useState } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { User, Save, Check, AlertCircle, Loader2, Search } from 'lucide-react';

export default function RegisterUser() {
  const [uid, setUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [allowedPages, setAllowedPages] = useState<string[]>([]);

  const availablePages = [
    { id: 'register_entry', label: 'Registrar Entrada' },
    { id: 'view_records', label: 'Ver Registros' },
    { id: 'dashboard', label: 'Indicadores' },
    { id: 'users', label: 'Usuários' },
    { id: 'drivers', label: 'Motoristas' },
    { id: 'vehicles', label: 'Veículos' }
  ];

  const togglePage = (pageId: string) => {
    setAllowedPages(prev => 
      prev.includes(pageId) 
        ? prev.filter(p => p !== pageId)
        : [...prev, pageId]
    );
  };

  const loadUser = async () => {
    if (!uid) return;
    setLoading(true);
    setStatus(null);
    try {
      const docSnap = await getDoc(doc(db, 'profiles', uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        let pages = data.allowedPages || [];
        // Correção automática: se for string, converte para array
        if (typeof pages === 'string') pages = [pages];
        setAllowedPages(pages);
        setStatus({ type: 'success', text: 'Dados carregados com sucesso!' });
      } else {
        setStatus({ type: 'error', text: 'Usuário não encontrado.' });
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', text: 'Erro ao carregar usuário.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    
    setLoading(true);
    setStatus(null);

    try {
      const userRef = doc(db, 'profiles', uid);
      
      // IMPORTANTE: Usamos { merge: true } para atualizar apenas os campos especificados
      // sem sobrescrever outros dados do usuário (como nome, email, foto, etc)
      await setDoc(userRef, {
        allowedPages: allowedPages,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setStatus({ type: 'success', text: 'Permissões salvas com sucesso!' });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', text: 'Erro ao salvar permissões.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-200 mt-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <User className="w-6 h-6 text-blue-600" />
        Gerenciar Permissões
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">UID do Usuário (Firebase)</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={uid}
              onChange={e => setUid(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Ex: 5T7x..."
            />
            <button 
              type="button"
              onClick={loadUser}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Buscar
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Páginas Permitidas</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availablePages.map(page => (
              <label key={page.id} className={`
                flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all
                ${allowedPages.includes(page.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-200'}
              `}>
                <input 
                  type="checkbox"
                  checked={allowedPages.includes(page.id)}
                  onChange={() => togglePage(page.id)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-gray-700 font-medium">{page.label}</span>
              </label>
            ))}
          </div>
        </div>

        {status && (
          <div className={`p-4 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
            status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
          }`}>
            {status.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {status.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading || !uid}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors shadow-sm hover:shadow"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Alterações
        </button>
      </div>
    </div>
  );
}