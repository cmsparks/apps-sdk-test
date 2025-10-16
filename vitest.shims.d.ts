
declare module 'vitest' {
    export interface ProvidedContext {
      testServerHost: string
    }
  }
  
  // mark this file as a module so augmentation works correctly
  export {}