import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from './firebase';
import { getDatabase, ref, set } from 'firebase/database';
import { Shield, Truck } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const database = getDatabase(auth.app);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        const res = await signUp(email, password);
        
        // Cria o perfil e a empresa no Firestore imediatamente após o cadastro
        if (res && res.user) {
          await set(ref(database, `profiles/${res.user.uid}`), {
            email: res.user.email,
            tenantId: res.user.uid,
            password: password,
            role: 'admin',
            created_at: new Date().toISOString()
          });

          await set(ref(database, `tenants/${res.user.uid}`), {
            name: 'Minha Empresa',
            type: 'matriz',
            created_at: new Date().toISOString(),
            owner_id: res.user.uid,
            email: res.user.email,
            created_by: res.user.uid // Adicionado para consistência
          });
        }
      }
    } catch (err: any) {
      console.error("Erro de autenticação:", err);
      let msg = 'Ocorreu um erro. Tente novamente.';
      
      // Tradução dos erros comuns do Firebase
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Conta não encontrada ou senha incorreta. Verifique se já realizou o cadastro.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'O formato do email é inválido.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'Este email já está cadastrado.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Erro de conexão. Verifique sua internet ou firewall.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas falhas. Tente novamente mais tarde.';
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <style>{`
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(35vmin) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(35vmin) rotate(-360deg); }
        }
        @keyframes orbit-reverse {
          from { transform: rotate(360deg) translateX(45vmin) rotate(-360deg); }
          to   { transform: rotate(0deg) translateX(45vmin) rotate(0deg); }
        }
        @keyframes orbit-inner {
          from { transform: rotate(180deg) translateX(25vmin) rotate(-180deg); }
          to   { transform: rotate(540deg) translateX(25vmin) rotate(-540deg); }
        }
      `}</style>
      {/* Fundo Animado Mais Intenso */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-600/30 blur-[100px] animate-pulse"></div>
        <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-cyan-400/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[60%] h-[60%] rounded-full bg-blue-800/20 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        {/* Logo Circulando pela tela */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <img 
             src="/Secontaf1.png" 
             alt="" 
             className="w-32 h-32 object-contain opacity-30"
             style={{ animation: 'orbit 15s linear infinite' }}
           />
        </div>

        {/* Ícone Shield Circulando (Sentido Inverso e Mais Longe) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="text-blue-900/20" style={{ animation: 'orbit-reverse 25s linear infinite' }}>
              <Shield className="w-24 h-24" />
           </div>
        </div>

        {/* Ícone Truck Circulando (Raio Menor e Começando em outro ponto) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="text-blue-700/20" style={{ animation: 'orbit-inner 20s linear infinite' }}>
              <Truck className="w-20 h-20" />
           </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md p-8 relative z-10 border border-white/50">
        <div className="flex items-center justify-center mb-2 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/20 blur-2xl rounded-full animate-pulse"></div>
          <img src="/Secontaf1.png" alt="Logo" className="w-64 h-auto object-contain relative z-10 drop-shadow-sm" />
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2 -mt-10">
        Controle da Portaria
        </h1>
        <p className="text-center text-gray-600 mb-8">
          {isLogin ? 'Entre com sua conta' : 'Crie sua conta'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            {isLogin
              ? ''
              : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
