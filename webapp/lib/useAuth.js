'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// centraliza sessao + perfil (role/status) do usuario logado. Um unico lugar
// que sabe "quem e, e o que essa pessoa pode fazer" — todo o resto da UI so
// le o que este hook devolve.
export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = ainda carregando
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) { setProfile(null); return; }
    setProfileLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(error ? null : data);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session?.user?.id) loadProfile(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) loadProfile(newSession.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = useCallback(async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase não configurado.' } };
    return supabase.auth.signUp({ email, password });
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase não configurado.' } };
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  // dispara o e-mail de recuperação de senha do Supabase — o Supabase nunca guarda a senha em
  // texto puro (só o hash), então não dá pra "reenviar a senha antiga": o link do e-mail leva a
  // pessoa pra /reset-password, aqui no próprio app, pra ela DEFINIR uma senha nova
  const resetPasswordForEmail = useCallback(async (email) => {
    if (!supabase) return { error: { message: 'Supabase não configurado.' } };
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
    return supabase.auth.resetPasswordForEmail(email, { redirectTo });
  }, []);

  // só funciona depois que a pessoa chegou em /reset-password a partir do link do e-mail (o
  // Supabase já estabelece uma sessão de recuperação sozinho, lendo o token da própria URL)
  const updatePassword = useCallback(async (newPassword) => {
    if (!supabase) return { error: { message: 'Supabase não configurado.' } };
    return supabase.auth.updateUser({ password: newPassword });
  }, []);

  const refreshProfile = useCallback(() => {
    if (session?.user?.id) loadProfile(session.user.id);
  }, [session, loadProfile]);

  return {
    loading: session === undefined || (session && profileLoading && !profile),
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin' && profile?.status === 'approved',
    isApproved: profile?.status === 'approved',
    signUp,
    signIn,
    signOut,
    refreshProfile,
    resetPasswordForEmail,
    updatePassword,
  };
}
