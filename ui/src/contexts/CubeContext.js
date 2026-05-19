import React, { createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';

const CubeContext = createContext(null);

export function CubeProvider({ children }) {
  const { cube } = useParams();
  return <CubeContext.Provider value={cube}>{children}</CubeContext.Provider>;
}

export function useCube() {
  const cube = useContext(CubeContext);
  if (!cube) {
    throw new Error('useCube called outside CubeProvider');
  }
  return cube;
}
