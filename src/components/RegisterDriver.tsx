import { useState, useRef, useEffect } from 'react';
import { auth } from './firebase';
import { getDatabase, ref, push, set, query, orderByChild, equalTo, get } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, Camera, Upload, Eraser, Save, AlertTriangle } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  tenantId?: string;
}

export default function RegisterDriver({ onSuccess, tenantId: propTenantId }: Props) {
  const { user, userProfile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [driverDocument, setDriverDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const database = getDatabase(auth.app);
  const activeTenantId = propTenantId || (userProfile as any)?.tenantId || user?.uid;

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = window.document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Erro ao processar imagem'));

          const MAX_SIZE = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log("🚀 [RegisterDriver] Iniciando processo de salvamento...");

    try {
      if (!name || !driverDocument) {
        throw new Error('Nome e CPF são obrigatórios.');
      }

      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas não encontrado');

      const signatureDataUrl = canvas.toDataURL('image/png');

      let photoUrl = null;
      if (photo) {
        console.log("📸 [RegisterDriver] Processando foto...");
        photoUrl = await convertFileToBase64(photo);
      }

      // Verificar duplicidade de CPF no Realtime Database
      const driversRef = ref(database, `tenants/${activeTenantId}/drivers`);
      let cpfExists = false;

      try {
        const q = query(driversRef, orderByChild('document'), equalTo(driverDocument));
        const snapshot = await get(q);
        cpfExists = snapshot.exists();
      } catch (qErr: any) {
        // Fallback: Se o índice não existir, busca tudo e filtra no cliente
        if (qErr.message && qErr.message.includes("Index not defined")) {
           console.warn("⚠️ Índice 'document' não encontrado. Usando verificação manual.");
           const snapshot = await get(driversRef);
           if (snapshot.exists()) {
             snapshot.forEach(child => {
               if (child.val().document === driverDocument) cpfExists = true;
             });
           }
        } else {
           throw qErr;
        }
      }

      if (cpfExists) {
        throw new Error('Já existe um motorista cadastrado com este CPF.');
      }

      console.log("💾 [RegisterDriver] Salvando motorista no RTDB...");
      
      const driverData = {
        name,
        document: driverDocument,
        phone: phone || null,
        signature_url: signatureDataUrl,
        photo_url: photoUrl,
        created_by: user?.uid,
        created_at: new Date().toISOString()
      };

      const newDriverRef = push(driversRef);
      await set(newDriverRef, driverData);
      console.log("✅ [RegisterDriver] Salvo com sucesso no RTDB. ID:", newDriverRef.key);
      
      setName('');
      setDriverDocument('');
      setPhone('');
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      clearSignature();
      
      onSuccess();
    } catch (err: any) {
      console.error("❌ [RegisterDriver] Erro fatal:", err);
      if (err.message && err.message.includes("Index not defined")) {
        setError("Erro de Sistema: Índice 'document' não encontrado no banco de dados. Publique as regras no Firebase Console.");
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao cadastrar motorista');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Cadastrar Motorista</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CPF/Documento
            </label>
            <input
              type="text"
              value={driverDocument}
              onChange={(e) => setDriverDocument(formatCPF(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="000.000.000-00"
              maxLength={14}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Telefone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Foto do Motorista
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition flex items-center justify-center space-x-2 h-[42px]"
            >
              {photo ? (
                <><Upload className="w-5 h-5 text-green-600" /><span className="text-sm text-green-600 truncate">{photo.name}</span></>
              ) : (
                <><Camera className="w-5 h-5 text-gray-400" /><span className="text-sm text-gray-600">Adicionar Foto</span></>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assinatura
          </label>
          <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="border border-gray-200 rounded cursor-crosshair w-full"
              style={{ touchAction: 'none' }}
            />
            <button
              type="button"
              onClick={clearSignature}
              className="mt-3 flex items-center space-x-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              <Eraser className="w-4 h-4" />
              <span>Limpar Assinatura</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          <span>{loading ? 'Salvando...' : 'Salvar Motorista'}</span>
        </button>
      </form>
    </div>
  );
}