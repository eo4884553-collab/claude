'use client';
import { AuthProvider } from '../lib/auth';
import { DataProvider } from '../lib/data';
import Shell from '../components/Shell';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <DataProvider>
        <Shell>{children}</Shell>
      </DataProvider>
    </AuthProvider>
  );
}
