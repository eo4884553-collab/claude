'use client';
import AuthGate from '../../components/AuthGate';
import AdminUsers from '../../components/AdminUsers';

export default function AdminPage() {
  return (
    <AuthGate>
      {(auth) => auth.isAdmin
        ? <AdminUsers myId={auth.user.id} />
        : (
          <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', fontFamily: "'Public Sans', system-ui, sans-serif" }}>
            <p>Esta página é só para administradores.</p>
            <a href="/" style={{ color: '#B8156A', fontWeight: 600 }}>← Voltar para o app</a>
          </div>
        )}
    </AuthGate>
  );
}
