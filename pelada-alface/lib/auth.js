'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// sessão + perfil + modo "convidado sem conta" num lugar só. O resto da UI só
// pergunta: está logado? é admin? qual jogador é ele?
const AuthCtx = createContext(null);
const GUEST_KEY = 'aa-visitante';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [profile, setProfile] = useState(undefined); // undefined = carregando, null = sem perfil
  const [guest, setGuest] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    // sem perfil (ex.: falha no gatilho de cadastro) = trata como convidado em vez de travar
    setProfile(data || { id: userId, role: 'convidado', email: '', player_id: null });
  }, []);

  useEffect(() => {
    try { setGuest(localStorage.getItem(GUEST_KEY) === '1'); } catch {}
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

  const enterAsGuest = useCallback(() => {
    try { localStorage.setItem(GUEST_KEY, '1'); } catch {}
    setGuest(true);
  }, []);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem(GUEST_KEY); } catch {}
    setGuest(false);
    if (supabase) await supabase.auth.signOut();
  }, []);

  const value = {
    loading: session === undefined || (!!session && profile === undefined),
    session,
    user: session?.user ?? null,
    profile,
    guest: !session && guest,
    canView: !!session || guest,
    isAdmin: profile?.role === 'admin',
    myPlayerId: profile?.player_id ?? null,
    enterAsGuest,
    signOut,
    refreshProfile: () => session && loadProfile(session.user.id),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
