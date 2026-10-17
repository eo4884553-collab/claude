// estilo do "cartão" de login/cadastro/recuperação de senha — compartilhado entre AuthGate e a
// página de redefinir senha (/reset-password), que não passa pelo AuthGate (chega direto do link
// de recuperação do e-mail, antes de qualquer sessão normal existir)
export const wrap = {
  minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#FDF6FA', padding: '24px', fontFamily: "'Public Sans', system-ui, sans-serif",
};
export const card = {
  width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '28px 26px',
  boxShadow: '0 8px 30px rgba(0,0,0,.08)', border: '1px solid #F1D3E5',
};
export const h1 = { fontFamily: "'Fraunces', serif", fontSize: 22, margin: '0 0 6px', color: '#241220' };
export const sub = { fontSize: 13, color: '#6B5566', margin: '0 0 20px' };
export const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#241220', margin: '14px 0 5px' };
export const input = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #F1D3E5', fontSize: 14, fontFamily: 'inherit',
};
export const btn = {
  width: '100%', marginTop: 20, padding: '11px 14px', borderRadius: 8, border: 'none',
  background: '#E01F7F', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
export const btnGhost = {
  width: '100%', marginTop: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid #F1D3E5',
  background: '#FBE9F4', color: '#B8156A', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
};
export const errBox = { marginTop: 14, fontSize: 12.5, color: '#D6323F', background: '#FAE0E2', borderRadius: 8, padding: '9px 11px' };
export const okBox = { marginTop: 14, fontSize: 12.5, color: '#1E8F63', background: '#DCF0E6', borderRadius: 8, padding: '9px 11px' };
