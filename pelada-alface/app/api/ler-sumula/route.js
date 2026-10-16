import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const JOGADOR = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'gols', 'amarelos', 'vermelhos', 'goleiro'],
  properties: {
    nome: { type: 'string' },
    gols: { type: 'integer' },
    amarelos: { type: 'integer' },
    vermelhos: { type: 'integer' },
    goleiro: { type: 'boolean' },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'branco', 'verde', 'gols_sem_autor_branco', 'gols_sem_autor_verde', 'observacoes'],
  properties: {
    data: { type: 'string', description: 'AAAA-MM-DD, ou vazio se não estiver na foto' },
    branco: { type: 'array', items: JOGADOR },
    verde: { type: 'array', items: JOGADOR },
    gols_sem_autor_branco: { type: 'integer' },
    gols_sem_autor_verde: { type: 'integer' },
    observacoes: { type: 'string', description: 'dúvidas de leitura para o administrador conferir; vazio se nenhuma' },
  },
};

function instrucoes(nomes, hoje) {
  return `Você lê a súmula (foto de papel, quadro ou print de planilha) de uma pelada de futebol amador de sábado, a "Pelada Amigos do Alface".
Os dois times se chamam BRANCO e VERDE. A súmula costuma ter uma coluna por time com o nome/apelido de cada atleta e, ao lado, os gols dele (número, tracinhos ou bolinhas). Pode haver uma seção "GOLEIROS". Cartões aparecem como "CA"/"amarelo"/quadradinho amarelo e "CV"/"vermelho".

Atletas já cadastrados (use EXATAMENTE esta grafia quando o nome da foto for claramente um deles, mesmo com abreviação ou erro de letra):
${nomes.join(', ')}

Regras:
- Liste todo atleta escalado em cada time, mesmo sem gol (gols 0).
- Nome que não bate com nenhum cadastrado: escreva em MAIÚSCULAS como está na foto.
- Gol sem autor identificado ou gol contra: some em gols_sem_autor_<time que se beneficiou>.
- Se houver placar escrito e ele não bater com a soma dos gols, explique em observacoes.
- data: a data da partida se aparecer (hoje é ${hoje}; a pelada é sempre sábado). Vazio se não houver.
- Qualquer leitura incerta vai em observacoes, em português, curto.`;
}

export async function POST(req) {
  // 1) só administrador logado pode usar (cada leitura custa crédito da API)
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  const { data: isAdmin } = await sb.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'Apenas administradores.' }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'Leitura por foto não configurada: falta a variável ANTHROPIC_API_KEY no Vercel (veja o README).' }, { status: 500 });
  }

  const { imagem, tipo } = await req.json();
  if (!imagem || !/^image\/(jpeg|png|webp|gif)$/.test(tipo || '')) {
    return Response.json({ error: 'Envie uma imagem JPG ou PNG.' }, { status: 400 });
  }

  const { data: players } = await sb.from('players').select('nome').order('nome');
  const nomes = (players || []).map((p) => p.nome);
  const hoje = new Date().toISOString().slice(0, 10);

  const client = new Anthropic();
  try {
    const resp = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: imagem } },
          { type: 'text', text: instrucoes(nomes, hoje) },
        ],
      }],
    });
    if (resp.stop_reason === 'refusal') {
      return Response.json({ error: 'Não foi possível ler esta imagem. Tente outra foto ou lance manualmente.' }, { status: 422 });
    }
    const texto = resp.content.find((b) => b.type === 'text')?.text;
    if (!texto) return Response.json({ error: 'A leitura veio vazia. Tente uma foto mais nítida.' }, { status: 422 });
    return Response.json(JSON.parse(texto));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: 'Chave ANTHROPIC_API_KEY inválida.' }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: 'Muitas leituras seguidas. Aguarde um minuto e tente de novo.' }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json({ error: `Falha na leitura (${e.status}). Tente de novo.` }, { status: 502 });
    }
    return Response.json({ error: e.message || 'Erro inesperado.' }, { status: 500 });
  }
}
