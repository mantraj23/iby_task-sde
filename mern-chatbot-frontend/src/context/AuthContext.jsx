import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));

    const setAuthToken = (newToken) => {
        if (newToken) {
            localStorage.setItem('token', newToken);
            setToken(newToken);
        } else {
            localStorage.removeItem('token');
            setToken(null);
        }
    };

    return (
        <AuthContext.Provider value={{ token, setAuthToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);