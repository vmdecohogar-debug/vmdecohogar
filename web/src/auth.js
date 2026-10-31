import { createContext, useContext } from 'react';

export const AuthCtx = createContext({ user: null });
export const useAuth = () => useContext(AuthCtx);
