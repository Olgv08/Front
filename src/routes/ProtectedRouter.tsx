import react from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRouter({ children }: { children: react.ReactNode }) {
    const token = localStorage.getItem("token");
    return token ? <>{children}</> : <Navigate to="/" replace />;
}