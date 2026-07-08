import { Button, Card, CardContent, CardHeader, CardTitle } from '@cuewise/ui';

// Placeholder shell. Proves the pipeline end-to-end: the Cuewise theme + design
// system render in the Tauri webview and the platform seams are configured.
// The real extension surfaces (new tab, Pomodoro, Insights) mount here next.
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md border-border bg-surface-elevated">
        <CardHeader>
          <CardTitle className="font-display text-primary">Cuewise for macOS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className="text-secondary">
            The native shell is running. The extension UI, focus timer, and gentle posture / break
            nudges plug in here next.
          </p>
          <div className="flex gap-3">
            <Button variant="primary">Get started</Button>
            <Button variant="outline">Settings</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
