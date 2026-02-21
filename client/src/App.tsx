import { ChatShell } from './components/ChatShell.js';
import { AuthGuard } from './auth/AuthGuard.js';

export default function App() {
  return (
    <AuthGuard>
      <ChatShell />
    </AuthGuard>
  );
}
