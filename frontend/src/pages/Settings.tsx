import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure the app to your liking.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Settings options will be added here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nothing to configure yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
