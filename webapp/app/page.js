'use client';
import AuthGate from '../components/AuthGate';
import PmoFrame from '../components/PmoFrame';

export default function Home() {
  return (
    <AuthGate>
      {(auth) => <PmoFrame auth={auth} />}
    </AuthGate>
  );
}
