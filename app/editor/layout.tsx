export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100dvh',
        minHeight: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}
