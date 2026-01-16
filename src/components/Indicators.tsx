import { useState, useEffect, useCallback } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Clock, Truck, Users, ArrowDownRight, Activity, Calendar, Building2, AlertTriangle, Timer } from 'lucide-react';

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

type AllData = {
  entries: Record<string, any[]>;
  occurrences: Record<string, any[]>;
  driverCounts: Record<string, number>;
};

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
  const [tenants, setTenants] = useState<{id: string, name: string, address?: string, lat?: string, lon?: string, geocoded?: boolean}[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [companyStats, setCompanyStats] = useState<{name: string, count: number, occurrencesCount: number}[]>([]);
  const [error, setError] = useState<any>(null);
  const [allData, setAllData] = useState<AllData>({ entries: {}, occurrences: {}, driverCounts: {} });
  const [durationStats, setDurationStats] = useState({
    under1h: 0,
    under4h: 0,
    over4h: 0,
    delayedVehicles: [] as any[],
    total: 1
  });

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

        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        
        setTenants(list);

        if (list.length > 1) {
           setSelectedTenantId('all');
        } else if (list.length === 1) {
           setSelectedTenantId(list[0].id);
        }
      } catch (error) {
        console.error("Erro ao buscar empresas:", error);
      }
    };
    
    fetchTenants();
  }, [user, userProfile]);

  // Geocodificação de endereços (Gera Lat/Lon)
  useEffect(() => {
    const geocodeTenants = async () => {
      const needsGeocoding = tenants.some(t => t.address && !t.geocoded);
      if (!needsGeocoding) return;

      const updatedTenants = [...tenants];
      let changed = false;

      for (let i = 0; i < updatedTenants.length; i++) {
        const t = updatedTenants[i];
        if (t.address && !t.geocoded) {
           try {
             // Delay para respeitar limite da API (1 req/s)
             if (i > 0) await new Promise(r => setTimeout(r, 1100));
             
             const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(t.address)}&limit=1`);
             const data = await res.json();
             
             if (data && data.length > 0) {
                updatedTenants[i] = { ...t, geocoded: true, lat: data[0].lat, lon: data[0].lon };
                changed = true;
             } else {
                updatedTenants[i] = { ...t, geocoded: true }; // Marca como processado mesmo se não achar
                changed = true;
             }
           } catch (e) {
             console.error("Erro ao geocodificar:", e);
           }
        }
      }
      
      if (changed) setTenants(updatedTenants);
    };

    geocodeTenants();
  }, [tenants]);

  // Effect for setting up listeners
  useEffect(() => {
    if (!activeTenantId || !user) return;

    setLoading(true);
    setError(null);
    setAllData({ entries: {}, occurrences: {}, driverCounts: {} }); // Reset data

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    let endDate: Date | null = null;

    if (dateRange === 'today') {} 
    else if (dateRange === 'thisWeek') {
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

    let targetIds: string[] = [];
    if (activeTenantId === 'all') {
      targetIds = tenants.map(t => t.id);
    } else {
      targetIds = [activeTenantId];
    }

    if (targetIds.length === 0) {
      setLoading(false);
      return;
    }

    const unsubscribes = targetIds.flatMap(tid => {
      let entryQueryConstraints = [where('entry_time', '>=', startDate.toISOString()), orderBy('entry_time', 'desc'), limit(2000)];
      let occurrenceQueryConstraints = [where('created_at', '>=', startDate.toISOString()), orderBy('created_at', 'desc')];

      if (endDate) {
        entryQueryConstraints = [where('entry_time', '>=', startDate.toISOString()), where('entry_time', '<', endDate.toISOString()), orderBy('entry_time', 'desc'), limit(2000)];
        occurrenceQueryConstraints = [where('created_at', '>=', startDate.toISOString()), where('created_at', '<', endDate.toISOString()), orderBy('created_at', 'desc')];
      }

      const entriesQuery = query(collection(db, 'tenants', tid, 'entries'), ...entryQueryConstraints);
      const occurrencesQuery = query(collection(db, 'tenants', tid, 'occurrences'), ...occurrenceQueryConstraints);
      const driversQuery = query(collection(db, 'tenants', tid, 'drivers'));

      const entriesUnsub = onSnapshot(entriesQuery, 
        (snapshot) => setAllData(prev => ({ ...prev, entries: { ...prev.entries, [tid]: snapshot.docs.map(d => d.data()) } })),
        (err) => { console.error(`Error on entries listener for ${tid}:`, err); setError("Erro ao carregar dados de entrada."); }
      );
      const occurrencesUnsub = onSnapshot(occurrencesQuery, 
        (snapshot) => setAllData(prev => ({ ...prev, occurrences: { ...prev.occurrences, [tid]: snapshot.docs.map(d => d.data()) } })),
        (err) => { console.error(`Error on occurrences listener for ${tid}:`, err); setError("Erro ao carregar dados de ocorrências."); }
      );
      const driversUnsub = onSnapshot(driversQuery, 
        (snapshot) => setAllData(prev => ({ ...prev, driverCounts: { ...prev.driverCounts, [tid]: snapshot.size } })),
        (err) => { console.error(`Error on drivers listener for ${tid}:`, err); setError("Erro ao carregar dados de motoristas."); }
      );

      return [entriesUnsub, occurrencesUnsub, driversUnsub];
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [activeTenantId, dateRange, tenants, user]);

  // Effect for calculations
  useEffect(() => {
    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : [activeTenantId];
    const allEntriesLoaded = targetIds.every(tid => allData.entries[tid] !== undefined);
    const allOccurrencesLoaded = targetIds.every(tid => allData.occurrences[tid] !== undefined);
    const allDriversLoaded = targetIds.every(tid => allData.driverCounts[tid] !== undefined);

    if (!allEntriesLoaded || !allOccurrencesLoaded || !allDriversLoaded || targetIds.length === 0) {
      return;
    }

    const entries = Object.values(allData.entries).flat();
    const occurrences = Object.values(allData.occurrences).flat();
    const totalDrivers = Object.values(allData.driverCounts).reduce((sum, count) => sum + count, 0);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let insideCount = 0;
    let todayCount = 0;
    let monthCount = 0;
    let totalDurationMinutes = 0;
    let completedVisits = 0;
    const hoursCount = new Array(24).fill(0);
    const occurrencesHoursCount = new Array(24).fill(0);
    const driverCounts: Record<string, number> = {};
    
    // Stats de Duração
    let dUnder1h = 0;
    let dUnder4h = 0;
    let dOver4h = 0;
    const delayed: any[] = [];

    entries.forEach((entry: any) => {
      if (!entry.exit_time) {
        insideCount++;
      } else {
        const start = new Date(entry.entry_time).getTime();
        const end = new Date(entry.exit_time).getTime();
        const duration = (end - start) / (1000 * 60);
        if (duration > 0 && duration < 1440) {
          totalDurationMinutes += duration;
          completedVisits++;
        }
      }
      
      // Cálculo de Duração para Estatísticas
      const start = new Date(entry.entry_time).getTime();
      const end = entry.exit_time ? new Date(entry.exit_time).getTime() : new Date().getTime();
      const durationMinutes = (end - start) / (1000 * 60);

      if (durationMinutes < 60) dUnder1h++;
      else if (durationMinutes < 240) dUnder4h++;
      else dOver4h++;

      // Identificar veículos com longa permanência (> 24h) ainda no pátio
      if (!entry.exit_time && durationMinutes > 24 * 60) {
         delayed.push({
             id: entry.id,
             plate: entry.cached_data?.vehicle_plate || '---',
             model: entry.cached_data?.vehicle_model || 'Veículo',
             entryTime: entry.entry_time,
             hours: Math.floor(durationMinutes / 60)
         });
      }

      if (entry.entry_time >= todayStart) todayCount++;
      if (entry.entry_time >= monthStart) monthCount++;

      const hour = new Date(entry.entry_time).getHours();
      hoursCount[hour]++;

      const driverName = entry.cached_data?.driver_name;
      if (driverName) {
        driverCounts[driverName] = (driverCounts[driverName] || 0) + 1;
      }
    });

    occurrences.forEach((occ: any) => {
      const hour = new Date(occ.created_at).getHours();
      occurrencesHoursCount[hour]++;
    });

    const maxHourCount = Math.max(...hoursCount);
    const busiestHourIndex = hoursCount.indexOf(maxHourCount);

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
    setDurationStats({ 
        under1h: dUnder1h, 
        under4h: dUnder4h, 
        over4h: dOver4h, 
        delayedVehicles: delayed,
        total: entries.length || 1
    });
    
    // Company Stats
    if (tenants.length > 1) {
        const stats = tenants.map(t => ({
            name: t.name,
            count: allData.entries[t.id]?.length || 0,
            occurrencesCount: allData.occurrences[t.id]?.length || 0
        })).sort((a, b) => b.count - a.count);
        setCompanyStats(stats);
    }

    setLoading(false);
  }, [allData, activeTenantId, tenants]);

  if (!user && !userProfile && !loading) {
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
                               <span className="mb-1 text-[10px] font-bold text-blue-600">{stat.count > 0 ? stat.count : ''}</span>
                               <div 
                                 className="w-full bg-blue-600 rounded-t-sm transition-all duration-500 hover:bg-blue-700 relative" 
                                 style={{ height: `${(stat.count / max) * 100}%` }}
                                 title={`Entradas: ${stat.count}`}
                               ></div>
                           </div>
                           <div className="flex flex-col items-center justify-end h-full w-1/2 group/bar">
                               <span className="mb-1 text-[10px] font-bold text-red-600">{stat.occurrencesCount > 0 ? stat.occurrencesCount : ''}</span>
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

        {/* Coluna Lateral (Direita) - Análise de Permanência */}
        <div className="xl:col-span-3">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
             <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
               <Timer className="w-5 h-5 text-gray-500" /> Tempos de Permanência
             </h3>
             
             <div className="space-y-6 flex-1">
                {/* Distribution Bars */}
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Curta Duração (&lt; 1h)</span>
                            <span className="font-bold text-gray-900">{durationStats.under1h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(durationStats.under1h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Média Duração (1h - 4h)</span>
                            <span className="font-bold text-gray-900">{durationStats.under4h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(durationStats.under4h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Longa Duração (&gt; 4h)</span>
                            <span className="font-bold text-gray-900">{durationStats.over4h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${(durationStats.over4h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Critical Alerts */}
                <div className="mt-8 border-t border-gray-100 pt-6">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" /> Veículos em Pátio &gt; 24h
                    </h4>
                    
                    <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                        {durationStats.delayedVehicles.length > 0 ? (
                            durationStats.delayedVehicles.map((v, idx) => (
                                <div key={idx} className="bg-red-50 border border-red-100 p-3 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-red-900">{v.plate}</p>
                                            <p className="text-xs text-red-700">{v.model}</p>
                                        </div>
                                        <span className="bg-white text-red-600 text-xs font-bold px-2 py-1 rounded border border-red-100">
                                            {v.hours}h
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-red-500 mt-2">
                                        Entrada: {new Date(v.entryTime).toLocaleDateString('pt-BR')} {new Date(v.entryTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
                                <p className="text-sm text-gray-500">Nenhum veículo excedendo 24h.</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
