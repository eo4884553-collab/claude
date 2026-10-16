'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// sessão + perfil num lugar só. O resto da UI só pergunta: está logado? foi
// aprovado pelo dono? é admin? qual jogador é ele?
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [profile, setProfile] = useState(undefined); // undefined = carregando, null = sem perfil

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    // sem perfil (ex.: falha no gatilho de cadastro) = trata como convidado em vez de travar
    setProfile(data || { id: userId, role: 'convidado', status: 'pendente', email: '', player_id: null });
  }, []);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session) loadProfile(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        setProfile((atual) => (atual?.id === s.user.id ? atual : undefined));
        loadProfile(s.user.id);
      } else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const value = {
    loading: session === undefined || (!!session && profile === undefined),
    session,
    user: session?.user ?? null,
    profile,
    aprovado: profile?.status === 'aprovado',
    isAdmin: profile?.role === 'admin' && profile?.status === 'aprovado',
    isDono: !!profile?.dono,
    myPlayerId: profile?.player_id ?? null,
    signOut,
    refreshProfile: () => session && loadProfile(session.user.id),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
