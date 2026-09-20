// Vite emits audio imports as URLs into assets/. Declared here because the
// project does not pull in vite/client's ambient types.
declare module '*.ogg' {
  const url: string;
  export default url;
}
