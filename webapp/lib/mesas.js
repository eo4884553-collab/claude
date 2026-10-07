'use client';
import { supabase } from './supabaseClient';

const TOTAL_MESAS = 100;

function freshMesa(numero) {
  return { numero, status: 'livre', reservadoPor: '', telefone: '', dataReserva: '', dataPagamento: '', valorPago: 0, pessoas: [], obs: '', reservadoPorUserId: null, reservadoPorEmail: '' };
}

// monta as 100 mesas (livre por padrão) e preenche com as linhas que já têm reserva —
// mesa "livre" simplesmente não tem linha na tabela mesa_reservas pra aquele número
export async function fetchMesasFeijoada(projectId) {
  const { data, error } = await supabase.from('mesa_reservas').select('*').eq('project_id', projectId);
  if (error) throw error;
  const byNumero = new Map((data || []).map((r) => [r.numero, r]));
  return Array.from({ length: TOTAL_MESAS }, (_, i) => {
    const numero = i + 1;
    const row = byNumero.get(numero);
    if (!row) return freshMesa(numero);
    return {
      numero,
      status: row.status,
      reservadoPor: row.reservado_por || '',
      telefone: row.telefone || '',
      dataReserva: row.data_reserva || '',
      dataPagamento: row.data_pagamento || '',
      valorPago: Number(row.valor_pago) || 0,
      pessoas: row.pessoas || [],
      obs: row.obs || '',
      reservadoPorUserId: row.user_id,
      reservadoPorEmail: row.user_email || '',
    };
  });
}

// qualquer usuário aprovado (admin ou convidado) reserva uma mesa livre pra si — pode
// reservar mais de uma. Se outra pessoa reservar a mesma mesa primeiro, o insert falha
// (violação da chave única project_id+numero) e devolvemos um erro amigável.
export async function reservarMesa(projectId, numero, userId, userEmail, nome, telefone) {
  const { error } = await supabase.from('mesa_reservas').insert({
    project_id: projectId, numero, user_id: userId, user_email: userEmail || '',
    reservado_por: nome, telefone: telefone || '',
  });
  if (error) {
    if (error.code === '23505') throw new Error('Essa mesa acabou de ser reservada por outra pessoa — escolha outra.');
    throw error;
  }
}

// o próprio dono ajusta nome/telefone/acompanhantes/obs da própria reserva
export async function atualizarMinhaMesa(projectId, numero, nome, telefone, pessoas, obs) {
  const { error } = await supabase.rpc('update_my_mesa_reserva', {
    p_project: projectId, p_numero: numero, p_nome: nome, p_telefone: telefone || '',
    p_pessoas: pessoas || [], p_obs: obs || '',
  });
  if (error) throw error;
}

// o próprio dono (enquanto não confirmada como paga) ou admin do domínio cancela/libera a mesa
export async function cancelarMesa(projectId, numero) {
  const { error } = await supabase.from('mesa_reservas').delete().match({ project_id: projectId, numero });
  if (error) throw error;
}

// só admin do domínio: confirma pagamento, troca status, ou cria/edita a reserva por completo
export async function adminSalvarMesa(projectId, numero, nome, telefone, pessoas, obs, status, dataPagamento, valorPago) {
  const { error } = await supabase.rpc('admin_save_mesa_reserva', {
    p_project: projectId, p_numero: numero, p_nome: nome, p_telefone: telefone || '',
    p_pessoas: pessoas || [], p_obs: obs || '', p_status: status,
    p_data_pagamento: dataPagamento || null, p_valor_pago: Number(valorPago) || 0,
  });
  if (error) throw error;
}
