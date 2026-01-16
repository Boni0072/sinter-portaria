import { useState, useEffect, useCallback } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Clock, Truck, Users, ArrowDownRight, Activity, Calendar, Building2, MapPin, AlertTriangle } from 'lucide-react';

interface DashboardMetrics {
  vehiclesInside: number;
  entriesToday: number;
  entriesThisMonth: number;
  avgStayDurationMinutes: number;
  busiestHour: number;
  totalDrivers: number;
  totalOccurrences: number;
}

interface TopDriver {
  name: string;
  count: number;
}

export default function Indicators({ tenantId: propTenantId }: { tenantId?: string }) {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    vehiclesInside: 0,
    entriesToday: 0,
    entriesThisMonth: 0,
    avgStayDurationMinutes: 0,
    busiestHour: 0,
    totalDrivers: 0,
    totalOccurrences: 0
  });
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>(new Array(24).fill(0));
  const [occurrencesHourlyDistribution, setOccurrencesHourlyDistribution] = useState<number[]>(new Array(24).fill(0));
  const [topDrivers, setTopDrivers] = useState<TopDriver[]>([]);
  const [tenants, setTenants] = useState<{id: string, name: string, address?: string}[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [companyStats, setCompanyStats] = useState<{name: string, count: number, occurrencesCount: number}[]>([]);
  const [error, setError] = useState<any>(null);

  const activeTenantId = selectedTenantId || propTenantId || (userProfile as any)?.tenantId || user?.uid;

  useEffect(() => {
    if (propTenantId) {
      setSelectedTenantId(propTenantId);
    }
  }, [propTenantId]);

  useEffect(() => {
    const fetchTenants = async () => {
      if (!user?.uid) return;
      
      try {
        const allowedTenants = (userProfile as any)?.allowedTenants;
        let list: {id: string, name: string, address?: string}[] = [];

        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => getDoc(doc(db, 'tenants', id)));
          const docs = await Promise.all(promises);
          list = docs
            .filter(d => d.exists())
            .map(d => ({ 
              id: d.id, 
              name: d.data()?.name || 'Empresa sem nome',
              address: d.data()?.address
            }));
        } else {
          const q = query(collection(db, 'tenants'), where('created_by', '==', user.uid));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            list = snapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().name || 'Empresa sem nome',
              address: doc.data().address
            }));
          }
        }

        // Fallback
        if (list.length === 0 && (userProfile as any)?.tenantId) {
           const tId = (userProfile as any).tenantId;
           const docSnap = await getDoc(doc(db, 'tenants', tId));
           if (docSnap.exists()) {
             list.push({ 
               id: docSnap.id, 
               name: docSnap.data().name || 'Minha Empresa',
               address: docSnap.data().address
             });
           }
        }

        // Remove duplicates
        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        
        setTenants(list);

        // Se houver mais de uma empresa, seleciona "Todas" por padrão para visualização agregada
        if (list.length > 1) {
           setSelectedTenantId('all');
        }
      } catch (error) {
        console.error("Erro ao buscar empresas:", error);
      }
    };
    
    fetchTenants();
  }, [user, userProfile]);

  const loadCompanyStats = useCallback(async () => {
    if (tenants.length <= 1) return;
    if (tenants.length === 0) return;

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    let endDate: Date | null = null;

    if (dateRange === 'today') {
      // startDate já é hoje 00:00
    } else if (dateRange === 'thisWeek') {
      const day = startDate.getDay();
      startDate.setDate(startDate.getDate() - day);
    } else if (dateRange === 'lastWeek') {
      const day = startDate.getDay();
      startDate.setDate(startDate.getDate() - day - 7);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 7);
    } else if (dateRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (dateRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (dateRange === 'thisMonth') {
      startDate.setDate(1);
    }

    const promises = tenants.map(async (t) => {
      let queryConstraints = [where('entry_time', '>=', startDate.toISOString())];
      let occurrenceConstraints = [where('created_at', '>=', startDate.toISOString())];

      if (endDate) {
        queryConstraints.push(where('entry_time', '<', endDate.toISOString()));
        occurrenceConstraints.push(where('created_at', '<', endDate.toISOString()));
      }
      
      const q = query(collection(db, 'tenants', t.id, 'entries'), ...queryConstraints);
      const qOcc = query(collection(db, 'tenants', t.id, 'occurrences'), ...occurrenceConstraints);
      
      const [snapshot, snapshotOcc] = await Promise.all([
        getDocs(q),
        getDocs(qOcc)
      ]);
      return { name: t.name, count: snapshot.size, occurrencesCount: snapshotOcc.size };
    });

    const results = await Promise.all(promises);
    setCompanyStats(results.sort((a, b) => b.count - a.count));
  }, [tenants, dateRange]);

  const loadIndicators = useCallback(async (currentTenantId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      let targetIds: string[] = [];
      
      if (currentTenantId === 'all') {
        if (tenants.length === 0) {
           setLoading(false);
           return;
        }
        targetIds = tenants.map(t => t.id);
      } else if (currentTenantId) {
        targetIds = [currentTenantId];
      } else {
        return;
      }

      // 1. Buscar Entradas (Filtro de Data)
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let endDate: Date | null = null;

      if (dateRange === 'today') {
        // startDate já é hoje 00:00
      } else if (dateRange === 'thisWeek') {
        // Início desta semana (Domingo)
        const day = startDate.getDay();
        startDate.setDate(startDate.getDate() - day);
      } else if (dateRange === 'lastWeek') {
        // Semana passada (Domingo anterior até Sábado anterior)
        const day = startDate.getDay();
        startDate.setDate(startDate.getDate() - day - 7);
        
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
      } else if (dateRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateRange === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (dateRange === 'thisMonth') {
        startDate.setDate(1);
      }

      // Construção da Query
      let queryConstraints = [
        where('entry_time', '>=', startDate.toISOString()),
        orderBy('entry_time', 'desc'),
        limit(2000)
      ];

      let occurrenceConstraints = [
        where('created_at', '>=', startDate.toISOString()),
        orderBy('created_at', 'desc')
      ];

      if (endDate) {
        // Adiciona filtro de data final se existir (para Semana Passada)
        queryConstraints = [
          where('entry_time', '>=', startDate.toISOString()),
          where('entry_time', '<', endDate.toISOString()),
          orderBy('entry_time', 'desc'),
          limit(2000)
        ];

        occurrenceConstraints = [
          where('created_at', '>=', startDate.toISOString()),
          where('created_at', '<', endDate.toISOString()),
          orderBy('created_at', 'desc')
        ];
      }

      const fetchTenantData = async (tid: string) => {
        const entriesQuery = query(
          collection(db, 'tenants', tid, 'entries'),
          ...queryConstraints
        );
        const driversQuery = query(
          collection(db, 'tenants', tid, 'drivers')
        );
        const occurrencesQuery = query(
          collection(db, 'tenants', tid, 'occurrences'),
          ...occurrenceConstraints
        );
        const [entriesSnap, driversSnap, occurrencesSnap] = await Promise.all([
          getDocs(entriesQuery),
          getDocs(driversQuery),
          getDocs(occurrencesQuery)
        ]);
        return {
          entries: entriesSnap.docs.map(doc => doc.data()),
          driverCount: driversSnap.size,
          occurrences: occurrencesSnap.docs.map(doc => doc.data())
        };
      };

      // Processamento dos Dados
      const results = await Promise.all(targetIds.map(tid => fetchTenantData(tid)));
      const entries = results.flatMap(r => r.entries);
      const occurrences = results.flatMap(r => r.occurrences);
      const totalDrivers = results.reduce((acc, r) => acc + r.driverCount, 0);

      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let insideCount = 0;
      let todayCount = 0;
      let monthCount = 0;
      let totalDurationMinutes = 0;
      let completedVisits = 0;
      const hoursCount = new Array(24).fill(0);
      const occurrencesHoursCount = new Array(24).fill(0);
      const driverCounts: Record<string, number> = {};

      entries.forEach((entry: any) => {
        // Veículos no Pátio (sem data de saída)
        if (!entry.exit_time) {
          insideCount++;
        } else {
          // Cálculo de duração para visitas concluídas
          const start = new Date(entry.entry_time).getTime();
          const end = new Date(entry.exit_time).getTime();
          const duration = (end - start) / (1000 * 60); // em minutos
          if (duration > 0 && duration < 1440) { // Ignora erros de datas absurdas (> 24h)
            totalDurationMinutes += duration;
            completedVisits++;
          }
        }

        // Contagens temporais
        if (entry.entry_time >= todayStart) todayCount++;
        if (entry.entry_time >= monthStart) monthCount++;

        // Distribuição por hora
        const hour = new Date(entry.entry_time).getHours();
        hoursCount[hour]++;

        // Top Motoristas
        const driverName = entry.cached_data?.driver_name;
        if (driverName) {
          driverCounts[driverName] = (driverCounts[driverName] || 0) + 1;
        }
      });

      // Processar Ocorrências por hora
      occurrences.forEach((occ: any) => {
        const hour = new Date(occ.created_at).getHours();
        occurrencesHoursCount[hour]++;
      });

      // Encontrar hora de pico
      const maxHourCount = Math.max(...hoursCount);
      const busiestHourIndex = hoursCount.indexOf(maxHourCount);

      // Processar Top 5 Motoristas
      const sortedDrivers = Object.entries(driverCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setMetrics({
        vehiclesInside: insideCount,
        entriesToday: todayCount,
        entriesThisMonth: monthCount,
        avgStayDurationMinutes: completedVisits > 0 ? Math.round(totalDurationMinutes / completedVisits) : 0,
        busiestHour: busiestHourIndex,
        totalDrivers: totalDrivers,
        totalOccurrences: occurrences.length
      });

      setHourlyDistribution(hoursCount);
      setOccurrencesHourlyDistribution(occurrencesHoursCount);
      setTopDrivers(sortedDrivers);

    } catch (err) {
      console.error("Erro ao calcular indicadores:", err);
      // @ts-ignore
      if (err.code === 'failed-precondition') {
        const message = (err as any).message || '';
        const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
        const link = match ? match[0] : null;
        
        if (link) {
          setError(<span>Configuração necessária: <a href={link} target="_blank" rel="noopener noreferrer" className="underline font-bold">Clique aqui para criar o índice</a>.</span>);
        } else {
          setError("Configuração necessária: É preciso criar um índice no Firestore para visualizar estes dados. Verifique o console do navegador para o link de criação.");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange, tenants]);

  useEffect(() => {
    if ((user || userProfile) && activeTenantId) {
      loadIndicators(activeTenantId);
    } else {
      // Se não houver perfil, paramos o estado de carregamento para mostrar a mensagem.
      if (!activeTenantId) setLoading(false);
    }
  }, [user, userProfile, loadIndicators, activeTenantId]);

  useEffect(() => {
    if (tenants.length > 1) {
      loadCompanyStats();
    }
  }, [tenants.length, loadCompanyStats]);

  const getMapUrl = () => {
    const baseUrl = "https://maps.google.com/maps";
    
    if (activeTenantId === 'all') {
      const validTenants = tenants.filter(t => t.address && t.address.trim() !== '');
      
      if (validTenants.length === 0) {
        return `${baseUrl}?q=Brasil&t=&z=4&ie=UTF8&iwloc=B&output=embed`;
      }
      
      if (validTenants.length === 1) {
        return `${baseUrl}?q=${encodeURIComponent(validTenants[0].address!)}&t=&z=14&ie=UTF8&iwloc=B&output=embed`;
      }
      
      // Mostra apenas o primeiro endereço para evitar traçar rota entre eles
      return `${baseUrl}?q=${encodeURIComponent(validTenants[0].address!)}&t=&z=14&ie=UTF8&iwloc=B&output=embed`;
    }

    const tenant = tenants.find(t => t.id === activeTenantId);
    const address = tenant?.address || 'Brasil';
    const zoom = tenant?.address ? '14' : '4';
    return `${baseUrl}?q=${encodeURIComponent(address)}&t=&z=${zoom}&ie=UTF8&iwloc=B&output=embed`;
  };

  if (!user && !userProfile) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold text-gray-700">Perfil de usuário não encontrado</h3>
        <p className="text-gray-500 mt-2">
          Não foi possível carregar os indicadores porque o seu perfil de usuário não foi encontrado ou está incompleto.
          <br />
          Por favor, entre em contato com o administrador do sistema.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg shadow-sm">
        <p className="text-yellow-800 font-medium flex items-center gap-2"><Activity className="w-5 h-5" /> Atenção</p>
        <p className="text-yellow-700 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Indicadores de Performance</h2>
        
        <div className="flex items-center gap-3">
          {tenants.length > 1 && (
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Building2 className="w-4 h-4 text-gray-500 mr-2" />
              <select 
                value={activeTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer outline-none max-w-[150px]"
              >
                <option value="all">Todas as Empresas</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Calendar className="w-4 h-4 text-gray-500 mr-2" />
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer outline-none"
            >
              <option value="today">Hoje</option>
              <option value="thisWeek">Esta Semana</option>
              <option value="lastWeek">Semana Passada</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="thisMonth">Este Mês</option>
            </select>
          </div>
          
          <span className="text-sm text-gray-500 flex items-center gap-1 hidden sm:flex">
            <Activity className="w-4 h-4" /> Tempo Real
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Coluna Principal (Esquerda) */}
        <div className="xl:col-span-9 space-y-6">
          {/* Cards Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Veículos no Pátio</p>
                  <h3 className="text-3xl font-bold text-blue-600 mt-2">{metrics.vehiclesInside}</h3>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">Agora</div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entradas Hoje</p>
                  <h3 className="text-3xl font-bold text-green-600 mt-2">{metrics.entriesToday}</h3>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <ArrowDownRight className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">Total do dia</div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Tempo Médio</p>
                  <h3 className="text-3xl font-bold text-purple-600 mt-2">{metrics.avgStayDurationMinutes} <span className="text-sm font-normal text-gray-400">min</span></h3>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">Permanência no local</div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Motoristas</p>
                  <h3 className="text-3xl font-bold text-orange-600 mt-2">{metrics.totalDrivers}</h3>
                </div>
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Users className="w-6 h-6 text-orange-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">Cadastrados na base</div>
            </div>

            <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-red-900">Ocorrências</p>
                  <h3 className="text-3xl font-bold text-red-700 mt-2">{metrics.totalOccurrences}</h3>
                </div>
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-red-800">No período selecionado</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
            {/* Gráfico de Horários (Simples com CSS) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-7">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-500" /> Distribuição por Horário ({
                  dateRange === 'today' ? 'Hoje' :
                  dateRange === 'thisWeek' ? 'Esta Semana' :
                  dateRange === 'lastWeek' ? 'Semana Passada' :
                  dateRange === '7d' ? '7 dias' : 
                  dateRange === '30d' ? '30 dias' : 'Este Mês'
                })
              </h3>
              
              <div className="relative h-64 w-full">
                {(() => {
                  const max = Math.max(...hourlyDistribution, ...occurrencesHourlyDistribution, 1);
                  const width = 1000;
                  const height = 250;
                  const paddingX = 40;
                  const paddingY = 30;
                  const chartWidth = width - paddingX;
                  const chartHeight = height - paddingY * 2;
                  
                  const dataPoints = hourlyDistribution.map((count, index) => {
                    const x = paddingX + (index / (hourlyDistribution.length - 1)) * (chartWidth - 20);
                    const y = height - paddingY - (count / max) * chartHeight;
                    return { x, y, count, index };
                  });

                  const occurrencePoints = occurrencesHourlyDistribution.map((count, index) => {
                    const x = paddingX + (index / (occurrencesHourlyDistribution.length - 1)) * (chartWidth - 20);
                    const y = height - paddingY - (count / max) * chartHeight;
                    return { x, y, count, index };
                  });

                  const smoothPath = (points: typeof dataPoints) => {
                    if (points.length <= 1) return "";
                    let d = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                      const p0 = points[i - 2] || points[i - 1];
                      const p1 = points[i - 1];
                      const p2 = points[i];
                      const p3 = points[i + 1] || p2;
                      const cp1x = p1.x + (p2.x - p0.x) / 6;
                      const cp1y = p1.y + (p2.y - p0.y) / 6;
                      const cp2x = p2.x - (p3.x - p1.x) / 6;
                      const cp2y = p2.y - (p3.y - p1.y) / 6;
                      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                    }
                    return d;
                  };

                  const pathD = smoothPath(dataPoints);
                  const occurrencePathD = smoothPath(occurrencePoints);

                  return (
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = height - paddingY - ratio * chartHeight;
                        return (
                          <g key={ratio}>
                            <line x1={paddingX} y1={y} x2={width} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                            <text x={paddingX - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#9ca3af">
                              {Math.round(ratio * max)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Line Path Entries */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-md"
                      />

                      {/* Line Path Occurrences */}
                      <path
                        d={occurrencePathD}
                        fill="none"
                    stroke="#ef4444"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-md"
                      />

                      {/* Data Points and Labels Entries */}
                      {dataPoints.map((point, i) => {
                        return (
                          <g key={i} className="group">
                            <text x={point.x} y={height - 5} textAnchor="middle" fontSize="10" fill="#6b7280">
                              {point.index}h
                            </text>
                            <circle cx={point.x} cy={point.y} r={point.count > 0 ? 4 : 2} fill="white" stroke="#2563eb" strokeWidth="2" />
                            {point.count > 0 && (
                              <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1f2937">
                                {point.count}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Data Points and Labels Occurrences */}
                      {occurrencePoints.map((point, i) => {
                        return (
                          <g key={`occ-${i}`} className="group">
                        <circle cx={point.x} cy={point.y} r={point.count > 0 ? 4 : 0} fill="white" stroke="#ef4444" strokeWidth="2" />
                            {point.count > 0 && (
                          <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#b91c1c">
                                {point.count}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
              
              <p className="text-xs text-center text-gray-400 mt-2">Horário do dia (0h - 23h)</p>
              
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  <span className="text-sm text-gray-600">Entradas</span>
                </div>
                <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600">Ocorrências</span>
                </div>
              </div>
            </div>

            {/* Top Motoristas */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-3">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500" /> Motoristas Mais Frequentes
              </h3>
              <div className="space-y-4">
                {topDrivers.length > 0 ? (
                  topDrivers.map((driver, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                          index === 1 ? 'bg-gray-200 text-gray-700' : 
                          index === 2 ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {index + 1}º
                        </div>
                        <span className="font-medium text-gray-700">{driver.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{driver.count}</span>
                        <span className="text-xs text-gray-500">acessos</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">Dados insuficientes para ranking.</p>
                )}
              </div>
            </div>
          </div>

          {/* Gráfico Comparativo de Empresas (Apenas se houver mais de uma) */}
          {tenants.length > 1 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-500" /> Comparativo de Registros por Empresa
              </h3>
              <div className="flex items-center justify-end gap-4 mb-4">
                 <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
                    <span className="text-xs text-gray-600">Entradas</span>
                 </div>
                 <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                    <span className="text-xs text-gray-600">Ocorrências</span>
                 </div>
              </div>
              <div className="h-64 flex items-end gap-2 sm:gap-4 pt-4 border-b border-gray-100">
                {companyStats.map((stat) => {
                  const max = Math.max(...companyStats.map(s => Math.max(s.count, s.occurrencesCount)), 1);
                  return (
                    <div key={stat.name} className="flex-1 flex flex-col items-center justify-end h-full group">
                      <div className="flex items-end justify-center gap-1 w-full h-full">
                           <div className="flex flex-col items-center justify-end h-full w-1/2 group/bar">
                               <span className="mb-1 text-[10px] font-bold text-blue-600 opacity-0 group-hover/bar:opacity-100 transition-opacity">{stat.count}</span>
                               <div 
                                 className="w-full bg-blue-600 rounded-t-sm transition-all duration-500 hover:bg-blue-700 relative" 
                                 style={{ height: `${(stat.count / max) * 100}%` }}
                                 title={`Entradas: ${stat.count}`}
                               ></div>
                           </div>
                           <div className="flex flex-col items-center justify-end h-full w-1/2 group/bar">
                               <span className="mb-1 text-[10px] font-bold text-red-600 opacity-0 group-hover/bar:opacity-100 transition-opacity">{stat.occurrencesCount}</span>
                               <div 
                                 className="w-full bg-red-500 rounded-t-sm transition-all duration-500 hover:bg-red-600 relative" 
                                 style={{ height: `${(stat.occurrencesCount / max) * 100}%` }}
                                 title={`Ocorrências: ${stat.occurrencesCount}`}
                               ></div>
                           </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 truncate w-full text-center" title={stat.name}>
                        {stat.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Lateral (Direita) - Mapa */}
        <div className="xl:col-span-3">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
             <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
               <MapPin className="w-5 h-5 text-gray-500" /> Localização
             </h3>
             
             <div className="flex-1 bg-gray-100 rounded-lg mb-4 overflow-hidden relative min-h-[300px]">
                <iframe 
                  width="100%" 
                  height="100%" 
                  frameBorder="0" 
                  scrolling="no" 
                  marginHeight={0} 
                  marginWidth={0} 
                  src={getMapUrl()}
                  className="absolute inset-0"
                  title="Mapa de Localização"
                ></iframe>
             </div>

             <div className="space-y-3 overflow-y-auto max-h-[400px]">
               {tenants.map(t => (
                 <button 
                   key={t.id} 
                   onClick={() => setSelectedTenantId(t.id)}
                   className={`w-full text-left p-3 rounded-lg text-sm border transition-all ${
                   t.id === activeTenantId ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                 }`}>
                   <div className="flex justify-between items-start">
                      <p className={`font-medium ${t.id === activeTenantId ? 'text-blue-700' : 'text-gray-800'}`}>{t.name}</p>
                      {t.id === activeTenantId && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>}
                   </div>
                   <p className="text-gray-500 text-xs mt-1 flex items-start gap-1">
                     <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                     <span className="truncate">{t.address || 'Endereço não cadastrado'}</span>
                   </p>
                 </button>
               ))}
               {tenants.length === 0 && (
                 <p className="text-gray-400 text-center text-sm py-4">Nenhuma empresa encontrada.</p>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}