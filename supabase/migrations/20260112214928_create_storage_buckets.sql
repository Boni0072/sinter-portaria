/*
  # Configuração de Storage para Fotos

  1. Buckets de Storage
    - `signatures` - Armazenar assinaturas digitais dos motoristas
    - `vehicle-photos` - Armazenar fotos dos veículos
    - `plate-photos` - Armazenar fotos das placas dos veículos

  2. Segurança
    - Buckets públicos para facilitar visualização
    - Políticas para permitir upload apenas por usuários autenticados
    - Políticas para permitir visualização pública
*/

-- Criar buckets de storage
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('signatures', 'signatures', true),
  ('vehicle-photos', 'vehicle-photos', true),
  ('plate-photos', 'plate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para bucket de assinaturas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Usuários autenticados podem fazer upload de assinaturas'
  ) THEN
    CREATE POLICY "Usuários autenticados podem fazer upload de assinaturas"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'signatures');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Todos podem visualizar assinaturas'
  ) THEN
    CREATE POLICY "Todos podem visualizar assinaturas"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'signatures');
  END IF;
END $$;

-- Políticas para bucket de fotos de veículos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Usuários autenticados podem fazer upload de fotos de veículos'
  ) THEN
    CREATE POLICY "Usuários autenticados podem fazer upload de fotos de veículos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'vehicle-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Todos podem visualizar fotos de veículos'
  ) THEN
    CREATE POLICY "Todos podem visualizar fotos de veículos"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'vehicle-photos');
  END IF;
END $$;

-- Políticas para bucket de fotos de placas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Usuários autenticados podem fazer upload de fotos de placas'
  ) THEN
    CREATE POLICY "Usuários autenticados podem fazer upload de fotos de placas"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'plate-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Todos podem visualizar fotos de placas'
  ) THEN
    CREATE POLICY "Todos podem visualizar fotos de placas"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'plate-photos');
  END IF;
END $$;