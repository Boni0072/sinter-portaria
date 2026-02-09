import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from './firebase';
import { getDatabase, ref, set } from 'firebase/database';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Mail, Lock } from 'lucide-react';

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

        if (res?.user) {
          const uid = res.user.uid;

          await set(ref(database, `profiles/${uid}`), {
            email: res.user.email,
            role: 'admin',
            tenantId: uid,
            created_at: new Date().toISOString(),
          });

          await set(ref(database, `tenants/${uid}`), {
            name: 'Minha Empresa',
            owner_id: uid,
            email: res.user.email,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch {
      setError('Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Informe o email para recuperar a senha');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setError('');
    } catch {
      setError('Erro ao enviar email');
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: "url('/login-bg.jpg')", // ou login-bg.png
        backgroundRepeat: 'no-repeat',
        backgroundSize: '2050px auto',   // 🔹 imagem reduzida
        backgroundPosition: '68% center', // 🔹 dedo alinhado ao campo usuário
        backgroundColor: '#0b1e4a'
      }}
    >
      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/60" />

      {/* CARD LOGIN */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-[420px] bg-white/10 backdrop-blur-md border border-white/20 p-10 rounded-xl shadow-2xl"
      >
        <h1 className="text-center text-white text-2xl font-semibold mb-8">
          {isLogin ? 'LOGIN' : 'CRIAR CONTA'}
        </h1>

        {/* EMAIL */}
        <div className="flex h-11 mb-4 border border-white/30 bg-white/20 rounded-md">
          <div className="w-11 flex items-center justify-center border-r border-white/30 text-white">
            <Mail size={18} />
          </div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="flex-1 bg-transparent px-3 text-white text-sm outline-none placeholder-white/70"
            required
          />
        </div>

        {/* PASSWORD */}
        <div className="flex h-11 mb-4 border border-white/30 bg-white/20 rounded-md">
          <div className="w-11 flex items-center justify-center border-r border-white/30 text-white">
            <Lock size={18} />
          </div>
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="flex-1 bg-transparent px-3 text-white text-sm outline-none placeholder-white/70"
            required
          />
        </div>

        {/* MENSAGEM */}
        {error && (
          <p className="text-center text-sm text-red-300 mb-4">
            {error}
          </p>
        )}

        {/* BOTÃO */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition disabled:opacity-50"
        >
          {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Cadastrar'}
        </button>

        {/* LINKS */}
        <div className="flex justify-between mt-5 text-sm text-white/80">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="hover:underline"
          >
            {isLogin ? '' : ''}
          </button>

          {isLogin && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="hover:underline"
            >
               
            </button>
          )}
        </div>
      </form>
    </div>
  );
}