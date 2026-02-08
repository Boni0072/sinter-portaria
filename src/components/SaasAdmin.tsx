import { useState, useEffect } from 'react';
import { auth, firebaseConfig } from './firebase';
import { getDatabase, ref, set, onValue, update, remove } from 'firebase/database';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Save, UserPlus, Mail, Lock, Check, AlertCircle, Loader2, Edit2, Trash2, X } from 'lucide-react';

export default function SaasAdmin() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  
  const database = getDatabase(auth.app);

  useEffect(() => {
    const tenantsRef = ref(database, 'tenants');
    const unsubscribe = onValue(tenantsRef, (snapshot) => {
      const data: any[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          data.push({ id: child.key, ...child.val() });
        });
      }
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTenantsList(data);
    });
    return () => unsubscribe();
  }, [database]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    let secondaryApp: FirebaseApp | undefined;

    try {
      // Inicializa app secundário para não deslogar o admin atual
      secondaryApp = getApps().find(app => app.name === "SaasSecondary");
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, "SaasSecondary");
      }
      const secondaryAuth = getAuth(secondaryApp);

      // Cria o usuário no Authentication
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCredential.user.uid;

      // 1. Cria o Perfil do Administrador da Empresa
      await set(ref(database, `profiles/${uid}`), {
        email: email,
        tenantId: uid, // O ID da empresa será o próprio UID do dono
        password: password,
        role: 'admin',
        created_at: new Date().toISOString()
      });

      // 2. Cria a Empresa (Tenant)
      await set(ref(database, `tenants/${uid}`), {
        name: companyName,
        type: 'matriz',
        owner_id: uid,
        email: email,
        password: password,
        created_at: new Date().toISOString(),
        created_by: user?.uid // Rastreabilidade: Criado pelo Admin SaaS
      });

      await signOut(secondaryAuth);

      setStatus({ type: 'success', text: `Empresa "${companyName}" e administrador criados com sucesso!` });
      setCompanyName('');
      setEmail('');
      setPassword('');
      
    } catch (err: any) {
      console.error('Erro ao criar empresa:', err);
      let msg = 'Erro ao criar empresa.';
      if (err.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso.';
      if (err.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
      setStatus({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (tenant: any) => {
    setEditingTenant(tenant);
    setEditName(tenant.name);
    setEditEmail(tenant.email);
    setEditPassword(tenant.password || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTenant) return;
    try {
      await update(ref(database, `tenants/${editingTenant.id}`), {
        name: editName,
        email: editEmail,
        password: editPassword
      });
      // Atualiza também o email no perfil para manter consistência visual
      await update(ref(database, `profiles/${editingTenant.id}`), {
        email: editEmail
      });
      setIsEditModalOpen(false);
      setEditingTenant(null);
    } catch (e) {
      console.error("Erro ao atualizar empresa", e);
      alert("Erro ao atualizar empresa.");
    }
  };

  const handleDeleteTenant = async (id: string) => {
      if(window.confirm("Tem certeza que deseja excluir esta empresa? Isso removerá os dados do banco, mas o usuário de autenticação permanecerá ativo.")){
          try {
              await remove(ref(database, `tenants/${id}`));
              await remove(ref(database, `profiles/${id}`));
          } catch(e) {
              console.error(e);
              alert("Erro ao excluir.");
          }
      }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-10">
        <div className="p-4 bg-purple-100 rounded-xl">
          <Building2 className="w-10 h-10 text-purple-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Painel do Administrador SaaS</h2>
          <p className="text-lg text-gray-500">Cadastrar novas empresas e administradores</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h3 className="text-xl font-bold text-gray-800 mb-8 flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-blue-600" />
          Novo Cliente (Empresa)
        </h3>

        <form onSubmit={handleRegister} className="space-y-8">
          <div>
            <label className="block text-base font-semibold text-gray-700 mb-2">Nome da Empresa</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full pl-12 pr-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Ex: Transportadora Silva"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-base font-semibold text-gray-700 mb-2">E-mail do Administrador</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="admin@empresa.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-base font-semibold text-gray-700 mb-2">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  type="text" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
              </div>
            </div>
          </div>

          {status && (
            <div className={`p-4 rounded-xl flex items-center gap-3 text-base ${
              status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {status.type === 'success' ? <Check className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              {status.text}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-3 px-8 py-4 bg-purple-600 text-white text-lg font-medium rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
              <span>Cadastrar Empresa</span>
            </button>
          </div>
        </form>
      </div>

      <div className="mt-10 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-8 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Empresas Cadastradas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-8 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Empresa</th>
                <th className="px-8 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Admin Email</th>
                <th className="px-8 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Senha</th>
                <th className="px-8 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider">Data Cadastro</th>
                <th className="px-8 py-4 text-sm font-bold text-gray-600 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tenantsList.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-5 text-base text-gray-900 font-semibold">{tenant.name}</td>
                  <td className="px-8 py-5 text-base text-gray-600">{tenant.email}</td>
                  <td className="px-8 py-5 text-base text-gray-600 font-mono">{tenant.password || '---'}</td>
                  <td className="px-8 py-5 text-base text-gray-600">{tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-8 py-5 text-right">
                     <div className="flex items-center justify-end gap-3">
                        <button onClick={() => handleEditClick(tenant)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Editar">
                            <Edit2 className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleDeleteTenant(tenant.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Excluir">
                            <Trash2 className="w-5 h-5" />
                        </button>
                     </div>
                  </td>
                </tr>
              ))}
              {tenantsList.length === 0 && (
                  <tr><td colSpan={4} className="px-8 py-10 text-center text-lg text-gray-500">Nenhuma empresa cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">Editar Empresa</h3>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-6">
                    <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">Nome da Empresa</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">E-mail do Administrador</label>
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-base font-medium text-gray-700 mb-2">Senha</label>
                        <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex justify-end pt-4">
                        <button onClick={handleSaveEdit} className="px-6 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 transition shadow-md">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}