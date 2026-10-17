/// <reference types="vite/client" />

declare module '*.css' {
  const css: string;
  export default css;
}

declare module 'virtual:craft-style.css';
