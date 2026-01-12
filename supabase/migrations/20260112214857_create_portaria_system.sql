/*
  # Sistema de Portaria - Schema Inicial

  1. Novas Tabelas
    - `drivers` (motoristas)
      - `id` (uuid, primary key)
      - `name` (text) - Nome completo do motorista
      - `document` (text) - CPF ou documento de identificação
      - `phone` (text) - Telefone de contato
      - `signature_url` (text) - URL da assinatura digital
      - `created_at` (timestamptz)
      - `created_by` (uuid) - Usuário que cadastrou
      
    - `vehicles` (veículos)
      - `id` (uuid, primary key)
      - `plate` (text, unique) - Placa do veículo
      - `brand` (text) - Marca do veículo
      - `model` (text) - Modelo do veículo
      - `color` (text) - Cor do veículo
      - `driver_id` (uuid) - Referência ao motorista
      - `created_at` (timestamptz)
      
    - `entries` (registros de entrada/saída)
      - `id` (uuid, primary key)
      - `vehicle_id` (uuid) - Referência ao veículo
      - `driver_id` (uuid) - Referência ao motorista
      - `entry_time` (timestamptz) - Data/hora de entrada
      - `exit_time` (timestamptz, nullable) - Data/hora de saída
      - `vehicle_photo_url` (text) - Foto do veículo
      - `plate_photo_url` (text) - Foto da placa
      - `notes` (text) - Observações
      - `registered_by` (uuid) - Usuário que registrou a entrada
      - `exit_registered_by` (uuid, nullable) - Usuário que registrou a saída
      - `created_at` (timestamptz)

  2. Segurança
    - Habilitar RLS em todas as tabelas
    - Políticas para usuários autenticados poderem criar e visualizar registros
    - Políticas restritivas para garantir que apenas usuários autenticados acessem o sistema
*/

-- Criar tabela de motoristas
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text NOT NULL UNIQUE,
  phone text,
  signature_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de veículos
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL UNIQUE,
  brand text,
  model text,
  color text,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Criar tabela de entradas e saídas
CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id),
  driver_id uuid REFERENCES drivers(id),
  entry_time timestamptz DEFAULT now(),
  exit_time timestamptz,
  vehicle_photo_url text,
  plate_photo_url text,
  notes text,
  registered_by uuid REFERENCES auth.users(id),
  exit_registered_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Políticas para drivers
CREATE POLICY "Usuários autenticados podem visualizar motoristas"
  ON drivers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem cadastrar motoristas"
  ON drivers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários autenticados podem atualizar motoristas"
  ON drivers FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas para vehicles
CREATE POLICY "Usuários autenticados podem visualizar veículos"
  ON vehicles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem cadastrar veículos"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar veículos"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas para entries
CREATE POLICY "Usuários autenticados podem visualizar entradas"
  ON entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem registrar entradas"
  ON entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = registered_by);

CREATE POLICY "Usuários autenticados podem atualizar entradas"
  ON entries FOR UPDATE
  TO authenticated
  USING (true);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);
CREATE INDEX IF NOT EXISTS idx_drivers_document ON drivers(document);
CREATE INDEX IF NOT EXISTS idx_entries_entry_time ON entries(entry_time);
CREATE INDEX IF NOT EXISTS idx_entries_vehicle_id ON entries(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_entries_driver_id ON entries(driver_id);