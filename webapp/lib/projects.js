'use client';

// Cada "projeto" é uma linha separada em project_state (mesma estrutura de
// dados e mesmo motor de cálculo do app, só isolado por id). Para adicionar
// um evento novo: acrescente um item aqui E rode o INSERT correspondente
// no Supabase (ver supabase/schema.sql, seção 6).
export const PROJECTS = [
  { id: 'main', label: 'Piquinzada 2027', emoji: '🎭' },
  { id: 'feijoada-bloco', label: 'Feijoada do Bloco', emoji: '🍲' },
];

export function projectById(id) {
  return PROJECTS.find((p) => p.id === id) || PROJECTS[0];
}
