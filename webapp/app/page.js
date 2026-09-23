'use client';
import { useState, useEffect } from 'react';
import AuthGate from '../components/AuthGate';
import PmoFrame from '../components/PmoFrame';
import { PROJECTS, projectById } from '../lib/projects';

const LAST_PROJECT_KEY = 'pmo_last_project_id';

export default function Home() {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PROJECT_KEY);
      if (saved && PROJECTS.some((p) => p.id === saved)) setProjectId(saved);
    } catch (_) {}
  }, []);

  function changeProject(id) {
    setProjectId(id);
    try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch (_) {}
  }

  return (
    <AuthGate>
      {(auth) => <PmoFrame auth={auth} project={projectById(projectId)} onChangeProject={changeProject} />}
    </AuthGate>
  );
}
