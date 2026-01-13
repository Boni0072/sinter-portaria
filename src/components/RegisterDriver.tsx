import { useState, useRef, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { Save, Eraser, Camera, Upload } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export default function RegisterDriver({ onSuccess }: Props) {
  const { user, userProfile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas não encontrado');

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao gerar imagem da assinatura'));
        }, 'image/png');
      });

      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) {
        throw new Error('ID da empresa não encontrado. Faça login novamente.');
      }

      let photoUrl = null;
      if (photo) {
        const photoName = `driver-photo-${Date.now()}-${photo.name}`;
        const photoRef = ref(storage, `tenants/${tenantId}/driver-photos/${photoName}`);
        await uploadBytes(photoRef, photo, { contentType: photo.type });
        photoUrl = await getDownloadURL(photoRef);
      }

      const sanitizedDoc = document.replace(/[^a-zA-Z0-9]/g, '');
      const fileName = `${Date.now()}-${sanitizedDoc}.png`;
      const storageRef = ref(storage, `tenants/${tenantId}/signatures/${fileName}`);
      
      await uploadBytes(storageRef, blob, { contentType: 'image/png' });
      const publicUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'tenants', tenantId, 'drivers'), {
        name,
        document,
        phone: phone || null,
        signature_url: publicUrl,
        photo_url: photoUrl,
        created_by: user?.uid,
        created_at: new Date().toISOString()
      });

      setName('');
      setDocument('');
      setPhone('');
      setPhoto(null);
      clearSignature();
      onSuccess();
    } catch (err) {
      console.error("Erro ao salvar motorista:", err);
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar motorista');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Cadastrar Motorista</h2>

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
              value={document}
              onChange={(e) => setDocument(e.target.value)}
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
