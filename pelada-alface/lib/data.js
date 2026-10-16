'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { calcular, temporadas } from './stats';

// carrega tudo de uma vez (uma temporada inteira tem ~50 rodadas x ~35 atletas,
// é pouco) e calcula os rankings no navegador — assim todas as telas mostram
// exatamente os mesmos números.
const DataCtx = createContext(null);
const ANO_KEY = 'aa-temporada';

async function fetchAll(table, columns = '*') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export function DataProvider({ children }) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [ano, setAnoState] = useState(new Date().getFullYear());

  const reload = useCallback(async () => {
    if (!supabase) return;
    try {
      const [players, matches, matchPlayers, settings] = await Promise.all([
        fetchAll('players'),
        fetchAll('matches'),
        fetchAll('match_players'),
        supabase.from('settings').select('*').eq('id', 'main').maybeSingle().then((r) => r.data),
      ]);
      setRaw({ players, matches, matchPlayers, settings: settings || { min_jogos_pct: 0.4 } });
      setError('');
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(ANO_KEY);
      if (salvo) setAnoState(salvo === 'todas' ? 'todas' : Number(salvo));
    } catch {}
    reload();
  }, [reload]);

  const setAno = useCallback((a) => {
    setAnoState(a);
    try { localStorage.setItem(ANO_KEY, String(a)); } catch {}
  }, []);

  const anos = useMemo(() => (raw ? temporadas(raw.matches) : []), [raw]);
  // se a temporada escolhida não tem jogos (ex.: virou o ano), mostra a mais recente
  const anoEfetivo = raw && ano !== 'todas' && !anos.includes(ano) ? anos[0] : ano;

  const stats = useMemo(() => {
    if (!raw) return null;
    return calcular({ ...raw, ano: anoEfetivo, minJogosPct: Number(raw.settings.min_jogos_pct) });
  }, [raw, anoEfetivo]);

  const value = { raw, stats, error, reload, ano: anoEfetivo, setAno, anos, loading: !raw && !error };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
