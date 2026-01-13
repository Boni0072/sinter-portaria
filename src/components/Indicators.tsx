import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Clock, Truck, Users, ArrowDownRight, Activity, Calendar } from 'lucide-react';

interface DashboardMetrics {
  vehiclesInside: number;
  entriesToday: number;
  entriesThisMonth: number;
  avgStayDurationMinutes: number;
  busiestHour: number;
  totalDrivers: number;
}

interface TopDriver {
  name: string;
  count: number;
}

export default function Indicators() {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    vehiclesInside: 0,
    entriesToday: 0,
    entriesThisMonth: 0,
    avgStayDurationMinutes: 0,
    busiestHour: 0,
    totalDrivers: 0
  });
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>(new Array(24).fill(0));
  const [topDrivers, setTopDrivers] = useState<TopDriver[]>([]);

  useEffect(() => {
    if (userProfile) loadIndicators();
  }, [userProfile, dateRange]);

  const loadIndicators = async () => {
    try {
      setLoading(true);
      const tenantId = (userProfile as any)?.tenantId || user?.uid;
      if (!tenantId) return;

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
        where('tenantId', '==', tenantId),
        where('entry_time', '>=', startDate.toISOString()),
        orderBy('entry_time', 'desc'),
        limit(2000)
      ];

      if (endDate) {
        // Adiciona filtro de data final se existir (para Semana Passada)
        queryConstraints = [
          where('tenantId', '==', tenantId),
          where('entry_time', '>=', startDate.toISOString()),
          where('entry_time', '<', endDate.toISOString()),
          orderBy('entry_time', 'desc'),
          limit(2000)
        ];
      }

      const entriesQuery = query(
        collection(db, 'entries'),
        ...queryConstraints
      );

      // 2. Buscar Total de Motoristas
      const driversQuery = query(
        collection(db, 'drivers'),
        where('tenantId', '==', tenantId)
      );

      const [entriesSnapshot, driversSnapshot] = await Promise.all([
        getDocs(entriesQuery),
        getDocs(driversQuery)
      ]);

      // Processamento dos Dados
      const entries = entriesSnapshot.docs.map(doc => doc.data());
      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let insideCount = 0;
      let todayCount = 0;
      let monthCount = 0;
      let totalDurationMinutes = 0;
      let completedVisits = 0;
      const hoursCount = new Array(24).fill(0);
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
        totalDrivers: driversSnapshot.size
      });

      setHourlyDistribution(hoursCount);
      setTopDrivers(sortedDrivers);

    } catch (err) {
      console.error("Erro ao calcular indicadores:", err);
    } finally {
      setLoading(false);
    }
  };

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

      {/* Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              const max = Math.max(...hourlyDistribution, 1);
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

                  {/* Line Path */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-md"
                  />

                  {/* Data Points and Labels */}
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
                </svg>
              );
            })()}
          </div>
          
          <p className="text-xs text-center text-gray-400 mt-2">Horário do dia (0h - 23h)</p>
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
    </div>
  );
}