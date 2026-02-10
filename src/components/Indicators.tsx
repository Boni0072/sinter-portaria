import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from './firebase';
import { getDatabase, ref, get, query, orderByChild, equalTo, limitToLast, onValue, startAt, endAt } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Clock, Truck, Users, ArrowDownRight, Activity, Calendar, Building2, AlertTriangle, Timer, Maximize2, X, Download, FileText, MapPin, Car } from 'lucide-react';

interface DashboardMetrics {
  vehiclesInside: number;
  entriesToday: number;
  entriesThisMonth: number;
  avgStayDurationMinutes: number;
  completedVisits: number;
  busiestHour: number;
  totalDrivers: number;
  totalOccurrences: number;
  concludedOccurrences: number;
}

interface TopDriver {
  name: string;
  count: number;
  photo_url?: string;
}

type AllData = {
  entries: Record<string, any[]>;
  occurrences: Record<string, any[]>;
  drivers: Record<string, any[]>;
};

export default function Indicators({ tenantId: propTenantId }: { tenantId?: string }) {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [realTimeVehiclesInside, setRealTimeVehiclesInside] = useState(0);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    vehiclesInside: 0,
    entriesToday: 0,
    entriesThisMonth: 0,
    avgStayDurationMinutes: 0,
    completedVisits: 0,
    busiestHour: 0,
    totalDrivers: 0,
    totalOccurrences: 0,
    concludedOccurrences: 0
  });
  const [hourlyDistribution, setHourlyDistribution] = useState<number[]>(new Array(24).fill(0));
  const [occurrencesHourlyDistribution, setOccurrencesHourlyDistribution] = useState<number[]>(new Array(24).fill(0));
  const [dailyDistribution, setDailyDistribution] = useState<number[]>([]);
  const [occurrencesDailyDistribution, setOccurrencesDailyDistribution] = useState<number[]>([]);
  const [dailyOccurrencesStats, setDailyOccurrencesStats] = useState<{concluded: number, pending: number}[]>([]);
  const [topDrivers, setTopDrivers] = useState<TopDriver[]>([]);
  const [tenants, setTenants] = useState<{id: string, name: string, address?: string, lat?: string, lon?: string, geocoded?: boolean, parkingSpots?: number}[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [companyStats, setCompanyStats] = useState<{id: string, name: string, count: number, occurrencesCount: number, concludedOccurrences: number}[]>([]);
  const [selectedCompanyDetails, setSelectedCompanyDetails] = useState<{name: string, type: 'entries' | 'occurrences' | 'drivers', data: any[]} | null>(null);
  const [carrierStats, setCarrierStats] = useState<{name: string, count: number}[]>([]);
  const [error, setError] = useState<any>(null);
  const [allData, setAllData] = useState<AllData>({ entries: {}, occurrences: {}, drivers: {} });
  const [vehiclesInsideData, setVehiclesInsideData] = useState<Record<string, any[]>>({});
  const [tenantDrivers, setTenantDrivers] = useState<Record<string, any[]>>({});
  const [durationStats, setDurationStats] = useState({
    under1h: 0,
    under4h: 0,
    over4h: 0,
    delayedVehicles: [] as any[],
    total: 1
  });
  const [delayedThreshold, setDelayedThreshold] = useState<number>(24);
  const [shortDurationLimit, setShortDurationLimit] = useState<number>(1);
  const [mediumDurationLimit, setMediumDurationLimit] = useState<number>(4);
  const [chartStartDate, setChartStartDate] = useState<Date>(new Date());
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [showOccupancyModal, setShowOccupancyModal] = useState(false);
  const database = getDatabase(auth.app);

  const activeTenantId = selectedTenantId || propTenantId || (userProfile as any)?.tenantId || user?.uid;
  
  // Fingerprint para evitar recarregamento dos listeners quando apenas dados de geocodificação mudam
  const tenantIdsFingerprint = tenants.map(t => t.id).sort().join(',');

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
        let list: {id: string, name: string, address?: string, parkingSpots?: number}[] = [];

        // 1. Busca tenants permitidos explicitamente
        if (allowedTenants && Array.isArray(allowedTenants) && allowedTenants.length > 0) {
          const promises = allowedTenants.map(id => get(ref(database, `tenants/${id}`)));
          const snapshots = await Promise.all(promises);
          
          snapshots.forEach((snap, index) => {
            if (snap.exists()) {
              list.push({
                id: allowedTenants[index],
                name: snap.val().name || 'Empresa sem nome',
                address: snap.val().address,
                parkingSpots: snap.val().parkingSpots
              });
            }
          });
        }

        // 2. Busca a própria empresa do usuário (Matriz ou Filial)
        const myTenantId = (userProfile as any)?.tenantId || user.uid;
        if (myTenantId) {
            const myTenantSnap = await get(ref(database, `tenants/${myTenantId}`));
            if (myTenantSnap.exists()) {
                list.push({
                    id: myTenantSnap.key!,
                    name: myTenantSnap.val().name || 'Minha Empresa',
                    address: myTenantSnap.val().address,
                    parkingSpots: myTenantSnap.val().parkingSpots
                });
            }

            // 3. Busca filiais vinculadas à empresa do usuário (caso seja Matriz)
            const qChildren = query(ref(database, 'tenants'), orderByChild('parentId'), equalTo(myTenantId));
            const snapshotChildren = await get(qChildren);
            if (snapshotChildren.exists()) {
                snapshotChildren.forEach(child => {
                    list.push({
                        id: child.key!,
                        name: child.val().name || 'Filial',
                        address: child.val().address,
                        parkingSpots: child.val().parkingSpots
                    });
                });
            }
        }

        // 4. Se for admin, busca todas as empresas que ele é dono (garantia extra)
        if (userProfile?.role === 'admin') {
           const qOwner = query(ref(database, 'tenants'), orderByChild('owner_id'), equalTo(user.uid));
           const snapshotOwner = await get(qOwner);
           if (snapshotOwner.exists()) {
             snapshotOwner.forEach(child => {
               list.push({
                 id: child.key!,
                 name: child.val().name || 'Empresa sem nome',
                 address: child.val().address,
                 parkingSpots: child.val().parkingSpots
               });
             });
           }
        }

        list = list.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        
        setTenants(list);

        if (propTenantId) {
           setSelectedTenantId(propTenantId);
        } else if (list.length > 1) {
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

  // Listener para motoristas por tenant
  useEffect(() => {
    if (!activeTenantId) return;
    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : [activeTenantId];
    
    const unsubscribes = targetIds.map(tid => {
        return onValue(ref(database, `tenants/${tid}/drivers`), (snapshot) => {
            const drivers: any[] = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => drivers.push({ id: child.key!, ...child.val() }));
            }
            setTenantDrivers(prev => ({ ...prev, [tid]: drivers }));
        });
    });

    return () => unsubscribes.forEach(u => u());
  }, [activeTenantId, tenants]);

  // Effect for setting up listeners
  useEffect(() => {
    if (!activeTenantId || !user) return;

    // Se for personalizado e não tiver as datas, não busca ainda
    if (dateRange === 'custom' && (!customStartDate || !customEndDate)) {
      return;
    }

    setLoading(true);
    setError(null);
    setAllData({ entries: {}, occurrences: {}, drivers: {} }); // Reset data

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
    } else if (dateRange === 'custom') {
      const [startYear, startMonth, startDay] = customStartDate.split('-').map(Number);
      startDate.setFullYear(startYear, startMonth - 1, startDay);
      startDate.setHours(0, 0, 0, 0);

      const [endYear, endMonth, endDay] = customEndDate.split('-').map(Number);
      endDate = new Date();
      endDate.setFullYear(endYear, endMonth - 1, endDay);
      endDate.setDate(endDate.getDate() + 1); // Dia seguinte 00:00 para pegar o dia inteiro
      endDate.setHours(0, 0, 0, 0);
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
      // RTDB Queries
      let entriesQuery = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), startAt(startDate.toISOString()));
      let occurrencesQuery = query(ref(database, `tenants/${tid}/occurrences`), orderByChild('created_at'), startAt(startDate.toISOString()));

      if (endDate) {
        entriesQuery = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), startAt(startDate.toISOString()), endAt(endDate.toISOString()));
        occurrencesQuery = query(ref(database, `tenants/${tid}/occurrences`), orderByChild('created_at'), startAt(startDate.toISOString()), endAt(endDate.toISOString()));
      }

      const entriesUnsub = onValue(entriesQuery, 
        (snapshot) => {
          const data: any[] = [];
          if (snapshot.exists()) {
            snapshot.forEach(child => { data.push({ id: child.key!, ...child.val() }); });
          }
          setAllData(prev => ({ ...prev, entries: { ...prev.entries, [tid]: data } }));
        },
        (err) => { console.error(`Error on entries listener for ${tid}:`, err); setError("Erro ao carregar dados de entrada."); }
      );
      
      const occurrencesUnsub = onValue(occurrencesQuery, 
        (snapshot) => {
          const data: any[] = [];
          if (snapshot.exists()) {
            snapshot.forEach(child => { data.push({ id: child.key!, ...child.val() }); });
          }
          setAllData(prev => ({ ...prev, occurrences: { ...prev.occurrences, [tid]: data } }));
        },
        (err) => { console.error(`Error on occurrences listener for ${tid}:`, err); setError("Erro ao carregar dados de ocorrências."); }
      );

      return [entriesUnsub, occurrencesUnsub];
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [activeTenantId, dateRange, tenantIdsFingerprint, user, customStartDate, customEndDate]);

  // Listener para veículos atualmente no pátio (sem filtro de data)
  useEffect(() => {
    if (!user) return;

    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : (activeTenantId ? [activeTenantId] : []);
    if (targetIds.length === 0) {
        setVehiclesInsideData({});
        return;
    }

    const unsubscribes = targetIds.map(tid => {
      // Buscamos os registros de entrada sem filtro de data, mas limitados aos mais recentes para performance
      // O filtro de 'no pátio' será feito localmente para garantir compatibilidade com null ou ""
      const q = query(ref(database, `tenants/${tid}/entries`), orderByChild('entry_time'), limitToLast(500));
      return onValue(q, (snapshot) => {
        const inside: any[] = [];
        if (snapshot.exists()) {
           snapshot.forEach(child => {
             const val = child.val();
             if (!val.exit_time) inside.push({ id: child.key!, ...val });
           });
        }
        
        setVehiclesInsideData(prev => ({ ...prev, [tid]: inside }));
      }, (error) => {
        console.error(`Erro ao buscar veículos no pátio para ${tid}:`, error);
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [activeTenantId, tenantIdsFingerprint, user]); // Depende apenas do tenant, não da data

  
  // Atualiza o contador de veículos no pátio em tempo real
  useEffect(() => {
    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : (activeTenantId ? [activeTenantId] : []);
    const total = targetIds.reduce((acc, tid) => {
      const vehicles = vehiclesInsideData[tid] || [];
      return acc + vehicles.length;
    }, 0);
    setRealTimeVehiclesInside(total);
  }, [vehiclesInsideData, activeTenantId, tenants]);

  // Effect for calculations
  useEffect(() => {
    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : [activeTenantId];
    const allEntriesLoaded = targetIds.every(tid => allData.entries[tid] !== undefined);
    const allOccurrencesLoaded = targetIds.every(tid => allData.occurrences[tid] !== undefined);

    if (!allEntriesLoaded || !allOccurrencesLoaded || targetIds.length === 0) {
      return;
    }

    const entries = Object.values(allData.entries).flat();
    const occurrences = Object.values(allData.occurrences).flat();
    const totalDrivers = Object.values(tenantDrivers).flat().length;
    const currentVehiclesInside = targetIds.flatMap(tid => vehiclesInsideData[tid] || []);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let insideCount = 0;
    let todayCount = 0;
    let monthCount = 0;
    let totalDurationMinutes = 0;
    let completedVisits = 0;
    
    // Lógica para distribuição por horário (Linear ou Agregada)
    let hoursCount: number[] = [];
    let occurrencesHoursCount: number[] = [];
    let rangeStartForCalc = new Date();
    rangeStartForCalc.setHours(0,0,0,0);
    let rangeEndForCalc = new Date();
    rangeEndForCalc.setHours(23,59,59,999);

    // Determina o início e fim do intervalo para cálculo contínuo
    if (dateRange === 'today') {
        // Já está configurado para hoje
    } else if (dateRange === 'thisWeek') {
        const day = rangeStartForCalc.getDay();
        rangeStartForCalc.setDate(rangeStartForCalc.getDate() - day);
    } else if (dateRange === 'lastWeek') {
        const day = rangeStartForCalc.getDay();
        rangeStartForCalc.setDate(rangeStartForCalc.getDate() - day - 7);
        rangeEndForCalc = new Date(rangeStartForCalc);
        rangeEndForCalc.setDate(rangeStartForCalc.getDate() + 6);
        rangeEndForCalc.setHours(23,59,59,999);
    } else if (dateRange === '7d') {
        rangeStartForCalc.setDate(rangeStartForCalc.getDate() - 7);
    } else if (dateRange === '30d') {
        rangeStartForCalc.setDate(rangeStartForCalc.getDate() - 30);
    } else if (dateRange === 'thisMonth') {
        rangeStartForCalc.setDate(1);
    } else if (dateRange === 'custom' && customStartDate && customEndDate) {
        const [y1, m1, d1] = customStartDate.split('-').map(Number);
        rangeStartForCalc.setFullYear(y1, m1 - 1, d1);
        rangeStartForCalc.setHours(0,0,0,0);
        
        const [y2, m2, d2] = customEndDate.split('-').map(Number);
        rangeEndForCalc.setFullYear(y2, m2 - 1, d2);
        rangeEndForCalc.setHours(23,59,59,999);
    }

    setChartStartDate(rangeStartForCalc);

    const totalHours = Math.ceil((rangeEndForCalc.getTime() - rangeStartForCalc.getTime()) / (1000 * 60 * 60));
    const safeTotalHours = Math.max(totalHours, 24);
    
    hoursCount = new Array(safeTotalHours).fill(0);
    occurrencesHoursCount = new Array(safeTotalHours).fill(0);
    
    const totalDays = Math.ceil((rangeEndForCalc.getTime() - rangeStartForCalc.getTime()) / (1000 * 60 * 60 * 24));
    const safeTotalDays = Math.max(totalDays, 1);
    const daysCount = new Array(safeTotalDays).fill(0);
    const occurrencesDaysCount = new Array(safeTotalDays).fill(0);
    const occurrencesDaysBreakdown = new Array(safeTotalDays).fill(null).map(() => ({ concluded: 0, pending: 0 }));
    let concludedOccurrencesCount = 0;

    const driverStats: Record<string, { count: number, photo_url?: string }> = {};
    const carrierStatsMap: Record<string, number> = {};
    
    entries.forEach((entry: any) => {
      let duration = 0;

      if (!entry.exit_time) {
        insideCount++;
        const start = new Date(entry.entry_time).getTime();
        const end = new Date().getTime();
        duration = (end - start) / (1000 * 60);
      } else {
        const start = new Date(entry.entry_time).getTime();
        const end = new Date(entry.exit_time).getTime();
        duration = (end - start) / (1000 * 60);
      }

      if (duration > 0 && duration < 1440) {
        totalDurationMinutes += duration;
        completedVisits++;
      }

      if (entry.entry_time >= todayStart) todayCount++;
      if (entry.entry_time >= monthStart) monthCount++;

      const entryTime = new Date(entry.entry_time).getTime();
      const diff = entryTime - rangeStartForCalc.getTime();
      const idx = Math.floor(diff / (1000 * 60 * 60));
      if (idx >= 0 && idx < hoursCount.length) {
          hoursCount[idx]++;
      }
      
      const diffDays = Math.floor((entryTime - rangeStartForCalc.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < daysCount.length) {
          daysCount[diffDays]++;
      }

      const driverName = entry.cached_data?.driver_name;
      if (driverName) {
        if (!driverStats[driverName]) {
            driverStats[driverName] = { count: 0, photo_url: entry.cached_data?.driver_photo_url };
        }
        driverStats[driverName].count++;
        if (!driverStats[driverName].photo_url && entry.cached_data?.driver_photo_url) {
             driverStats[driverName].photo_url = entry.cached_data.driver_photo_url;
        }
      }

      const carrier = entry.cached_data?.vehicle_company || 'Particular';
      carrierStatsMap[carrier] = (carrierStatsMap[carrier] || 0) + 1;
    });

    occurrences.forEach((occ: any) => {
      if (occ.status === 'Concluída') {
        concludedOccurrencesCount++;
      }
      const occTime = new Date(occ.created_at).getTime();
      const diff = occTime - rangeStartForCalc.getTime();
      const idx = Math.floor(diff / (1000 * 60 * 60));
      if (idx >= 0 && idx < occurrencesHoursCount.length) {
          occurrencesHoursCount[idx]++;
      }
      
      const diffOccDays = Math.floor((occTime - rangeStartForCalc.getTime()) / (1000 * 60 * 60 * 24));
      if (diffOccDays >= 0 && diffOccDays < occurrencesDaysCount.length) {
          occurrencesDaysCount[diffOccDays]++;
          if (occ.status === 'Concluída') {
              occurrencesDaysBreakdown[diffOccDays].concluded++;
          } else {
              occurrencesDaysBreakdown[diffOccDays].pending++;
          }
      }
    });

    const maxHourCount = Math.max(...hoursCount);
    const busiestHourIndex = hoursCount.indexOf(maxHourCount);

    const sortedDrivers = Object.entries(driverStats)
      .map(([name, data]) => ({ name, count: data.count, photo_url: data.photo_url }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sortedCarriers = Object.entries(carrierStatsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    setMetrics({
      vehiclesInside: currentVehiclesInside.length,
      entriesToday: todayCount,
      entriesThisMonth: monthCount,
      avgStayDurationMinutes: completedVisits > 0 ? Math.round(totalDurationMinutes / completedVisits) : 0,
      completedVisits: completedVisits,
      busiestHour: busiestHourIndex,
      totalDrivers: totalDrivers,
      totalOccurrences: occurrences.length,
      concludedOccurrences: concludedOccurrencesCount
    });

    setHourlyDistribution(hoursCount);
    setOccurrencesHourlyDistribution(occurrencesHoursCount);
    setDailyDistribution(daysCount);
    setOccurrencesDailyDistribution(occurrencesDaysCount);
    setDailyOccurrencesStats(occurrencesDaysBreakdown);
    setTopDrivers(sortedDrivers);
    setCarrierStats(sortedCarriers);
    // Company Stats
    if (tenants.length > 1) {
        const stats = tenants.map(t => {
            const tenantOccurrences = allData.occurrences[t.id] || [];
            const concluded = tenantOccurrences.filter((occ: any) => occ.status === 'Concluída').length;

            return {
                id: t.id,
                name: t.name,
                count: allData.entries[t.id]?.length || 0,
                occurrencesCount: tenantOccurrences.length,
                concludedOccurrences: concluded
            };
        }).sort((a, b) => b.count - a.count);
        setCompanyStats(stats);
    }

    setLoading(false);
  }, [allData, activeTenantId, tenants, tenantDrivers, vehiclesInsideData]);

  // Effect for Stay Duration calculations (real-time, not date-filtered)
  useEffect(() => {
    const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : [activeTenantId];
    const vehiclesInside = targetIds.flatMap(tid => vehiclesInsideData[tid] || []);

    let dUnder1h = 0;
    let dUnder4h = 0;
    let dOver4h = 0;
    const delayedMap = new Map<string, any>();

    vehiclesInside.forEach((entry: any) => {
      const start = new Date(entry.entry_time).getTime();
      const end = new Date().getTime(); // Always 'now' because they are currently inside
      const durationMinutes = (end - start) / (1000 * 60);

      if (durationMinutes < shortDurationLimit * 60) {
        dUnder1h++;
      } else if (durationMinutes < mediumDurationLimit * 60) {
        dUnder4h++;
      } else {
        dOver4h++;
      }

      // Identify vehicles with long stays (> threshold) that are still inside
      if (durationMinutes > delayedThreshold * 60) {
         const plate = entry.cached_data?.vehicle_plate || '---';
         const existing = delayedMap.get(plate);
         
         if (!existing || new Date(entry.entry_time) < new Date(existing.entryTime)) {
             delayedMap.set(plate, {
                 id: entry.id,
                 plate: plate,
                 model: entry.cached_data?.vehicle_model || 'Veículo',
                 driverName: entry.cached_data?.driver_name || 'Motorista',
                 entryTime: entry.entry_time,
                 hours: Math.floor(durationMinutes / 60)
             });
         }
      }
    });

    setDurationStats({ 
        under1h: dUnder1h, 
        under4h: dUnder4h, 
        over4h: dOver4h, 
        delayedVehicles: Array.from(delayedMap.values()),
        total: vehiclesInside.length || 1
    });
  }, [vehiclesInsideData, activeTenantId, tenants, delayedThreshold, shortDurationLimit, mediumDurationLimit]);

  // Cálculo de Vagas
  const totalSpots = tenants.reduce((acc, t) => {
    if (activeTenantId === 'all' || t.id === activeTenantId) {
        return acc + (t.parkingSpots || 0);
    }
    return acc;
  }, 0);
  const availableSpots = Math.max(0, totalSpots - realTimeVehiclesInside);

  // Efeito para buscar endereços via geolocalização (Geocodificação Reversa) para o modal
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!selectedCompanyDetails || selectedCompanyDetails.type !== 'entries') return;
      
      const entriesToFetch = selectedCompanyDetails.data.filter((e: any) => e.location && !addresses[e.id]);
      
      for (const entry of entriesToFetch) {
        if (!entry.location) continue;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${entry.location.lat}&lon=${entry.location.lng}&addressdetails=1`);
          const data = await res.json();
          if (data.address) {
            const road = data.address.road || data.address.street || data.address.pedestrian || '';
            const number = data.address.house_number || '';
            const city = data.address.city || data.address.town || data.address.village || '';
            const summary = [road, number].filter(Boolean).join(', ') + (city ? ` - ${city}` : '');
            setAddresses(prev => ({ ...prev, [entry.id]: summary }));
          } else if (data.display_name) {
            const summary = data.display_name.split(',').slice(0, 3).join(',');
            setAddresses(prev => ({ ...prev, [entry.id]: summary }));
          }
          await new Promise(r => setTimeout(r, 1100));
        } catch (e) {
          console.error("Erro ao buscar endereço:", e);
        }
      }
    };
    
    if (selectedCompanyDetails) fetchAddresses();
  }, [selectedCompanyDetails]);

  const handleBarClick = (tenantId: string, tenantName: string, type: 'entries' | 'occurrences') => {
      const data = type === 'entries' ? allData.entries[tenantId] : allData.occurrences[tenantId];
      if (data && data.length > 0) {
          setSelectedCompanyDetails({
              name: tenantName,
              type,
              data
          });
      }
  };

  const handleCardClick = (metricType: string) => {
    const entries = Object.values(allData.entries).flat();
    const occurrences = Object.values(allData.occurrences).flat();
    const drivers = Object.values(tenantDrivers).flat();
    
    let data: any[] = [];
    let title = '';
    let type: 'entries' | 'occurrences' | 'drivers' = 'entries';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    switch (metricType) {
        case 'vehiclesInside': {
            const targetIds = activeTenantId === 'all' ? tenants.map(t => t.id) : [activeTenantId];
            data = targetIds.flatMap(tid => vehiclesInsideData[tid] || []).sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
            title = 'Veículos no Pátio';
            type = 'entries';
            break;
        }
        case 'entriesToday':
            data = entries.filter(e => e.entry_time >= todayStart).sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
            title = 'Entradas de Hoje';
            type = 'entries';
            break;
        case 'avgStayDuration':
            data = entries.sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
            title = 'Tempo de Permanência (Todos os Veículos)';
            type = 'entries';
            break;
        case 'totalDrivers':
            data = drivers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            title = 'Motoristas Cadastrados';
            type = 'drivers';
            break;
        case 'totalOccurrences':
            data = occurrences.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            title = 'Ocorrências Registradas';
            type = 'occurrences';
            break;
    }

    if (data.length > 0) {
        setSelectedCompanyDetails({
            name: title,
            type,
            data
        });
    }
  };

  const generateOccurrencePDF = (occ: any) => {
    const logo = localStorage.getItem('portal_custom_logo');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labels: Record<string, string> = {
        radioHT: 'Rádio HT',
        qtdBotons: 'Botons',
        qtdCarregadores: 'Carregadores',
        qtdCapaChuva: 'Capa de Chuva',
        qtdPendRonda: 'Pendrive de Ronda',
        qtdLanternas: 'Lanternas',
        arma1: 'Arma 1',
        arma2: 'Arma 2',
        arma3: 'Arma 3',
        arma4: 'Arma 4',
        municoes: 'Munições'
    };

    const htmlContent = `
      <html>
        <head>
          <title>Ocorrência - ${occ.title}</title>
          <style>
            * { box-sizing: border-box; }
            html, body { height: 100%; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 15px; padding-bottom: 35px; color: #333; max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; margin-bottom: 10px; flex-shrink: 0; }
            .logo { max-height: 50px; max-width: 150px; object-fit: contain; }
            .title-container { flex: 1; }
            .title { font-size: 20px; font-weight: bold; color: #1f2937; margin: 0; }
            .subtitle { color: #6b7280; font-size: 12px; margin-top: 2px; }
            .section { margin-bottom: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; page-break-inside: avoid; flex-shrink: 0; }
            .section-header { background-color: #f3f4f6; padding: 6px 10px; font-weight: bold; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
            .section-content { padding: 8px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
            .field { margin-bottom: 4px; }
            .label { font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 1px; display: block; }
            .value { font-size: 11px; color: #111827; font-weight: 500; }
            .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 5px; }
            .photo { flex: 1; min-width: 150px; height: 280px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
            .footer { position: fixed; bottom: 0; left: 0; width: 100%; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #eee; padding: 5px 0; background: #fff; }
            @media print {
                html, body { height: 100%; }
                body { padding: 0; padding-bottom: 35px; }
                .section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title-container">
              <h1 class="title">Relatório de Ocorrência</h1>
              <div class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
            </div>
            ${logo ? `<img src="${logo}" class="logo" />` : ''}
          </div>

          <div class="section" style="flex: 1; display: flex; flex-direction: column;">
            <div class="section-header">Detalhes Principais</div>
            <div class="section-content" style="flex: 1;">
              <div class="grid" style="grid-template-columns: 2fr 1fr 1fr; margin-bottom: 10px;">
                <div class="field">
                  <span class="label">Título</span>
                  <div class="value" style="font-size: 16px;">${occ.title}</div>
                </div>
                <div class="field">
                   <span class="label">Status</span>
                   <div class="value" style="font-weight: bold;">${occ.status || 'Pendente'}</div>
                </div>
                <div class="field">
                   <span class="label">Data do Registro</span>
                   <div class="value">${new Date(occ.created_at).toLocaleString('pt-BR')}</div>
                </div>
              </div>
              <div class="field" style="height: 100%; display: flex; flex-direction: column;">
                <span class="label">Descrição</span>
                <div class="value" style="white-space: pre-wrap; line-height: 1.5; flex: 1;">${occ.description}</div>
              </div>
            </div>
          </div>

          ${occ.vehicle ? `
          <div class="section">
            <div class="section-header">Veículo Envolvido</div>
            <div class="section-content grid">
              <div class="field"><span class="label">Placa</span><div class="value">${occ.vehicle.plate || '---'}</div></div>
              <div class="field"><span class="label">Modelo</span><div class="value">${occ.vehicle.model || '---'}</div></div>
              <div class="field"><span class="label">Cor</span><div class="value">${occ.vehicle.color || '---'}</div></div>
              <div class="field"><span class="label">Empresa</span><div class="value">${occ.vehicle.company || '---'}</div></div>
            </div>
          </div>` : ''}

          ${(occ.cargo_material || occ.weaponry) ? `
          <div class="section">
            <div class="section-header">Materiais e Armamento</div>
            <div class="section-content grid" style="grid-template-columns: repeat(6, 1fr);">
              ${occ.cargo_material ? Object.entries(occ.cargo_material).map(([k, v]) => `<div class="field"><span class="label">${labels[k] || k}</span><div class="value">${v || '---'}</div></div>`).join('') : ''}
              ${occ.weaponry ? Object.entries(occ.weaponry).map(([k, v]) => `<div class="field"><span class="label">${labels[k] || k}</span><div class="value">${v || '---'}</div></div>`).join('') : ''}
            </div>
          </div>` : ''}

          ${occ.photos && occ.photos.length > 0 ? `
          <div class="section">
            <div class="section-header">Evidências Fotográficas</div>
            <div class="section-content">
              <div class="photos">
                ${occ.photos.map((p: string) => `<img src="${p}" class="photo" />`).join('')}
              </div>
            </div>
          </div>` : ''}

          <div style="display: flex; gap: 10px; margin-top: 5px; break-inside: avoid;">
            ${occ.action_taken ? `
            <div class="section" style="flex: 1;">
              <div class="section-header">Ação Realizada</div>
              <div class="section-content" style="height: 100%;">
                <div class="value" style="white-space: pre-wrap; line-height: 1.5;">${occ.action_taken}</div>
              </div>
            </div>` : ''}

            ${occ.signature_url ? `
            <div class="section" style="${occ.action_taken ? 'width: 250px;' : 'flex: 1;'}">
              <div class="section-header">Assinatura</div>
              <div class="section-content" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                 <img src="${occ.signature_url}" style="max-height: 60px; max-width: 200px;" />
                 <div style="font-size: 10px; color: #666; margin-top: 5px;">
                    ${occ.signature_by ? `<div>Assinado por: <strong>${occ.signature_by}</strong></div>` : ''}
                   ${occ.signature_at ? `<div>Em: ${new Date(occ.signature_at).toLocaleString('pt-BR')}</div>` : ''}
                 </div>
              </div>
            </div>` : ''}
          </div>

          <div class="footer">
            Documento gerado eletronicamente pelo Sistema de Portaria.<br/>
            ID da Ocorrência: ${occ.id}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const generateAllOccurrencesPDF = (occurrences: any[], companyName: string) => {
    const logo = localStorage.getItem('portal_custom_logo');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labels: Record<string, string> = {
        radioHT: 'Rádio HT',
        qtdBotons: 'Botons',
        qtdCarregadores: 'Carregadores',
        qtdCapaChuva: 'Capa de Chuva',
        qtdPendRonda: 'Pendrive de Ronda',
        qtdLanternas: 'Lanternas',
        arma1: 'Arma 1',
        arma2: 'Arma 2',
        arma3: 'Arma 3',
        arma4: 'Arma 4',
        municoes: 'Munições'
    };

    const htmlContent = `
      <html>
        <head>
          <title>Relatório de Ocorrências - ${companyName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; padding-bottom: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { max-height: 60px; max-width: 200px; object-fit: contain; }
            .title-container { flex: 1; }
            .title { font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; }
            .subtitle { color: #6b7280; font-size: 14px; margin-top: 5px; }
            .occurrence-container { margin-bottom: 40px; page-break-inside: avoid; border-bottom: 1px dashed #ccc; padding-bottom: 20px; }
            .occurrence-container:last-child { border-bottom: none; }
            .section { margin-bottom: 15px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
            .section-header { background-color: #f3f4f6; padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
            .section-content { padding: 12px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .field { margin-bottom: 5px; }
            .label { font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; display: block; }
            .value { font-size: 13px; color: #111827; font-weight: 500; }
            .photos { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
            .photo { flex: 1; min-width: 150px; height: 200px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
            .footer { position: fixed; bottom: 0; left: 0; width: 100%; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; padding: 10px 0; background: #fff; }
            @media print {
                body { padding: 0; padding-bottom: 40px; }
                .occurrence-container { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title-container">
              <h1 class="title">Relatório de Ocorrências</h1>
              <div class="subtitle">Empresa: ${companyName}</div>
              <div class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
            </div>
            ${logo ? `<img src="${logo}" class="logo" />` : ''}
          </div>

          ${occurrences.map(occ => `
            <div class="occurrence-container">
              <div class="section">
                <div class="section-header">Detalhes Principais</div>
                <div class="section-content">
                  <div class="grid" style="grid-template-columns: 2fr 1fr 1fr; margin-bottom: 10px;">
                    <div class="field">
                      <span class="label">Título</span>
                      <div class="value" style="font-size: 16px;">${occ.title}</div>
                    </div>
                    <div class="field">
                       <span class="label">Status</span>
                       <div class="value" style="font-weight: bold;">${occ.status || 'Pendente'}</div>
                    </div>
                    <div class="field">
                       <span class="label">Data do Registro</span>
                       <div class="value">${new Date(occ.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                  </div>
                  <div class="field">
                    <span class="label">Descrição</span>
                    <div class="value" style="white-space: pre-wrap; line-height: 1.5;">${occ.description}</div>
                  </div>
                  ${occ.action_taken ? `
                  <div class="field" style="margin-top: 5px;">
                    <span class="label">Ação Realizada</span>
                    <div class="value" style="white-space: pre-wrap; line-height: 1.5;">${occ.action_taken}</div>
                  </div>` : ''}
                </div>
              </div>

              ${occ.vehicle ? `
              <div class="section">
                <div class="section-header">Veículo Envolvido</div>
                <div class="section-content grid">
                  <div class="field"><span class="label">Placa</span><div class="value">${occ.vehicle.plate || '---'}</div></div>
                  <div class="field"><span class="label">Modelo</span><div class="value">${occ.vehicle.model || '---'}</div></div>
                  <div class="field"><span class="label">Cor</span><div class="value">${occ.vehicle.color || '---'}</div></div>
                  <div class="field"><span class="label">Empresa</span><div class="value">${occ.vehicle.company || '---'}</div></div>
                </div>
              </div>` : ''}

              ${(occ.cargo_material || occ.weaponry) ? `
              <div class="section">
                <div class="section-header">Materiais e Armamento</div>
                <div class="section-content grid" style="grid-template-columns: repeat(6, 1fr);">
                  ${occ.cargo_material ? Object.entries(occ.cargo_material).map(([k, v]) => `<div class="field"><span class="label">${labels[k] || k}</span><div class="value">${v || '---'}</div></div>`).join('') : ''}
                  ${occ.weaponry ? Object.entries(occ.weaponry).map(([k, v]) => `<div class="field"><span class="label">${labels[k] || k}</span><div class="value">${v || '---'}</div></div>`).join('') : ''}
                </div>
              </div>` : ''}

              ${occ.photos && occ.photos.length > 0 ? `
              <div class="section">
                <div class="section-header">Evidências Fotográficas</div>
                <div class="section-content">
                  <div class="photos">
                    ${occ.photos.map((p: string) => `<img src="${p}" class="photo" />`).join('')}
                  </div>
                </div>
              </div>` : ''}
// 
              ${occ.signature_url ? `
              <div class="section">
                <div class="section-header">Assinatura</div>
                <div class="section-content">
                   <img src="${occ.signature_url}" style="max-height: 60px; max-width: 200px;" />
                   <div style="font-size: 10px; color: #666; margin-top: 5px;">
                      ${occ.signature_by ? `<div>Assinado por: <strong>${occ.signature_by}</strong></div>` : ''}
                      ${occ.signature_at ? `<div>Em: ${new Date(occ.signature_at).toLocaleString('pt-BR')}</div>` : ''}
                   </div>
                </div>
              </div>` : ''}
            </div>
          `).join('')}

          <div class="footer">
            Documento gerado eletronicamente pelo Sistema de Portaria.<br/>
            Total de Ocorrências: ${occurrences.length}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const generateEntriesPDF = (entriesList: any[]) => {
    const logo = localStorage.getItem('portal_custom_logo');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Agrupar entradas por data para corresponder ao layout de EntriesList
    const groupedEntries = entriesList.reduce((acc, entry) => {
        const entryDate = new Date(entry.entry_time);
        const date = entryDate.toLocaleDateString('pt-BR');
        const weekday = entryDate.toLocaleDateString('pt-BR', { weekday: 'long' });
        const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        const lastGroup = acc[acc.length - 1];
        
        if (lastGroup && lastGroup.date === date) {
          lastGroup.items.push(entry);
        } else {
          acc.push({ date, weekday: capitalizedWeekday, items: [entry] });
        }
        return acc;
    }, [] as { date: string; weekday: string; items: any[] }[]);

    const htmlContent = `
      <html>
        <head>
          <title>Relatório de Entradas e Saídas</title>
          <style>
            @page { size: landscape; margin: 10mm; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; padding-bottom: 30px; color: #111; font-size: 10px; -webkit-print-color-adjust: exact; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; }
            .logo { max-height: 50px; max-width: 150px; object-fit: contain; }
            .title-container { flex: 1; }
            .title { font-size: 20px; font-weight: bold; color: #1f2937; margin: 0; }
            .subtitle { color: #6b7280; font-size: 12px; margin-top: 2px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; }
            th { background-color: #f9fafb; text-align: left; padding: 8px 4px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
            td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; color: #1f2937; vertical-align: top; word-wrap: break-word; }
            
            .group-header { background-color: #f3f4f6; font-weight: bold; color: #374151; padding: 6px 10px; font-size: 11px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
            
            .status-badge { padding: 2px 6px; border-radius: 9999px; font-size: 9px; font-weight: bold; display: inline-block; }
            .status-open { background-color: #dcfce7; color: #166534; }
            .status-closed { background-color: #fee2e2; color: #991b1b; }
            
            .plate { font-weight: bold; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px; border: 1px solid #e5e7eb; }
            .driver-info { display: flex; flex-direction: column; }
            .driver-name { font-weight: 600; }
            .driver-doc { color: #6b7280; font-size: 9px; }
            
            .driver-photo { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid #e5e7eb; }
            .evidence-photo { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; border: 1px solid #e5e7eb; }
            .evidence-container { display: flex; gap: 4px; }
            .footer { position: fixed; bottom: 0; left: 0; width: 100%; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #eee; padding: 5px 0; background: #fff; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title-container">
              <h1 class="title">Relatório de Entradas e Saídas</h1>
              <div class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
              <div class="subtitle">Total de Registros: ${entriesList.length}</div>
            </div>
            ${logo ? `<img src="${logo}" class="logo" />` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 10%">Empresa</th>
                <th style="width: 8%">Placa</th>
                <th style="width: 8%">Marca</th>
                <th style="width: 10%">Modelo</th>
                <th style="width: 6%">Cor</th>
                <th style="width: 15%">Observação</th>
                <th style="width: 15%">Motorista</th>
                <th style="width: 10%">Usuário</th>
                <th style="width: 9%">Entrada</th>
                <th style="width: 9%">Saída</th>
                <th style="width: 8%">Local</th>
                <th style="width: 10%">Evidências</th>
              </tr>
            </thead>
            <tbody>
              ${groupedEntries.map(group => `
                <tr>
                  <td colspan="11" class="group-header">
                    ${group.date} - <span style="font-weight: normal;">${group.weekday}</span> <span style="font-size: 9px; color: #6b7280; margin-left: 5px;">(${group.items.length})</span>
                  </td>
                </tr>
                ${group.items.map(entry => `
                  <tr>
                    <td>${tenants.find(t => t.id === entry.tenantId)?.name || '---'}</td>
                    <td><span class="plate">${entry.cached_data?.vehicle_plate || '---'}</span></td>
                    <td>${entry.cached_data?.vehicle_brand || ''}</td>
                    <td>${entry.cached_data?.vehicle_model || ''}</td>
                    <td>${entry.cached_data?.vehicle_color || ''}</td>
                    <td>${entry.notes || ''}</td>
                    <td>
                      <div class="driver-info">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${entry.cached_data?.driver_photo_url ? `<img src="${entry.cached_data.driver_photo_url}" class="driver-photo" />` : ''}
                            <div>
                                <span class="driver-name" style="display: block;">${entry.cached_data?.driver_name || '---'}</span>
                                <span class="driver-doc" style="display: block;">${entry.cached_data?.driver_document || ''}</span>
                            </div>
                        </div>
                      </div>
                    </td>
                    <td>---</td>
                    <td>${new Date(entry.entry_time).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</td>
                    <td>
                      ${entry.exit_time 
                          ? `<span class="status-badge status-closed">${new Date(entry.exit_time).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>` 
                          : '<span class="status-badge status-open">NO PÁTIO</span>'}
                    </td>
                    <td>
                        ${entry.location ? `<a href="https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}" target="_blank" style="color: #2563eb; text-decoration: none;">Ver Mapa</a>` : '---'}
                    </td>
                    <td>
                        <div class="evidence-container">
                            ${entry.vehicle_photo_url ? `<img src="${entry.vehicle_photo_url}" class="evidence-photo" />` : ''}
                            ${entry.plate_photo_url ? `<img src="${entry.plate_photo_url}" class="evidence-photo" />` : ''}
                        </div>
                    </td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Documento gerado eletronicamente pelo Sistema de Portaria.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '---';
    return new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const renderChartSvg = (isExpanded: boolean) => {
      // Calculate Average Entries (Daily)
      const numberOfDays = Math.max(1, Math.ceil(hourlyDistribution.length / 24));
      
      const totalEntries = hourlyDistribution.reduce((acc, curr) => acc + curr, 0);
      const averageEntries = totalEntries / numberOfDays;

      // Calculate Average Occurrences (Daily)
      const totalOccurrences = occurrencesHourlyDistribution.reduce((acc, curr) => acc + curr, 0);
      const averageOccurrences = totalOccurrences / numberOfDays;

      const max = Math.max(...hourlyDistribution, ...occurrencesHourlyDistribution, averageEntries, averageOccurrences, 1);
      const width = Math.max(1500, hourlyDistribution.length * 100);
      const height = isExpanded ? 500 : 250;
      const paddingX = 40;
      const paddingY = 55;
      const chartWidth = width - paddingX;
      const chartHeight = height - paddingY * 2;
      
      const now = new Date();
      let currentX = -1;

      const gap = (chartWidth - 20) / (hourlyDistribution.length - 1);
      const diffHours = (now.getTime() - chartStartDate.getTime()) / 3600000;
      if (diffHours >= 0 && diffHours <= hourlyDistribution.length) {
          currentX = paddingX + (diffHours / (hourlyDistribution.length - 1)) * (chartWidth - 20);
      }

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

      const averageY = height - paddingY - (averageEntries / max) * chartHeight;
      const averageOccurrencesY = height - paddingY - (averageOccurrences / max) * chartHeight;

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - paddingY - ratio * chartHeight;
            return (
              <g key={ratio}>
                <line x1={paddingX} y1={y} x2={width} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                <text x={paddingX - 10} y={y + 4} textAnchor="end" fontSize="14" fill="#9ca3af">
                  {Math.round(ratio * max)}
                </text>
              </g>
            );
          })}

          {/* Average Line Entries */}
          {averageEntries > 0 && (
            <g className="animate-in fade-in duration-1000">
              <line 
                x1={paddingX} 
                y1={averageY} 
                x2={width} 
                y2={averageY} 
                stroke="#f97316" 
                strokeWidth="2" 
                strokeDasharray="5 5"
                className="opacity-70"
              />
              <text x={paddingX + 5} y={averageY - 5} textAnchor="start" fontSize="13" fill="#ea580c" fontWeight="bold" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                Média Diária Reg.: {averageEntries.toFixed(1)}
              </text>
              <text x={width - 5} y={averageY - 5} textAnchor="end" fontSize="13" fill="#ea580c" fontWeight="bold" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                Média Diária Reg.: {averageEntries.toFixed(1)}
              </text>
            </g>
          )}

          {/* Average Line Occurrences */}
          {averageOccurrences > 0 && (
            <g className="animate-in fade-in duration-1000">
              <line 
                x1={paddingX} 
                y1={averageOccurrencesY} 
                x2={width} 
                y2={averageOccurrencesY} 
                stroke="#ef4444" 
                strokeWidth="2" 
                strokeDasharray="3 3"
                className="opacity-70"
              />
              <text x={paddingX + 5} y={averageOccurrencesY - 5} textAnchor="start" fontSize="13" fill="#b91c1c" fontWeight="bold" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                Média Diária Oco.: {averageOccurrences.toFixed(1)}
              </text>
              <text x={width - 5} y={averageOccurrencesY - 5} textAnchor="end" fontSize="13" fill="#b91c1c" fontWeight="bold" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                Média Diária Oco.: {averageOccurrences.toFixed(1)}
              </text>
            </g>
          )}

          {/* Barra Vertical de Hora Atual */}
          {currentX >= 0 && (
          <>
          <line 
            x1={currentX} 
            y1={paddingY} 
            x2={currentX} 
            y2={height - paddingY} 
            stroke="#22c55e" 
            strokeWidth="2" 
            strokeDasharray="5 5"
          />
          <text x={currentX} y={paddingY - 8} textAnchor="middle" fontSize="12" fill="#22c55e" fontWeight="bold">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </text>
          </>
          )}

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
            const pointDate = new Date(chartStartDate.getTime() + point.index * 3600000);
            const hour = pointDate.getHours();
            const isNewDay = hour === 0 || i === 0;

            return (
              <g key={i} className="group">
                {/* Separator for new days */}
                {hour === 0 && i > 0 && (
                    <line 
                        x1={point.x - gap / 2} 
                        y1={paddingY} 
                        x2={point.x - gap / 2} 
                        y2={height - paddingY} 
                        stroke="#e5e7eb" 
                        strokeWidth="1" 
                        strokeDasharray="4 4" 
                    />
                )}

                <text 
                  x={point.x} 
                  y={height - 35} 
                  textAnchor="middle" 
                  fontSize="10" 
                  fill="#4b5563"
                  fontWeight="bold"
                >
                  {`${hour.toString().padStart(2, '0')}:00`}
                </text>
                {isNewDay && (
                    <text 
                      x={point.x + (12 * gap)} 
                      y={height - 15} 
                      textAnchor="middle" 
                      fontSize="14" 
                      fill="#6b7280"
                      fontWeight="bold"
                    >
                      {pointDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </text>
                )}
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
  };

  // Auto-scroll para centralizar a barra "Agora" no gráfico
  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      
      // Garante que o gráfico inicie na esquerda (primeira data)
      container.scrollLeft = 0;

      const now = new Date();
      const diffHours = (now.getTime() - chartStartDate.getTime()) / 3600000;
      
      // Lógica de coordenadas correspondente ao SVG para encontrar a posição X
      const width = Math.max(1500, hourlyDistribution.length * 100);
      const paddingX = 40;
      const chartWidth = width - paddingX;
      const currentX = paddingX + (diffHours / (hourlyDistribution.length - 1)) * (chartWidth - 20);
      
      // Calcula a proporção e a posição de rolagem
      const ratio = currentX / width;
      const scrollPosition = (container.scrollWidth * ratio) - (container.clientWidth / 2);
      
      setTimeout(() => {
        const start = container.scrollLeft;
        const change = scrollPosition - start;
        const duration = 20000; // 20 segundos para uma transição muito lenta
        let startTime: number | null = null;

        const animateScroll = (currentTime: number) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            
            const ease = (t: number, b: number, c: number, d: number) => {
                t /= d / 2;
                if (t < 1) return c / 2 * t * t + b;
                t--;
                return -c / 2 * (t * (t - 2) - 1) + b;
            };

            container.scrollLeft = ease(timeElapsed, start, change, duration);

            if (timeElapsed < duration) {
                requestAnimationFrame(animateScroll);
            } else {
                container.scrollLeft = scrollPosition;
            }
        };

        requestAnimationFrame(animateScroll);
      }, 1000);
    }
  }, [loading, dateRange, chartStartDate, hourlyDistribution.length]);

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
        <h2 className="text-3xl font-bold text-gray-800">Indicadores de Performance</h2>
        
        <div className="flex items-center gap-3">
          {tenants.length > 0 && (
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Building2 className="w-4 h-4 text-gray-500 mr-2" />
              <select 
                value={activeTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="bg-transparent border-none text-base text-gray-700 focus:ring-0 cursor-pointer outline-none max-w-[150px]"
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
              className="bg-transparent border-none text-base text-gray-700 focus:ring-0 cursor-pointer outline-none"
            >
              <option value="today">Hoje</option>
              <option value="thisWeek">Esta Semana</option>
              <option value="lastWeek">Semana Passada</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="thisMonth">Este Mês</option>
              <option value="custom">Personalizar Data</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                <input 
                    type="date" 
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-700 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-400">-</span>
                <input 
                    type="date" 
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-700 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </div>
          )}
          
          <span className="text-base text-gray-500 flex items-center gap-1 hidden sm:flex">
            <Activity className="w-4 h-4" /> Tempo Real
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Coluna Principal (Esquerda) */}
        <div className="xl:col-span-9 space-y-6">
          {/* Cards Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <div 
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-1"
              onClick={() => handleCardClick('vehiclesInside')}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium text-gray-500">Veículos no Pátio</p>
                  <h3 className="text-3xl font-bold text-blue-600 mt-2">{realTimeVehiclesInside}</h3>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">Agora</div>
            </div>

            <div 
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-1"
              onClick={() => handleCardClick('entriesToday')}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium text-gray-500">Entradas Hoje</p>
                  <h3 className="text-3xl font-bold text-green-600 mt-2">{metrics.entriesToday}</h3>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <ArrowDownRight className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">Total do dia</div>
            </div>

            <div 
              className="bg-cyan-50 p-4 rounded-xl border border-cyan-100 shadow-sm transition-all hover:-translate-y-1 cursor-pointer"
              onClick={() => setShowOccupancyModal(true)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium text-cyan-900">Vagas Disponíveis</p>
                  <h3 className="text-3xl font-bold text-cyan-700 mt-2">{availableSpots}</h3>
                </div>
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Car className="w-5 h-5 text-cyan-600" />
                </div>
              </div>
              <div className="mt-2 text-sm text-cyan-800">De um total de {totalSpots} vagas</div>
            </div>

            <div 
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-1"
              onClick={() => handleCardClick('avgStayDuration')}
              title={`Cálculo: Média de tempo de permanência de ${metrics.completedVisits} veículos (incluindo em pátio).`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium text-gray-500">Tempo Médio</p>
                  <h3 className="text-3xl font-bold text-purple-600 mt-2">
                    {Math.floor(metrics.avgStayDurationMinutes / 60)}h {(metrics.avgStayDurationMinutes % 60).toString().padStart(2, '0')}m
                  </h3>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">Baseado em {metrics.completedVisits} veículos</div>
            </div>

            <div 
              className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-1"
              onClick={() => handleCardClick('totalOccurrences')}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-medium text-red-900">Ocorrências</p>
                  <h3 className="text-3xl font-bold text-red-700 mt-2">{metrics.totalOccurrences}</h3>
                </div>
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
              </div>
              <div className="mt-2 text-sm text-red-800"><span className="font-bold">{metrics.totalOccurrences - metrics.concludedOccurrences}</span> Pendentes</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
            {/* Gráfico de Horários (Simples com CSS) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-7 relative group">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-gray-500" /> Distribuição por Horário ({
                    dateRange === 'today' ? 'Hoje' :
                    dateRange === 'thisWeek' ? 'Esta Semana' :
                    dateRange === 'lastWeek' ? 'Semana Passada' :
                    dateRange === '7d' ? '7 dias' : 
                    dateRange === '30d' ? '30 dias' : 
                    dateRange === 'thisMonth' ? 'Este Mês' : 'Período Personalizado'
                  })
                </h3>
                <button 
                  onClick={() => setIsChartExpanded(true)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  title="Expandir Gráfico"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
              
              <div className="overflow-x-auto pb-4 cursor-pointer" ref={scrollContainerRef} onClick={() => setIsChartExpanded(true)} title="Clique para expandir">
              <div className="relative h-64" style={{ minWidth: `${Math.max(1500, hourlyDistribution.length * 100)}px` }}>
                {(() => {
                  const max = Math.max(...hourlyDistribution, ...occurrencesHourlyDistribution, 1);
                  
                  const width = Math.max(1500, hourlyDistribution.length * 100);
                  const height = 250;
                  const paddingX = 40;
                  const paddingY = 55;
                  const chartWidth = width - paddingX;
                  const chartHeight = height - paddingY * 2;
                  
                  const now = new Date();
                  let currentX = -1;

                  const gap = (chartWidth - 20) / (hourlyDistribution.length - 1);
                  const diffHours = (now.getTime() - chartStartDate.getTime()) / 3600000;
                  if (diffHours >= 0 && diffHours <= hourlyDistribution.length) {
                      currentX = paddingX + (diffHours / (hourlyDistribution.length - 1)) * (chartWidth - 20);
                  }

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
                            <text x={paddingX - 10} y={y + 4} textAnchor="end" fontSize="14" fill="#9ca3af">
                              {Math.round(ratio * max)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Barra Vertical de Hora Atual */}
                      {currentX >= 0 && (
                      <>
                      <line 
                        x1={currentX} 
                        y1={paddingY} 
                        x2={currentX} 
                        y2={height - paddingY} 
                        stroke="#22c55e" 
                        strokeWidth="2" 
                        strokeDasharray="5 5"
                      />
                      <text x={currentX} y={paddingY - 8} textAnchor="middle" fontSize="12" fill="#22c55e" fontWeight="bold">
                        {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </text>
                      </>
                      )}

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
                        const pointDate = new Date(chartStartDate.getTime() + point.index * 3600000);
                        const hour = pointDate.getHours();
                        const isNewDay = hour === 0 || i === 0;

                        return (
                          <g key={i} className="group">
                            {/* Separator for new days */}
                            {hour === 0 && i > 0 && (
                                <line 
                                    x1={point.x - gap / 2} 
                                    y1={paddingY} 
                                    x2={point.x - gap / 2} 
                                    y2={height - paddingY} 
                                    stroke="#e5e7eb" 
                                    strokeWidth="1" 
                                    strokeDasharray="4 4" 
                                />
                            )}

                            <text 
                              x={point.x} 
                              y={height - 35} 
                              textAnchor="middle" 
                              fontSize="14" 
                              fill="#4b5563"
                              fontWeight="bold"
                            >
                              {`${hour.toString().padStart(2, '0')}:00`}
                            </text>
                            {isNewDay && (
                                <text 
                                  x={point.x + (12 * gap)} 
                                  y={height - 15} 
                                  textAnchor="middle" 
                                  fontSize="18" 
                                  fill="#6b7280"
                                  fontWeight="bold"
                                >
                                  {pointDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </text>
                            )}
                            <circle cx={point.x} cy={point.y} r={point.count > 0 ? 4 : 2} fill="white" stroke="#2563eb" strokeWidth="2" />
                            {point.count > 0 && (
                              <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1f2937">
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
                  <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#b91c1c">
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
              </div>
              
              <p className="text-sm text-center text-gray-400 mt-2">Horário do dia (0h - 23h)</p>
              
              <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  <span className="text-base text-gray-600">Entradas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-base text-gray-600">Ocorrências</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-orange-500"></div>
                  <span className="text-base text-gray-600">Média Diária Reg.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-red-400"></div>
                  <span className="text-base text-gray-600">Média Diária Oco.</span>
                </div>
              </div>
            </div>

            {/* Top Motoristas */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-3">
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500" /> Motoristas Mais Frequentes
              </h3>
              <div className="space-y-4">
                {topDrivers.length > 0 ? (
                  topDrivers.map((driver, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                          index === 1 ? 'bg-gray-200 text-gray-700' : 
                          index === 2 ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {index + 1}º
                        </div>
                        {driver.photo_url ? (
                           <img src={driver.photo_url} alt={driver.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                        ) : (
                           <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                             <Users className="w-4 h-4" />
                           </div>
                        )}
                        <span className="font-medium text-gray-700 text-base">{driver.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-gray-900">{driver.count}</span>
                        <span className="text-sm text-gray-500">acessos</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">Dados insuficientes para ranking.</p>
                )}
              </div>
            </div>
          </div>

          {/* Gráfico de Distribuição Diária */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-500" /> Distribuição Diária
                  </h3>
                  <div className="flex flex-col items-end">
                    <div className="flex gap-4 mb-1">
                        <span className="text-lg font-bold text-gray-400">Total: <span className="text-blue-600">{dailyDistribution.reduce((a, b) => a + b, 0)}</span></span>
                        <span className="text-lg font-bold text-gray-400">Total: <span className="text-red-600">{occurrencesDailyDistribution.reduce((a, b) => a + b, 0)}</span></span>
                    </div>
                    <div className="flex items-center justify-end gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-blue-600"></div>
                      <span className="text-base text-gray-600">Entradas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-red-500"></div>
                      <span className="text-base text-gray-600">Ocorrências</span>
                    </div>
                    </div>
                  </div>
              </div>
              <div className="h-32 flex items-end gap-2 overflow-x-auto pb-2 pt-6">
                {dailyDistribution.map((count, index) => {
                  const max = Math.max(...dailyDistribution, ...occurrencesDailyDistribution, 1);
                  const date = new Date(chartStartDate);
                  date.setDate(date.getDate() + index);
                  const occCount = occurrencesDailyDistribution[index];
                  const occStats = dailyOccurrencesStats[index] || { concluded: 0, pending: 0 };
                  
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center justify-end h-full min-w-[40px] group">
                      <div className="flex items-end justify-center gap-1 w-full h-full px-1">
                           <div className="w-full bg-blue-600 rounded-t-sm transition-all duration-500 relative group/bar" style={{ height: `${(count / max) * 100}%` }} title={`Entradas: ${count}`}>
                              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-lg font-bold text-blue-600">{count > 0 ? count : ''}</span>
                           </div>
                           <div className="w-full rounded-t-sm transition-all duration-500 relative flex flex-col justify-end overflow-hidden group/bar" style={{ height: `${(occCount / max) * 100}%` }} title={`Ocorrências: ${occCount} (Concluídas: ${occStats.concluded}, Pendentes: ${occStats.pending})`}>
                              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-lg font-bold text-red-600">{occCount > 0 ? occCount : ''}</span>
                              {occStats.pending > 0 && (
                                  <div style={{ height: `${(occStats.pending / occCount) * 100}%` }} className="w-full bg-red-500 flex items-center justify-center">
                                      <span className="text-[10px] font-bold text-white">{occStats.pending}</span>
                                  </div>
                              )}
                              {occStats.concluded > 0 && (
                                  <div style={{ height: `${(occStats.concluded / occCount) * 100}%` }} className="w-full bg-green-500 flex items-center justify-center">
                                      <span className="text-[10px] font-bold text-white">{occStats.concluded}</span>
                                  </div>
                              )}
                           </div>
                      </div>
                      <div className="mt-2 text-base text-gray-500 text-center whitespace-nowrap">
                        {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>

          {/* Gráfico Comparativo de Empresas (Apenas se houver mais de uma) */}
          {tenants.length > 1 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-gray-500" /> Comparativo de Registros por Empresa
                  </h3>
                  <div className="flex flex-col items-end">
                     <div className="flex gap-4 mb-1">
                          <span className="text-lg font-bold text-gray-400">Total: <span className="text-blue-600">{companyStats.reduce((acc, curr) => acc + curr.count, 0)}</span></span>
                          <span className="text-lg font-bold text-gray-400">Total: <span className="text-red-600">{companyStats.reduce((acc, curr) => acc + curr.occurrencesCount, 0)}</span></span>
                     </div>
                    <div className="flex items-center justify-end gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-blue-600"></div>
                          <span className="text-base text-gray-600">Entradas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                          <span className="text-base text-gray-600">Ocorr. Concluídas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-red-500"></div>
                          <span className="text-base text-gray-600">Ocorr. Pendentes</span>
                        </div>
                    </div>
                  </div>
              </div>
              <div className="h-32 flex items-end gap-2 sm:gap-4 pt-4 border-b border-gray-100">
                {companyStats.map((stat) => {
                  const max = Math.max(...companyStats.map(s => Math.max(s.count, s.occurrencesCount)), 1);
                  const pendingCount = stat.occurrencesCount - stat.concludedOccurrences;
                  const isAllConcluded = stat.occurrencesCount > 0 && pendingCount === 0;
                  const occurrenceTextColor = isAllConcluded ? 'text-green-600' : (stat.occurrencesCount > 0 ? 'text-red-600' : 'text-gray-400');
                  return (
                    <div key={stat.name} className="flex-1 flex flex-col items-center justify-end h-full group">
                      <div className="flex items-end justify-center gap-1 w-full h-full">
                           <div 
                             className="flex flex-col items-center justify-end h-full w-1/2 group/bar cursor-pointer transition-opacity hover:opacity-80"
                             onClick={() => handleBarClick(stat.id, stat.name, 'entries')}
                             title={`Ver detalhes de Entradas: ${stat.count}`}
                           >
                               <span className="mb-1 text-lg font-bold text-blue-600">{stat.count > 0 ? stat.count : ''}</span>
                               <div 
                                 className="w-full bg-blue-600 rounded-t-sm transition-all duration-500 relative" 
                                 style={{ height: `${(stat.count / max) * 100}%` }}
                               ></div>
                           </div>
                           <div 
                             className="flex flex-col items-center justify-end h-full w-1/2 group/bar cursor-pointer transition-opacity hover:opacity-80"
                             onClick={() => handleBarClick(stat.id, stat.name, 'occurrences')}
                             title={`Ocorrências: ${stat.occurrencesCount} (Concluídas: ${stat.concludedOccurrences}, Pendentes: ${pendingCount})`}
                           >
                               <span className={`mb-1 text-lg font-bold ${occurrenceTextColor}`}>{stat.occurrencesCount > 0 ? stat.occurrencesCount : ''}</span>
                               <div 
                                 className="w-full rounded-t-sm transition-all duration-500 relative flex flex-col justify-end overflow-hidden" 
                                 style={{ height: `${(stat.occurrencesCount / max) * 100}%` }}
                               >
                                    {pendingCount > 0 && (
                                        <div style={{ height: `${(pendingCount / stat.occurrencesCount) * 100}%` }} className="w-full bg-red-500 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-white">{pendingCount}</span>
                                        </div>
                                    )}
                                    {stat.concludedOccurrences > 0 && (
                                        <div style={{ height: `${(stat.concludedOccurrences / stat.occurrencesCount) * 100}%` }} className="w-full bg-green-500 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-white">{stat.concludedOccurrences}</span>
                                        </div>
                                    )}
                               </div>
                           </div>
                      </div>
                      <div className="mt-2 text-base text-gray-500 truncate w-full text-center" title={stat.name}>
                        {stat.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gráfico de Entradas por Transportadora */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-gray-500" /> Entradas por Transportadora
                  </h3>
              </div>
              <div className="h-32 flex items-end gap-2 sm:gap-4 pt-4 border-b border-gray-100 overflow-x-auto pb-2 custom-scrollbar">
                {carrierStats.map((stat) => {
                  const max = Math.max(...carrierStats.map(s => s.count), 1);
                  return (
                    <div key={stat.name} className="flex-1 flex flex-col items-center justify-end h-full group min-w-[80px]">
                      <div className="flex items-end justify-center gap-1 w-full h-full">
                           <div 
                             className="flex flex-col items-center justify-end h-full w-full group/bar cursor-pointer transition-opacity hover:opacity-80"
                             title={`Transportadora: ${stat.name} - Entradas: ${stat.count}`}
                           >
                               <span className="mb-1 text-lg font-bold text-blue-600">{stat.count}</span>
                               <div 
                                 className="w-full bg-blue-600 rounded-t-sm transition-all duration-500 relative" 
                                 style={{ height: `${(stat.count / max) * 100}%` }}
                               ></div>
                           </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-500 truncate w-full text-center" title={stat.name}>
                        {stat.name}
                      </div>
                    </div>
                  );
                })}
                {carrierStats.length === 0 && (
                    <div className="w-full text-center text-gray-400 py-8 flex items-center justify-center h-full">
                        Nenhum dado disponível no período.
                    </div>
                )}
              </div>
          </div>
        </div>

        {/* Coluna Lateral (Direita) - Análise de Permanência */}
        <div className="xl:col-span-3">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
             <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 shrink-0">
               <Timer className="w-5 h-5 text-gray-500" /> Tempos de Permanência
             </h3>
             
             <div className="flex-1 flex flex-col min-h-0">
                {/* Distribution Bars */}
                <div className="space-y-4 shrink-0">
                    <div>
                        <div className="flex justify-between items-center text-base mb-1">
                            <div className="flex items-center gap-1 text-gray-600">
                                <span>Curta Duração (&lt;</span>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={shortDurationLimit} 
                                    onChange={(e) => {
                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                        setShortDurationLimit(val);
                                        if (val >= mediumDurationLimit) setMediumDurationLimit(val + 1);
                                    }}
                                    className="w-8 py-0 text-center border border-gray-200 rounded text-sm font-bold text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <span>h)</span>
                            </div>
                            <span className="font-bold text-gray-900">{durationStats.under1h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(durationStats.under1h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center text-base mb-1">
                            <div className="flex items-center gap-1 text-gray-600">
                                <span>Média Duração ({shortDurationLimit}h -</span>
                                <input 
                                    type="number" 
                                    min={shortDurationLimit}
                                    value={mediumDurationLimit} 
                                    onChange={(e) => setMediumDurationLimit(Math.max(shortDurationLimit, parseInt(e.target.value) || 0))}
                                    className="w-8 py-0 text-center border border-gray-200 rounded text-sm font-bold text-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <span>h)</span>
                            </div>
                            <span className="font-bold text-gray-900">{durationStats.under4h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(durationStats.under4h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center text-base mb-1">
                            <span className="text-gray-600">Longa Duração (&gt; {mediumDurationLimit}h)</span>
                            <span className="font-bold text-gray-900">{durationStats.over4h}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${(durationStats.over4h / durationStats.total) * 100}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Critical Alerts */}
                <div className="mt-8 border-t border-gray-100 pt-6 flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-3 shrink-0">
                        <h4 className="text-base font-bold text-gray-800 flex items-center gap-2 whitespace-nowrap">
                            <AlertTriangle className="w-4 h-4 text-red-500" /> No pátio há mais de
                        </h4>
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-1 shadow-sm">
                            <input 
                                type="number" 
                                min="1" 
                                value={delayedThreshold} 
                                onChange={(e) => setDelayedThreshold(Math.max(1, parseInt(e.target.value) || 0))}
                                className="w-8 py-1 text-sm text-center font-bold text-gray-700 outline-none bg-transparent"
                            />
                            <span className="text-sm font-bold text-gray-500 pr-1">h</span>
                        </div>
                    </div>
                    
                    <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1">
                        {durationStats.delayedVehicles.length > 0 ? (
                            durationStats.delayedVehicles.map((v, idx) => (
                                <div key={idx} className="bg-red-50 border border-red-100 p-3 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-lg text-red-900">{v.plate}</p>
                                                <span className="bg-white text-red-600 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 shadow-sm">
                                                    {v.hours}h
                                                </span>
                                            </div>
                                            <p className="text-sm text-red-700 font-medium mt-0.5">{v.model}</p>
                                            <p className="text-xs text-red-600/80 flex items-center gap-1 mt-1">
                                                <Users className="w-3 h-3" /> {v.driverName}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-red-500 mt-2 flex items-center gap-1 border-t border-red-100 pt-2">
                                        <Clock className="w-3 h-3" />
                                        Entrada: {new Date(v.entryTime).toLocaleDateString('pt-BR')} {new Date(v.entryTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
                                <p className="text-base text-gray-500">Nenhum veículo excedendo {delayedThreshold}h.</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {isChartExpanded && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-0 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full h-full flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 rounded-none">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-gray-500" /> Distribuição por Horário (Expandido)
              </h3>
              <button 
                onClick={() => setIsChartExpanded(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
               <div className="bg-white rounded-xl shadow-sm p-4 min-w-[1500px] h-full">
                  <div className="relative h-full" style={{ minWidth: `${Math.max(1500, hourlyDistribution.length * 100)}px` }}>
                    {renderChartSvg(true)}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da Empresa */}
      {selectedCompanyDetails && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedCompanyDetails(null)}>
          <div className="bg-white w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    {selectedCompanyDetails.type === 'entries' ? <Truck className="w-6 h-6 text-blue-600" /> : selectedCompanyDetails.type === 'drivers' ? <Users className="w-6 h-6 text-orange-600" /> : <AlertTriangle className="w-6 h-6 text-red-600" />}
                    {selectedCompanyDetails.type === 'entries' ? 'Registros de Entrada' : selectedCompanyDetails.type === 'drivers' ? 'Motoristas' : 'Ocorrências'} - <span className="text-gray-600 font-normal">{selectedCompanyDetails.name}</span>
                </h3>
                <div className="flex items-center gap-2">
                    {selectedCompanyDetails.type === 'occurrences' && (
                        <button 
                            onClick={() => generateAllOccurrencesPDF(selectedCompanyDetails.data, selectedCompanyDetails.name)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-base font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            title="Gerar PDF com todas as ocorrências listadas"
                        >
                            <Download className="w-4 h-4" />
                            Relatório Completo
                        </button>
                    )}
                    <button onClick={() => setSelectedCompanyDetails(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                {selectedCompanyDetails.type === 'entries' ? (
                    <div className="space-y-3">
                        {selectedCompanyDetails.data.map((entry: any) => (
                            <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-all flex flex-col sm:flex-row justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-xl text-gray-900">{entry.cached_data?.vehicle_plate || '---'}</span>
                                        <span className="text-base bg-gray-100 px-2 py-0.5 rounded text-gray-600">{entry.cached_data?.vehicle_model}</span>
                                    </div>
                                    <p className="text-lg text-gray-600 flex items-center gap-1"><Users className="w-4 h-4" /> {entry.cached_data?.driver_name || 'Motorista não identificado'}</p>
                                    {entry.location && (
                                        <div className="mt-1">
                                            <a 
                                                href={`https://www.google.com/maps?q=${entry.location.lat},${entry.location.lng}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-base text-blue-600 hover:underline flex items-center gap-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MapPin className="w-4 h-4" /> Ver Localização
                                            </a>
                                            <span className="text-base text-gray-500 block ml-5" title={addresses[entry.id] || 'Buscando...'}>
                                                {addresses[entry.id] || 'Buscando endereço...'}
                                            </span>
                                        </div>
                                    )}
                                    {entry.notes && <p className="text-base text-gray-500 mt-2 italic">"{entry.notes}"</p>}
                                </div>
                                <div className="text-right text-base">
                                    <p className="text-green-600 font-medium text-lg">Entrada: {formatDateTime(entry.entry_time)}</p>
                                    {entry.exit_time ? (
                                        <p className="text-red-600 font-medium text-lg">Saída: {formatDateTime(entry.exit_time)}</p>
                                    ) : (
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-base rounded-full font-bold">No Pátio</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : selectedCompanyDetails.type === 'occurrences' ? (
                    <div className="space-y-2">
                        {selectedCompanyDetails.data.map((occ: any) => (
                            <div 
                              key={occ.id} 
                              className="bg-white border-l-4 border-red-500 rounded-r-lg p-3 shadow-sm hover:shadow transition-all cursor-pointer group"
                              onClick={() => generateOccurrencePDF(occ)}
                              title="Clique para gerar PDF da Ocorrência"
                            >
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-gray-900 text-lg group-hover:text-red-600 transition-colors truncate">{occ.title}</h4>
                                            <span className={`text-sm font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                                occ.status === 'Concluída' ? 'bg-green-100 text-green-800' : 
                                                occ.status === 'Em Andamento' ? 'bg-yellow-100 text-yellow-800' : 
                                                occ.status === 'Parada' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {occ.status || 'Pendente'}
                                            </span>
                                            {occ.signature_by && (
                                                <span className="text-sm text-gray-500 font-medium truncate max-w-[120px]" title={`Usuário: ${occ.signature_by}`}>
                                                    • {occ.signature_by}
                                                </span>
                                            )}
                                            <span className="text-sm text-gray-400 ml-auto shrink-0">{formatDateTime(occ.created_at)}</span>
                                        </div>
                                        
                                        <p className="text-base text-gray-600 line-clamp-2 mb-1">{occ.description}</p>
                                        
                                {occ.action_taken && (
                                            <div className="text-base text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100 mt-1">
                                                <span className="font-semibold text-gray-700">Ação:</span> <span className="line-clamp-1 inline">{occ.action_taken}</span>
                                    </div>
                                )}
                                    </div>

                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        {occ.signature_url && (
                                            <img src={occ.signature_url} alt="Assinatura" className="h-6 object-contain opacity-50 group-hover:opacity-100 transition-opacity" />
                                        )}
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <FileText className="w-4 h-4 text-blue-600" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedCompanyDetails.data.map((driver: any) => (
                            <div key={driver.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-all flex items-center gap-4">
                                {driver.photo_url ? (
                                    <img src={driver.photo_url} alt={driver.name} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-400">
                                        <Users className="w-6 h-6" />
                                    </div>
                                )}
                                <div>
                                    <h4 className="font-bold text-lg text-gray-900">{driver.name || 'Sem Nome'}</h4>
                                    <p className="text-base text-gray-600">CPF: {driver.document}</p>
                                    {driver.cnh && <p className="text-sm text-gray-500">CNH: {driver.cnh} {driver.cnh_category ? `(${driver.cnh_category})` : ''}</p>}
                                    {driver.cnh_validity && (
                                        <p className={`text-sm mt-1 ${new Date(driver.cnh_validity) < new Date() ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                            Validade: {new Date(driver.cnh_validity).toLocaleDateString('pt-BR')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Modal de Eficiência de Ocupação */}
      {showOccupancyModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowOccupancyModal(false)}>
          <div className="bg-white w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Car className="w-6 h-6 text-cyan-600" />
                    Eficiência de Ocupação
                </h3>
                <button onClick={() => setShowOccupancyModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                    <X className="w-6 h-6 text-gray-500" />
                </button>
             </div>
             <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-8 text-center">
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-base text-gray-500">Total de Vagas</p>
                        <p className="text-3xl font-bold text-gray-800">{totalSpots}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-base text-blue-600">Ocupadas</p>
                        <p className="text-3xl font-bold text-blue-700">{realTimeVehiclesInside}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-base text-green-600">Disponíveis</p>
                        <p className="text-3xl font-bold text-green-700">{availableSpots}</p>
                    </div>
                </div>

                <div className="mb-8">
                    <div className="flex justify-between text-base mb-1">
                        <span className="font-medium text-gray-700">Taxa de Ocupação Global</span>
                        <span className="font-bold text-lg text-gray-900">{totalSpots > 0 ? ((metrics.vehiclesInside / totalSpots) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 ${
                                (metrics.vehiclesInside / totalSpots) > 0.9 ? 'bg-red-500' : 
                                (metrics.vehiclesInside / totalSpots) > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${totalSpots > 0 ? Math.min(100, (metrics.vehiclesInside / totalSpots) * 100) : 0}%` }}
                        ></div>
                    </div>
                </div>

                {tenants.length > 1 && (
                    <div>
                        <h4 className="font-bold text-lg text-gray-800 mb-4">Detalhamento por Unidade</h4>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {tenants.filter(t => activeTenantId === 'all' || t.id === activeTenantId).map(t => {                                
                                const tOccupied = (vehiclesInsideData[t.id] || []).length;
                                const tTotal = t.parkingSpots || 0;
                                const tPercent = tTotal > 0 ? (tOccupied / tTotal) * 100 : 0;
                                
                                return (
                                    <div key={t.id} className="border-b border-gray-100 pb-3 last:border-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-lg text-gray-700">{t.name}</span>
                                            <span className="text-sm text-gray-500">{tOccupied} / {tTotal} vagas ({tPercent.toFixed(0)}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div 
                                                className={`h-full rounded-full ${
                                                    tPercent > 90 ? 'bg-red-500' : tPercent > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                                                }`}
                                                style={{ width: `${Math.min(100, tPercent)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
