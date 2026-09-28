'use client';
import { useEffect, useState } from 'react';
import AuthGate from '../../components/AuthGate';
import AdminUsers from '../../components/AdminUsers';
import ProjectRolesSection from '../../components/ProjectRolesSection';
import { PROJECTS } from '../../lib/projects';
import { fetchProjectAdminIds } from '../../lib/roles';

const wrap = { maxWidth: 760, margin: '0 auto', padding: '28px 20px', fontFamily: "'Public Sans', system-ui, sans-serif" };
const h1 = { fontFamily: "'Fraunces', serif", fontSize: 24, margin: '0 0 4px', color: '#241220' };
const backLink = { fontSize: 13, color: '#B8156A', textDecoration: 'none', fontWeight: 600 };

// Admin GLOBAL vê a tela inteira (aprovar cadastros + papel global + papel por
// projeto de todos os domínios). Quem só é administrador de um projeto específico
// (via exceção em project_roles) vê uma versão enxuta, só com os projetos dele.
function ProjectOnlyAdmin({ myId, projectIds }) {
  const projects = PROJECTS.filter((p) => projectIds.includes(p.id));
  return (
    <div style={wrap}>
      <a href="/" style={backLink}>← Voltar para o app</a>
      <h1 style={{ ...h1, marginTop: 14 }}>Administradores por projeto</h1>
      <ProjectRolesSection projects={projects} myId={myId} />
    </div>
  );
}

// componente de verdade (nao um closure inline) pra poder usar hooks — o children
// do AuthGate so e chamado depois de aprovado, entao hooks direto ali quebrariam
// a regra de hooks (chamados um numero diferente de vezes entre renders)
function AdminGate({ auth }) {
  const [projectAdminIds, setProjectAdminIds] = useState(null); // null = carregando

  useEffect(() => {
    if (auth.isAdmin) { setProjectAdminIds([]); return; } // admin global não precisa disso
    let cancelled = false;
    fetchProjectAdminIds(auth.user.id).then((ids) => { if (!cancelled) setProjectAdminIds(ids); });
    return () => { cancelled = true; };
  }, [auth.user?.id, auth.isAdmin]);

  if (auth.isAdmin) return <AdminUsers myId={auth.user.id} />;
  if (projectAdminIds === null) {
    return <div style={wrap}><p>Carregando…</p></div>;
  }
  if (projectAdminIds.length > 0) {
    return <ProjectOnlyAdmin myId={auth.user.id} projectIds={projectAdminIds} />;
  }
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', fontFamily: "'Public Sans', system-ui, sans-serif" }}>
      <p>Esta página é só para administradores.</p>
      <a href="/" style={{ color: '#B8156A', fontWeight: 600 }}>← Voltar para o app</a>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthGate>
      {(auth) => <AdminGate auth={auth} />}
    </AuthGate>
  );
}
