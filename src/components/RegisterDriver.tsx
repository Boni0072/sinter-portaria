import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
// src/components/RegisterDriver.tsx

// Adicione 'Wifi' dentro das chaves
import { User, Car, Phone, Wifi, Camera, Upload, Eraser, Save } from 'lucide-react'; 

// import { Save, Eraser, Camera, Upload, Wifi } from 'lucide-react';

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

  const activeTenantId = propTenantId || (userProfile as any)?.tenantId || user?.uid;

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

  const testConnection = async () => {
    try {
      if (!activeTenantId) {
        alert("Erro: Usuário não identificado.");
        return;
      }
      
      console.log("🔄 Testando conexão com Firestore...");
      await setDoc(doc(db, 'tenants', activeTenantId), {
        last_check: new Date().toISOString(),
        status: 'active'
      }, { merge: true });
      
      alert("✅ Conexão OK! A pasta 'tenants' foi verificada no banco de dados.");
    } catch (err) {
      console.error("❌ Erro de conexão:", err);
      alert("❌ Erro ao conectar: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log("🚀 [RegisterDriver] Iniciando processo de salvamento...");

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas não encontrado');

      const signatureDataUrl = canvas.toDataURL('image/png');

      let photoUrl = null;
      if (photo) {
        console.log("📸 [RegisterDriver] Processando foto...");
        photoUrl = await convertFileToBase64(photo);
      }

      console.log("💾 [RegisterDriver] Salvando motorista...");
      
      // Geração de ID antecipada em uma coleção global 'drivers'
      const newDriverRef = doc(collection(db, 'drivers'));
      
      const driverData = {
        name,
        document: driverDocument,
        phone: phone || null,
        signature_url: signatureDataUrl,
        photo_url: photoUrl,
        created_by: user?.uid,
        created_at: new Date().toISOString()
      };

      // Aguarda a confirmação real do servidor
      await setDoc(newDriverRef, driverData);
      console.log("✅ [RegisterDriver] Salvo com sucesso no Firestore. ID:", newDriverRef.id);
      
      setName('');
      setDriverDocument('');
      setPhone('');
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      clearSignature();
      
      onSuccess();
    } catch (err) {
      console.error("❌ [RegisterDriver] Erro fatal:", err);
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar motorista');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Cadastrar Motorista</h2>
        <button 
          type="button" 
          onClick={testConnection}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg border border-blue-100"
        >
          <Wifi className="w-4 h-4" /> Testar Conexão
        </button>
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
              onChange={(e) => setDriverDocument(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
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
